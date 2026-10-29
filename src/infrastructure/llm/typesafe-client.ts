import { InjectionToken } from '@needle-di/core';
import { TypeSafeClient, type TypeSafeClientConfig } from '@typesafe-ai/sdk';
import { err, Result } from 'neverthrow';

import type { DecisionRequest } from '../../shared/decision-types';

export type DecisionClient = {
  readonly systemOne: (request: DecisionRequest) => Promise<unknown>;
};

export const CreateDecisionClient = new InjectionToken<() => Result<DecisionClient, Error>>(
  'CreateDecisionClient',
);

type ClientOptions = Pick<TypeSafeClientConfig, 'apiKey' | 'fetch' | 'baseURL' | 'timeout'>;

export function createTypeSafeClient(options: ClientOptions = {}): Result<DecisionClient, Error> {
  if (options.apiKey !== undefined && options.apiKey.trim() === '') {
    return err(new Error('TYPESAFE_API_KEY must not be empty.'));
  }
  return Result.fromThrowable(
    () =>
      new TypeSafeClient({
        ...options,
        timeout: options.timeout ?? 45_000,
        retry: { maxRetries: 0 },
        logLevel: 'off',
      }),
    (cause: unknown) => (cause instanceof Error ? cause : new Error(String(cause))),
  )().map((client) => ({
    systemOne: async (request: DecisionRequest): Promise<unknown> => {
      const questions: Record<
        string,
        | { type: 'noul'; instructions: string }
        | {
            type: 'choice';
            instructions: string;
            criteria: Readonly<Record<string, string>>;
          }
      > = {};
      for (const [id, question] of Object.entries(request.questions)) {
        questions[id] =
          question.type === 'choice'
            ? {
                type: 'choice',
                instructions: question.instructions,
                criteria: question.criteria,
              }
            : question;
      }
      return client.systemOne({ ...request, questions });
    },
  }));
}
