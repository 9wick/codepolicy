import { InjectionToken } from '@needle-di/core';
import { TypeSafeClient, type TypeSafeClientConfig } from '@typesafe-ai/sdk';
import { err, Result } from 'neverthrow';

import type { NoulRequest } from '../../shared/decision-types';

export type DecisionClient = {
  readonly systemOne: (request: NoulRequest) => Promise<unknown>;
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
    systemOne: async (request: NoulRequest): Promise<unknown> => client.systemOne(request),
  }));
}
