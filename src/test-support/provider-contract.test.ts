import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';

import type { NoulRequest, NoulResponse } from '../shared/decision-types';

import { expectDecisionContract, expectStructuredContract } from './provider-contract';

const request: NoulRequest = {
  model: 'jev-1.13.0',
  state: { value: '2' },
  questions: { check: { type: 'noul', instructions: 'The value equals 2.' } },
};
const response: NoulResponse = {
  model: 'jev-1.13.0',
  probabilities: { check: 0.5 },
  usage: {
    inputTokens: 1,
    outputTokens: 1,
    reasoningTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  },
};
const schema = Type.Object({ status: Type.Literal('ok') });
const invalidProbabilities: Readonly<Record<string, number>>[] = [
  {},
  { check: 0.5, extra: 0 },
  { check: -0.1 },
  { check: 1.1 },
  { check: NaN },
  { check: Infinity },
];

describe('shared provider contract assertions', () => {
  it.each([0, 0.5, 1])(
    'accepts a valid decision response without assuming accuracy: %s',
    (probability) => {
      expect(() =>
        expectDecisionContract(request, { ...response, probabilities: { check: probability } }),
      ).not.toThrow();
    },
  );
  it.each(invalidProbabilities)(
    'rejects missing/extra IDs or invalid probabilities: %j',
    (probabilities) => {
      expect(() => expectDecisionContract(request, { ...response, probabilities })).toThrow();
    },
  );
  it('rejects an empty response model', () => {
    expect(() => expectDecisionContract(request, { ...response, model: '' })).toThrow();
  });
  it('accepts structured output matching the requested schema', () => {
    expect(() =>
      expectStructuredContract(schema, { output: { status: 'ok' }, usage: response.usage }),
    ).not.toThrow();
  });
  it('rejects structured output that violates the requested schema', () => {
    expect(() =>
      expectStructuredContract(schema, { output: { status: 'wrong' }, usage: response.usage }),
    ).toThrow();
  });
  it.each([-1, 0.5, NaN, Infinity])(
    'rejects invalid usage in both contracts: %s',
    (inputTokens) => {
      const usage = { ...response.usage, inputTokens };
      expect(() => expectDecisionContract(request, { ...response, usage })).toThrow();
      expect(() => expectStructuredContract(schema, { output: { status: 'ok' }, usage })).toThrow();
    },
  );
});
