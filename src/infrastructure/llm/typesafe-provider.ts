import { Type } from '@sinclair/typebox';
import { err, ok, ResultAsync, type Result } from 'neverthrow';

import type { DecisionProvider, NoulResponse } from '../../shared/decision-types';

import { validateBySchema } from './llm-provider';
import type { DecisionClient } from './typesafe-client';

const responseSchema = Type.Object({
  model: Type.String({ minLength: 1 }),
  answers: Type.Record(
    Type.String(),
    Type.Object({
      type: Type.Literal('noul'),
      noul: Type.Number({ minimum: 0, maximum: 1 }),
    }),
  ),
  usage: Type.Object({
    input_tokens: Type.Integer({ minimum: 0 }),
    output_tokens: Type.Integer({ minimum: 0 }),
  }),
});

export function validateNoulResponse(
  raw: unknown,
  expectedIds: readonly string[],
): Result<NoulResponse, Error> {
  return validateBySchema(raw, responseSchema).andThen((response) => {
    const ids = Object.keys(response.answers);
    if (ids.length !== expectedIds.length || !expectedIds.every((id) => ids.includes(id))) {
      return err(new Error('TypeSafe answer IDs do not match the questions.'));
    }
    return ok({
      model: response.model,
      probabilities: Object.fromEntries(
        Object.entries(response.answers).map(([id, answer]) => [id, answer.noul]),
      ),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        reasoningTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    });
  });
}

function toRequestError(cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new Error(`TypeSafe API request failed: ${message}`, { cause });
}

export function createDecisionProvider(
  createClient: () => Result<DecisionClient, Error>,
): DecisionProvider {
  return {
    ask: (request) =>
      createClient().asyncAndThen((client) =>
        ResultAsync.fromPromise(client.systemOne(request), toRequestError).andThen((raw) =>
          validateNoulResponse(raw, Object.keys(request.questions)),
        ),
      ),
  };
}
