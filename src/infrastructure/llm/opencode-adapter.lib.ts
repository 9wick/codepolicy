import { fromThrowable } from 'neverthrow';

import { LlmResponseParseError } from './llm-provider';

export const safeJsonParse = fromThrowable(
  (text: string): unknown => JSON.parse(text),
  (cause) => new LlmResponseParseError('Failed to parse OpenCode response as JSON', cause),
);
