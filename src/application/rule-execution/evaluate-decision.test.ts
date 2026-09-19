import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import type { DecisionRuleDefinition } from '../../rules/decision-rule-types';
import type { ScopeContext } from '../../rules/rule-types';
import { DEFAULT_DECISION_THRESHOLDS } from '../../shared/decision-types';

import { evaluateDecision } from './evaluate-decision';

const context: ScopeContext = {
  source: 'function f() {}',
  filePath: 'a.ts',
  name: 'f',
  scopeType: 'function',
  startLine: 1,
  endLine: 1,
};
const definition: DecisionRuleDefinition = {
  meta: { scope: 'function', cacheable: false },
  include: ['source'],
  criteria: [{ id: 'a', label: 'A', statement: '対象関数は違反している。' }],
};
const usage = {
  inputTokens: 10,
  outputTokens: 1,
  reasoningTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

describe('evaluateDecision', () => {
  it('performs one request and retains both model IDs, raw observations and usage', async () => {
    const ask = vi.fn(() => okAsync({ model: 'jev-1.13.0', probabilities: { a: 0.91 }, usage }));
    const result = await evaluateDecision(
      context,
      definition,
      'typesafe-jev',
      { ask },
      DEFAULT_DECISION_THRESHOLDS,
    );
    expect(result._unsafeUnwrap()).toMatchObject({
      requestedModel: 'typesafe-jev',
      responseModel: 'jev-1.13.0',
      usage,
      result: { verdict: 'violation', observations: [{ id: 'a', probability: 0.91 }] },
    });
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it('does not send invalid input and propagates provider errors', async () => {
    const ask = vi.fn(() => errAsync(new Error('offline')));
    expect(
      (
        await evaluateDecision(
          { ...context, source: '' },
          definition,
          'typesafe-jev',
          { ask },
          DEFAULT_DECISION_THRESHOLDS,
        )
      ).isErr(),
    ).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    const result = await evaluateDecision(
      context,
      definition,
      'typesafe-jev',
      { ask },
      DEFAULT_DECISION_THRESHOLDS,
    );
    expect(result._unsafeUnwrapErr().message).toBe('offline');
  });
});
