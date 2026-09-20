import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import type { DecisionRuleDefinition } from '../../rules/decision-rule-types';
import type { ScopeContext } from '../../rules/rule-types';
import type { DecisionAnswer } from '../../shared/decision-types';

import { buildDecisionRequest, composeDecisionVerdict, toDisplayVerdict } from './decision-judge';

const criteria = [
  { id: 'default_value', label: '業務値の補完', statement: '業務入力の欠損を補っている。' },
  { id: 'swallow_error', label: '失敗の成功値への置換', statement: '失敗を成功値に置換している。' },
];
const thresholds = { passMax: 0.3, violationMin: 0.7 };
const definition: DecisionRuleDefinition = {
  meta: { scope: 'function', cacheable: false },
  include: ['source', 'filePath', 'signature'],
  criteria,
};
const context: ScopeContext = {
  source: 'function discount() { return 0; }',
  filePath: 'src/pricing.ts',
  scopeType: 'function',
  name: 'discount',
  qualifiedSymbol: 'discount',
  startLine: 1,
  endLine: 1,
};

function noulAnswers(
  defaultValue: number,
  swallowError: number,
): Readonly<Record<string, DecisionAnswer>> {
  return {
    default_value: { type: 'noul', probability: defaultValue },
    swallow_error: { type: 'noul', probability: swallowError },
  };
}

