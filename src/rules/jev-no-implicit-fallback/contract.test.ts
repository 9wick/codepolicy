import { okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { evaluateDecision } from '../../application/rule-execution/evaluate-decision';
import {
  composeDecisionVerdict,
  toDisplayVerdict,
} from '../../application/rule-execution/decision-judge';
import type { ChoiceDecisionAnswer } from '../../shared/decision-types';
import { DEFAULT_DECISION_THRESHOLDS } from '../../shared/decision-types';

import definition from './rule';

const choices = ['meaning_lost', 'preserved_or_absent', 'unclear'];
const policyChoices = ['boundary_default', 'invented_value', 'unclear'];
function answer(choice: string, available = choices): ChoiceDecisionAnswer {
  return {
    type: 'choice',
    choice,
    confidence: 0.8,
    probabilities: Object.fromEntries(available.map((id) => [id, id === choice ? 0.94 : 0.03])),
  };
}
function compose(input: string, failure: string, policy = 'unclear') {
  return composeDecisionVerdict(
    definition,
    {
      ambiguous_input_handling: answer(input),
      failure_handling: answer(failure),
      input_policy_role: answer(policy, policyChoices),
    },
    DEFAULT_DECISION_THRESHOLDS,
  )._unsafeUnwrap();
}

describe('independent no-fallback meaning contracts', () => {
  it.each([
    ['preserved_or_absent', 'preserved_or_absent', 'pass'],
    ['meaning_lost', 'preserved_or_absent', 'borderline'],
    ['unclear', 'preserved_or_absent', 'borderline'],
    ['preserved_or_absent', 'meaning_lost', 'violation'],
    ['meaning_lost', 'meaning_lost', 'violation'],
    ['unclear', 'meaning_lost', 'violation'],
    ['preserved_or_absent', 'unclear', 'borderline'],
    ['meaning_lost', 'unclear', 'borderline'],
    ['unclear', 'unclear', 'borderline'],
  ])(
    'composes input=%s and failure=%s as %s without merging answers',
    (input, failure, verdict) => {
      const result = compose(input, failure);
      expect(result.verdict).toBe(verdict);
      expect(result.observations.map((item) => item.choice)).toEqual([
        { choice: input, confidence: 0.8, probabilities: answer(input).probabilities },
        { choice: failure, confidence: 0.8, probabilities: answer(failure).probabilities },
        {
          choice: 'unclear',
          confidence: 0.8,
          probabilities: answer('unclear', policyChoices).probabilities,
        },
      ]);
    },
  );

  it('keeps missing authority distinct from uncertainty about meaning', () => {
    const knownLoss = compose('meaning_lost', 'preserved_or_absent');
    const unclearMeaning = compose('unclear', 'preserved_or_absent');
    expect(knownLoss.concerns?.[0]?.reasonKind).toBe('insufficient_context');
    expect(unclearMeaning.concerns?.[0]?.reasonKind).toBe('insufficient_context');
    expect(toDisplayVerdict(knownLoss).reasoning).toContain('解釈権限が未設定');
    expect(toDisplayVerdict(unclearMeaning).reasoning).toContain(
      '意味が保存されているか判断する材料が不足',
    );
  });

  it('displays both losses while omitting preserved meanings', () => {
    const both = toDisplayVerdict(compose('meaning_lost', 'meaning_lost'));
    expect(both.reasoning).toContain('入力・設定の意味の喪失');
    expect(both.reasoning).toContain('失敗の意味');
    expect(both.reasoning).not.toContain('意味喪失なし');
    expect(
      toDisplayVerdict(compose('preserved_or_absent', 'meaning_lost')).reasoning,
    ).not.toContain('解釈権限');
  });

  it.each([
    ['invented_value', 'violation'],
    ['boundary_default', 'pass'],
    ['unclear', 'borderline'],
  ])('classifies a known input loss with policy role %s as %s', (policy, verdict) => {
    expect(compose('meaning_lost', 'preserved_or_absent', policy).verdict).toBe(verdict);
  });

  it('accepts an established interface default even when its semantic difference is unclear', () => {
    expect(compose('unclear', 'preserved_or_absent', 'boundary_default').verdict).toBe('pass');
  });

  it('rejects an invented business value even when the separate meaning observation is unclear', () => {
    expect(compose('unclear', 'preserved_or_absent', 'invented_value').verdict).toBe('violation');
    expect(compose('preserved_or_absent', 'preserved_or_absent', 'invented_value').verdict).toBe(
      'pass',
    );
  });

  it('never excuses a swallowed failure with an allowed input default', () => {
    expect(compose('meaning_lost', 'meaning_lost', 'boundary_default').verdict).toBe('violation');
  });

  it.each(['src/domain/counter.ts', 'src/adapters/http/counter.ts'])(
    '%s needs no authority for preserved meaning',
    async (filePath) => {
      const ask = vi.fn(() =>
        okAsync({
          model: 'jev-1.13.0',
          answers: {
            ambiguous_input_handling: answer('preserved_or_absent'),
            failure_handling: answer('preserved_or_absent'),
            input_policy_role: answer('unclear', policyChoices),
          },
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            reasoningTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          },
        }),
      );
      const result = await evaluateDecision(
        {
          source: 'function count() { return 0; }',
          filePath,
          scopeType: 'function',
          name: 'count',
          startLine: 1,
          endLine: 1,
        },
        definition,
        'typesafe-jev',
        { ask },
        DEFAULT_DECISION_THRESHOLDS,
      );
      expect(result._unsafeUnwrap().result.verdict).toBe('pass');
      expect(ask).toHaveBeenCalledTimes(1);
      expect(ask.mock.calls).toHaveLength(1);
      expect(definition.criteria.map((criterion) => criterion.id)).toEqual([
        'ambiguous_input_handling',
        'failure_handling',
        'input_policy_role',
      ]);
      expect(definition.include).not.toContain('qualifiedSymbol');
    },
  );
});
