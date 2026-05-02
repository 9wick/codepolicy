import { type Result, err, ok } from 'neverthrow';

import { getAppContainer } from '../../shared/container';
import { CreateLogger } from '../../shared/logger';

import type { LlmProvider } from './llm-provider';
import { AnthropicProvider } from './anthropic.adapter';
import { CodexProvider } from './codex.adapter';
import { OpenCodeProvider } from './opencode.adapter';

const ANTHROPIC_PREFIXES = ['claude-'];
const OPENAI_PREFIXES = ['gpt-', 'o1-', 'o3-', 'codex-'];

export function resolveProvider(model: string, workingDir: string): Result<LlmProvider, Error> {
  const container = getAppContainer();
  const createLogger = container.get(CreateLogger);

  if (model.includes('/')) {
    return ok(container.get(OpenCodeProvider));
  }
  if (ANTHROPIC_PREFIXES.some((p) => model.startsWith(p))) {
    return ok(new AnthropicProvider(workingDir, createLogger('AnthropicProvider')));
  }
  if (OPENAI_PREFIXES.some((p) => model.startsWith(p))) {
    return ok(new CodexProvider(createLogger('CodexProvider')));
  }
  return err(
    new Error(
      `Unsupported model: "${model}". Use "provider/model" format for OpenCode (e.g. "anthropic/claude-sonnet-4-5"), or a supported prefix: ${[...ANTHROPIC_PREFIXES, ...OPENAI_PREFIXES].join(', ')}`,
    ),
  );
}
