import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';

import type { DecisionRequest, DecisionResponse } from '../shared/decision-types';

import { expectDecisionContract, expectStructuredContract } from './provider-contract';

const request: DecisionRequest = {
  model: 'jev-1.13.0',
  state: { value: '2' },
  questions: { check: { type: 'noul', instructions: 'The value equals 2.' } },
};
const response: DecisionResponse = {
  model: 'jev-1.13.0',
  answers: { check: { type: 'noul', probability: 0.5 } },
  usage: {
    inputTokens: 1,
    outputTokens: 1,
    reasoningTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  },
};
const schema = Type.Object({ status: Type.Literal('ok') });
const invalidAnswers: readonly DecisionResponse['answers'][] = [
  {},
  { check: { type: 'noul', probability: 0.5 }, extra: { type: 'noul', probability: 0 } },
  { check: { type: 'noul', probability: -0.1 } },
  { check: { type: 'noul', probability: 1.1 } },
  { check: { type: 'noul', probability: NaN } },
  { check: { type: 'noul', probability: Infinity } },
];

describe('shared provider contract assertions', () => {
  it.each([0, 0.5, 1])(
    'accepts a valid decision response without assuming accuracy: %s',
    (probability) => {
      expect(() =>
        expectDecisionContract(request, {
          ...response,
          answers: { check: { type: 'noul', probability } },
        }),
      ).not.toThrow();
    },
  );
  it.each(invalidAnswers)('rejects missing/extra IDs or invalid probabilities: %j', (answers) => {
    expect(() => expectDecisionContract(request, { ...response, answers })).toThrow();
  });
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
