import { inject, injectable } from '@needle-di/core';
import { type OpencodeClient, type Part } from '@opencode-ai/sdk/v2';
import { type Static, type TSchema } from '@sinclair/typebox';
import { type Result, ResultAsync, err, errAsync, ok } from 'neverthrow';

import { CreateLogger, type Logger } from '../../shared/logger';
import type { TokenUsage } from '../../shared/types';

import type { LlmResponse, LlmStructuredRequest } from './llm-provider';
import { validateBySchema } from './llm-provider';
import { safeJsonParse } from './opencode-adapter.lib';
import { validateModelExistsMemoized } from './opencode-model-validator.lib';
import { OpenCodeServerManager } from './opencode-server-manager';

function parseModel(model: string): Result<{ providerID: string; modelID: string }, Error> {
  const slashIndex = model.indexOf('/');
  if (slashIndex === -1) {
    return err(
      new Error(
        `Invalid OpenCode model format: "${model}". Expected "provider/model" (e.g. "anthropic/claude-sonnet-4-5").`,
      ),
    );
  }
  return ok({
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  });
}

function extractUsageFromParts(parts: Part[]): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let cacheReadInputTokens = 0;
  let cacheCreationInputTokens = 0;
  for (const part of parts) {
    if (part.type === 'step-finish') {
      inputTokens += part.tokens.input;
      outputTokens += part.tokens.output;
      reasoningTokens += part.tokens.reasoning;
      cacheReadInputTokens += part.tokens.cache.read;
      cacheCreationInputTokens += part.tokens.cache.write;
    }
  }
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  };
}

function extractStructuredOutput(parts: Part[]): Result<unknown, Error> {
  for (const part of parts) {
    if (
      part.type === 'tool' &&
      part.tool === 'StructuredOutput' &&
      part.state.status === 'completed'
    ) {
      return ok(part.state.input);
    }
  }

  // Fallback: extract text and parse as JSON
  const text = parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');

  if (!text) {
    return err(new Error('OpenCode response contained no text or structured output'));
  }
  return safeJsonParse(text).mapErr((e) => new Error(`${e.message} (text: ${text.slice(0, 200)})`));
}

function createSession(client: OpencodeClient): ResultAsync<string, Error> {
  return ResultAsync.fromPromise(
    client.session.create(),
    (cause) =>
      new Error(
        `OpenCode API request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
  ).andThen((res) =>
    res.data ? ok(res.data.id) : err(new Error('Failed to create OpenCode session')),
  );
}

function formatStepFinish(part: Part & { type: 'step-finish' }): string {
  const { tokens } = part;
  const extras: string[] = [];
  if (tokens.reasoning > 0) extras.push(`reasoning=${tokens.reasoning}`);
  if (tokens.cache.read > 0 || tokens.cache.write > 0)
    extras.push(`cache read=${tokens.cache.read} write=${tokens.cache.write}`);
  const suffix = extras.length > 0 ? ` | ${extras.join(' | ')}` : '';
  return `step-finish: tokens in=${tokens.input} out=${tokens.output}${suffix}`;
}

function logOpenCodePart(part: Part, log: Logger): void {
  if (part.type === 'text') {
    log.debug(`text: ${part.text}`);
  } else if (part.type === 'tool') {
    log.debug(`tool ${part.tool} (${part.state.status}): ${JSON.stringify(part.state.input)}`);
  } else if (part.type === 'step-finish') {
    log.debug(formatStepFinish(part));
  } else {
    log.debug(part.type);
  }
}

function logOpenCodeParts(parts: Part[], log: Logger): void {
  log.debug(`response (${parts.length} parts)`);
  for (const part of parts) logOpenCodePart(part, log);
}

function sendPrompt<Schema extends TSchema>(
  client: OpencodeClient,
  sessionID: string,
  prompt: { system: string; user: string },
  model: { providerID: string; modelID: string },
  returnSchema: Schema,
  log: Logger,
): ResultAsync<{ output: unknown; usage: TokenUsage }, Error> {
  return ResultAsync.fromPromise(
    client.session.prompt({
      sessionID,
      model,
      agent: 'codepolicy',
      system: prompt.system,
      tools: {},
      parts: [{ type: 'text', text: prompt.user }],
      format: { type: 'json_schema', schema: returnSchema },
    }),
    (cause) =>
      new Error(
        `OpenCode API request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
  ).andThen((res) => {
    if (!res.data?.parts) {
      return err(
        new Error(
          `OpenCode prompt returned no response (data keys: ${res.data ? Object.keys(res.data).join(', ') : 'none'})`,
        ),
      );
    }
    logOpenCodeParts(res.data.parts, log);
    const usage = extractUsageFromParts(res.data.parts);
    return extractStructuredOutput(res.data.parts).map((output) => ({ output, usage }));
  });
}

@injectable()
export class OpenCodeProvider {
  constructor(
    private serverManager = inject(OpenCodeServerManager),
    private log = inject(CreateLogger)('OpenCodeProvider'),
  ) {}

  generate<Schema extends TSchema>({
    prompt,
    config,
    returnSchema,
  }: LlmStructuredRequest<Schema>): ResultAsync<LlmResponse<Static<Schema>>, Error> {
    const modelResult = parseModel(config.model);
    if (modelResult.isErr()) {
      return errAsync(modelResult.error);
    }
    const model = modelResult.value;

    return this.serverManager
      .acquire()
      .map(({ client }) => client)
      .andThen((client) => validateModelExistsMemoized(client, model).map(() => client))
      .andThen((client) => createSession(client).map((sessionID) => ({ client, sessionID })))
      .andThen(({ client, sessionID }) =>
        sendPrompt(client, sessionID, prompt, model, returnSchema, this.log),
      )
      .andThen(({ output, usage }) =>
        validateBySchema(output, returnSchema).map((validated) => ({ output: validated, usage })),
      )
      .map((result) => {
        this.serverManager.release();
        return result;
      })
      .mapErr((error) => {
        this.serverManager.release();
        return error;
      });
  }
}
