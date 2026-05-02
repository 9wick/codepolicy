import {
  query,
  type ModelUsage,
  type Options,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { type Static, type TSchema } from '@sinclair/typebox';
import { injectable } from '@needle-di/core';
import { type Result, ResultAsync, err, ok } from 'neverthrow';

import type { LlmConfig, TokenUsage } from '../../shared/types';
import type { Logger } from '../../shared/logger';

import { DEFAULT_MAX_TURNS, DEFAULT_OPTIONS, HAIKU_MAX_TURNS } from './anthropic-adapter.lib';
import type { LlmPrompt, LlmResponse, LlmStructuredRequest } from './llm-provider';
import { validateBySchema } from './llm-provider';

function extractStructuredOutputFromToolUse(message: SDKMessage): unknown {
  if (message.type !== 'assistant') return undefined;
  for (const block of message.message.content) {
    if (block.type === 'tool_use' && block.name === 'StructuredOutput') {
      return block.input;
    }
  }
  return undefined;
}

function sumModelUsage(modelUsage: Record<string, ModelUsage>): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadInputTokens = 0;
  let cacheCreationInputTokens = 0;
  for (const mu of Object.values(modelUsage)) {
    inputTokens += mu.inputTokens + mu.cacheReadInputTokens + mu.cacheCreationInputTokens;
    outputTokens += mu.outputTokens;
    cacheReadInputTokens += mu.cacheReadInputTokens;
    cacheCreationInputTokens += mu.cacheCreationInputTokens;
  }
  return {
    inputTokens,
    outputTokens,
    reasoningTokens: 0,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  };
}

type ExtractedResult = { output: unknown; usage: TokenUsage };

function extractUsageFromResult(lastResultMessage: SDKMessage | undefined): TokenUsage {
  if (lastResultMessage?.type === 'result') {
    return sumModelUsage(lastResultMessage.modelUsage);
  }
  return {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
}

function logSdkMessage(message: SDKMessage, log: Logger): void {
  if (message.type === 'assistant') {
    log.debug('assistant');
    for (const block of message.message.content) {
      if (block.type === 'text') log.debug(`  text: ${block.text}`);
      if (block.type === 'tool_use')
        log.debug(`  tool_use ${block.name}: ${JSON.stringify(block.input)}`);
    }
  } else if (message.type === 'result') {
    log.debug(`result (${message.subtype})`);
    log.debug(`  turns: ${message.num_turns}, duration: ${message.duration_ms}ms`);
    log.debug(`  modelUsage: ${JSON.stringify(message.modelUsage)}`);
  } else {
    log.debug(message.type);
  }
}

function extractFromSuccessResult(message: SDKMessage): ExtractedResult | undefined {
  if (message.type !== 'result') return undefined;
  if (message.subtype === 'success' && message.structured_output !== undefined) {
    return { output: message.structured_output, usage: sumModelUsage(message.modelUsage) };
  }
  return undefined;
}

async function collectQueryResult(messages: AsyncIterable<SDKMessage>, log: Logger) {
  let structuredOutputFromToolUse: unknown;
  let lastResultMessage: SDKMessage | undefined;

  for await (const message of messages) {
    logSdkMessage(message, log);

    if (message.type === 'result') lastResultMessage = message;
    const directResult = extractFromSuccessResult(message);
    if (directResult) return ok(directResult);

    const toolUseOutput = extractStructuredOutputFromToolUse(message);
    if (toolUseOutput !== undefined) {
      structuredOutputFromToolUse = toolUseOutput;
    }
  }

  if (structuredOutputFromToolUse !== undefined) {
    return ok({
      output: structuredOutputFromToolUse,
      usage: extractUsageFromResult(lastResultMessage),
    });
  }

  return err(new Error('Claude Agent SDK did not return a successful result message'));
}

function extractQueryResult(
  messages: AsyncIterable<SDKMessage>,
  log: Logger,
): ResultAsync<ExtractedResult, Error> {
  return new ResultAsync(
    collectQueryResult(messages, log).catch(
      (cause: unknown): Result<ExtractedResult, Error> =>
        err(cause instanceof Error ? cause : new Error(String(cause))),
    ),
  );
}

function isHaikuModel(model: string): boolean {
  return model.includes('haiku');
}

function toAnthropicOptions(
  prompt: LlmPrompt,
  config: LlmConfig,
  returnSchema: TSchema,
  cwd: string,
): Options {
  return {
    ...DEFAULT_OPTIONS,
    maxTurns: isHaikuModel(config.model) ? HAIKU_MAX_TURNS : DEFAULT_MAX_TURNS,
    cwd,
    model: config.model,
    systemPrompt: prompt.system,
    outputFormat: {
      type: 'json_schema',
      schema: returnSchema,
    },
  };
}

@injectable()
export class AnthropicProvider {
  constructor(
    private workingDir: string,
    private log: Logger,
  ) {}

  generate<Schema extends TSchema>({
    prompt,
    config,
    returnSchema,
  }: LlmStructuredRequest<Schema>): ResultAsync<LlmResponse<Static<Schema>>, Error> {
    return extractQueryResult(
      query({
        prompt: prompt.user,
        options: toAnthropicOptions(prompt, config, returnSchema, this.workingDir),
      }),
      this.log,
    ).andThen(({ output, usage }) =>
      validateBySchema(output, returnSchema).map((validated) => ({ output: validated, usage })),
    );
  }
}
