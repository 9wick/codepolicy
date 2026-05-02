import { type Static, type TSchema } from '@sinclair/typebox';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import { type Result, type ResultAsync, err, ok } from 'neverthrow';

import type { LlmConfig, TokenUsage } from '../../shared/types';

// --- Shared types ---

export type LlmPrompt = {
  system: string;
  user: string;
};

export type LlmStructuredRequest<Schema extends TSchema> = {
  prompt: LlmPrompt;
  config: LlmConfig;
  returnSchema: Schema;
};

export class LlmResponseParseError extends Error {
  constructor(
    message: string,
    readonly parseCause?: unknown,
  ) {
    super(message);
    this.name = 'LlmResponseParseError';
  }
}

// --- Provider interface ---

export type LlmResponse<T> = {
  output: T;
  usage: TokenUsage;
};

export type LlmProvider = {
  generate: <Schema extends TSchema>(
    req: LlmStructuredRequest<Schema>,
  ) => ResultAsync<LlmResponse<Static<Schema>>, Error>;
};

// --- Schema validation ---

const ajv = new Ajv({
  allErrors: false,
  strict: false,
});

function formatSchemaPath(error: ErrorObject): string {
  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    return error.params.missingProperty;
  }
  return error.instancePath.replace(/^\//, '').replaceAll('/', '.');
}

function formatSchemaError(error: ErrorObject | undefined): string {
  if (!error) {
    return 'validation failed.';
  }
  const path = formatSchemaPath(error);
  if (path === '') {
    return error.message ?? 'validation failed.';
  }
  return `${path}: ${error.message ?? 'validation failed.'}`;
}

export function validateBySchema<Schema extends TSchema>(
  value: unknown,
  schema: Schema,
): Result<Static<Schema>, LlmResponseParseError> {
  const validator: ValidateFunction<Static<Schema>> = ajv.compile<Static<Schema>>(schema);
  if (!validator(value)) {
    return err(
      new LlmResponseParseError(
        `LLM response does not match return schema: ${formatSchemaError(validator.errors?.[0])}.`,
      ),
    );
  }
  return ok(value);
}
