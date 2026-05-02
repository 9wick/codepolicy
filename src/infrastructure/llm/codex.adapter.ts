import { Codex, type ThreadOptions } from '@openai/codex-sdk';
import { type Static, type TSchema } from '@sinclair/typebox';
import { injectable } from '@needle-di/core';
import { ResultAsync } from 'neverthrow';

import type { LlmConfig, TokenUsage } from '../../shared/types';
import type { Logger } from '../../shared/logger';

import { safeJsonParse } from './codex-adapter.lib';
import type { LlmResponse, LlmStructuredRequest } from './llm-provider';
import { validateBySchema } from './llm-provider';

type CodexTurnResult = { input_tokens?: number; output_tokens?: number };

function extractCodexUsage(turnUsage: CodexTurnResult | null | undefined): TokenUsage {
  return {
    inputTokens: turnUsage?.input_tokens ?? 0,
    outputTokens: turnUsage?.output_tokens ?? 0,
    reasoningTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
}

function logCodexResult(response: string, usage: TokenUsage, log: Logger): void {
  log.debug(`response: ${response.slice(0, 500)}`);
  log.debug(`usage: in=${usage.inputTokens} out=${usage.outputTokens}`);
}

function buildCodexThreadOptions(config: LlmConfig): ThreadOptions {
  const options: ThreadOptions = {
    model: config.model,
    sandboxMode: 'read-only',
    approvalPolicy: 'never',
    skipGitRepoCheck: true,
  };

  if (config.reasoningEffort !== undefined) {
    options.modelReasoningEffort = config.reasoningEffort;
  }

  return options;
}

@injectable()
export class CodexProvider {
  constructor(private log: Logger) {}

  generate<Schema extends TSchema>({
    prompt,
    config,
    returnSchema,
  }: LlmStructuredRequest<Schema>): ResultAsync<LlmResponse<Static<Schema>>, Error> {
    const codex = new Codex();
    const thread = codex.startThread(buildCodexThreadOptions(config));
    const fullPrompt = `${prompt.system}\n\n${prompt.user}`;

    return ResultAsync.fromPromise(
      thread.run(fullPrompt, { outputSchema: returnSchema }),
      (cause) =>
        new Error(
          `Codex API request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        ),
    )
      .map((turn) => {
        const usage = extractCodexUsage(turn.usage);
        logCodexResult(turn.finalResponse, usage, this.log);
        return { response: turn.finalResponse, usage };
      })
      .andThen(({ response, usage }) =>
        safeJsonParse(response).map((parsed) => ({ parsed, usage })),
      )
      .andThen(({ parsed, usage }) =>
        validateBySchema(parsed, returnSchema).map((output) => ({ output, usage })),
      );
  }
}