describe('decision judge contract', () => {
  it.each([
    [0, 'pass'],
    [0.3, 'pass'],
    [0.1 + 0.2, 'pass'],
    [0.5, 'borderline'],
    [0.699, 'borderline'],
    [0.7, 'violation'],
    [1, 'violation'],
  ])('classifies %s without rounding as %s', (value, verdict) => {
    const result = composeDecisionVerdict(definition, noulAnswers(value, 0), thresholds);
    expect(result.map((r) => r.verdict)).toEqual(ok(verdict));
  });

  it('shows only violation observations while retaining all raw observations', () => {
    const result = composeDecisionVerdict(definition, noulAnswers(0.08, 0.91), thresholds);
    expect(result.map(toDisplayVerdict)).toEqual(
      ok({
        verdict: 'violation',
        reasoning: 'Jev判定: 失敗の成功値への置換 (0.91)',
        citations: [],
      }),
    );
    expect(result.map((r) => r.observations.length)).toEqual(ok(2));
  });

  it('shows borderline separately and suppresses pass observations', () => {
    const result = composeDecisionVerdict(definition, noulAnswers(0.699, 0.1), thresholds);
    expect(result.map(toDisplayVerdict)).toEqual(
      ok({
        verdict: 'borderline',
        reasoning: 'Jev判定: 判定保留: 業務値の補完 (0.699)',
        citations: [],
      }),
    );
  });

  it('shows only a summary when all observations pass', () => {
    const result = composeDecisionVerdict(definition, noulAnswers(0.1, 0.2), thresholds);
    expect(result.map(toDisplayVerdict)).toEqual(
      ok({ verdict: 'pass', reasoning: 'Jev判定: 指摘なし', citations: [] }),
    );
  });

  it('retains raw Choice distribution on its normalized observation', () => {
    const detail = {
      choice: 'violation',
      confidence: 0.8,
      probabilities: { violation: 0.82, allowed: 0.18 },
    };
    const choiceDefinition: DecisionRuleDefinition = {
      meta: { scope: 'function' },
      include: ['source'],
      criteria: [
        {
          id: 'outcome',
          label: '判定',
          statement: 'Choose.',
          type: 'choice',
          choices: {
            violation: 'Violation.',
            allowed: 'Allowed.',
          },
          violationChoices: ['violation'],
        },
      ],
    };
    const result = composeDecisionVerdict(
      choiceDefinition,
      { outcome: { type: 'choice', ...detail } },
      thresholds,
    );
    expect(result.map((value) => value.observations[0]?.choice)).toEqual(ok(detail));
  });

  it.each([NaN, Infinity, -0.1, 1.1])('rejects invalid probability %s', (value) => {
    expect(composeDecisionVerdict(definition, noulAnswers(value, 0), thresholds).isErr()).toBe(
      true,
    );
  });

  it('rejects missing, unexpected and duplicate answers instead of treating them as pass', () => {
    expect(
      composeDecisionVerdict(
        definition,
        { default_value: { type: 'noul', probability: 0 } },
        thresholds,
      ).isErr(),
    ).toBe(true);
    expect(
      composeDecisionVerdict(
        definition,
        { ...noulAnswers(0, 0), extra: { type: 'noul', probability: 0 } },
        thresholds,
      ).isErr(),
    ).toBe(true);
    expect(
      composeDecisionVerdict(
        { ...definition, criteria: [...criteria, ...criteria] },
        noulAnswers(0, 0),
        thresholds,
      ).isErr(),
    ).toBe(true);
    expect(composeDecisionVerdict({ ...definition, criteria: [] }, {}, thresholds).isErr()).toBe(
      true,
    );
  });

  it.each([
    { passMax: 0.7, violationMin: 0.3 },
    { passMax: 0.5, violationMin: 0.5 },
    { passMax: -0.1, violationMin: 0.7 },
    { passMax: 0.3, violationMin: 1.1 },
  ])('rejects invalid thresholds %j', (invalid) => {
    expect(composeDecisionVerdict(definition, noulAnswers(0, 0), invalid).isErr()).toBe(true);
  });

  it('sends only declared context and complete questions with the normalized model', () => {
    expect(buildDecisionRequest(context, definition, 'typesafe-jev')).toEqual(
      ok({
        model: 'jev-latest',
        state: { source: context.source, filePath: context.filePath },
        questions: {
          default_value: { type: 'noul', instructions: criteria[0]?.statement },
          swallow_error: { type: 'noul', instructions: criteria[1]?.statement },
        },
      }),
    );
  });

  it('rejects missing required input before calling a model', () => {
    expect(
      buildDecisionRequest({ ...context, source: '' }, definition, 'typesafe-jev').isErr(),
    ).toBe(true);
    expect(
      buildDecisionRequest(
        context,
        { ...definition, include: ['source', 'fileTree'] },
        'typesafe-jev',
      ).isErr(),
    ).toBe(true);
    expect(
      buildDecisionRequest(
        context,
        { ...definition, include: ['filePath'] },
        'typesafe-jev',
      ).isErr(),
    ).toBe(true);
    expect(
      buildDecisionRequest(context, { ...definition, criteria: [] }, 'typesafe-jev').isErr(),
    ).toBe(true);
    expect(
      buildDecisionRequest(
        { ...context, source: 'x'.repeat(60_001) },
        definition,
        'typesafe-jev',
      ).isErr(),
    ).toBe(true);
  });
});

describe('composed decision policy contract', () => {
  const composedDefinition: DecisionRuleDefinition = {
    meta: { scope: 'function' },
    include: ['source'],
    criteria: [
      {
        id: 'absence_effect',
        label: '不在の意味変化',
        statement: 'Classify the outward effect.',
        type: 'choice',
        choices: {
          distinction_collapsed: 'The distinction is lost.',
          distinction_preserved: 'The distinction remains.',
        },
      },
      {
        id: 'interpretation_authority',
        label: '解釈権限',
        statement: 'Classify authority for the mapping.',
        type: 'choice',
        choices: {
          authorized_for_all: 'Every mapping is authorized.',
          unauthorized_for_any: 'At least one mapping is unauthorized.',
          insufficient_evidence: 'The available contract is insufficient.',
        },
      },
    ],
    policy: {
      type: 'concerns',
      concerns: [
        {
          id: 'absence_normalization',
          label: '不在の正常値化',
          outcomes: [
            {
              id: 'unauthorized_collapse',
              verdict: 'violation',
              reason: '不在・未解決値を解釈権限なく正常値へ変換',
              reasonKind: 'policy_result',
              when: {
                type: 'all',
                expressions: [
                  {
                    type: 'choice',
                    criterionId: 'absence_effect',
                    choiceId: 'distinction_collapsed',
                  },
                  {
                    type: 'choice',
                    criterionId: 'interpretation_authority',
                    choiceId: 'unauthorized_for_any',
                  },
                ],
              },
            },
            {
              id: 'authorized_collapse',
              verdict: 'pass',
              reason: '明示的な境界解釈',
              reasonKind: 'policy_result',
              when: {
                type: 'all',
                expressions: [
                  {
                    type: 'choice',
                    criterionId: 'absence_effect',
                    choiceId: 'distinction_collapsed',
                  },
                  {
                    type: 'choice',
                    criterionId: 'interpretation_authority',
                    choiceId: 'authorized_for_all',
                  },
                ],
              },
            },
            {
              id: 'missing_contract',
              verdict: 'borderline',
              reason: '解釈権限を判断する材料が不足',
              reasonKind: 'insufficient_context',
              when: {
                type: 'all',
                expressions: [
                  {
                    type: 'choice',
                    criterionId: 'absence_effect',
                    choiceId: 'distinction_collapsed',
                  },
                  {
                    type: 'choice',
                    criterionId: 'interpretation_authority',
                    choiceId: 'insufficient_evidence',
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  };

  const answer = (
    choice: string,
    probabilities: Readonly<Record<string, number>>,
  ): {
    type: 'choice';
    readonly choice: string;
    readonly confidence: number;
    readonly probabilities: Readonly<Record<string, number>>;
  } => ({ type: 'choice', choice, confidence: probabilities[choice] ?? 0, probabilities });

  it.each([
    ['unauthorized_for_any', 'violation', 'policy_result'],
    ['authorized_for_all', 'pass', 'policy_result'],
    ['insufficient_evidence', 'borderline', 'insufficient_context'],
  ])('composes a collapsed distinction with %s as %s', (authority, verdict, reasonKind) => {
    const result = composeDecisionVerdict(
      composedDefinition,
      {
        absence_effect: answer('distinction_collapsed', {
          distinction_collapsed: 0.91,
          distinction_preserved: 0.09,
        }),
        interpretation_authority: answer(authority, {
          authorized_for_all: authority === 'authorized_for_all' ? 0.91 : 0.045,
          unauthorized_for_any: authority === 'unauthorized_for_any' ? 0.91 : 0.045,
          insufficient_evidence: authority === 'insufficient_evidence' ? 0.91 : 0.045,
        }),
      },
      thresholds,
    );
    expect(result.map((value) => value.verdict)).toEqual(ok(verdict));
    expect(result.map((value) => value.concerns?.[0]?.reasonKind)).toEqual(ok(reasonKind));
  });

  it('uses the selected composed category without reclassifying it by probability thresholds', () => {
    const result = composeDecisionVerdict(
      composedDefinition,
      {
        absence_effect: answer('distinction_collapsed', {
          distinction_collapsed: 0.51,
          distinction_preserved: 0.49,
        }),
        interpretation_authority: answer('authorized_for_all', {
          authorized_for_all: 0.4,
          unauthorized_for_any: 0.35,
          insufficient_evidence: 0.25,
        }),
      },
      thresholds,
    );
    expect(result.map((value) => value.verdict)).toEqual(ok('pass'));
  });

  it('rejects a policy reference to an undeclared choice before evaluation', () => {
    const invalid: DecisionRuleDefinition = {
      ...composedDefinition,
      policy: {
        type: 'concerns',
        concerns: [
          {
            id: 'broken',
            label: 'broken',
            outcomes: [
              {
                id: 'broken',
                verdict: 'pass',
                reason: 'broken',
                reasonKind: 'policy_result',
                when: {
                  type: 'choice',
                  criterionId: 'absence_effect',
                  choiceId: 'missing',
                },
              },
            ],
          },
        ],
      },
    };
    expect(buildDecisionRequest(context, invalid, 'typesafe-jev').isErr()).toBe(true);
  });
});
