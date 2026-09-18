import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import type { DecisionRuleDefinition } from '../../rules/decision-rule-types';
import type { ScopeContext } from '../../rules/rule-types';

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
  startLine: 1,
  endLine: 1,
};

describe('decision judge contract', () => {
  it.each([
    [0, 'pass'],
    [0.3, 'pass'],
    [0.5, 'borderline'],
    [0.699, 'borderline'],
    [0.7, 'violation'],
    [1, 'violation'],
  ])('classifies %s without rounding as %s', (value, verdict) => {
    const result = composeDecisionVerdict(
      criteria,
      { default_value: value, swallow_error: 0 },
      thresholds,
    );
    expect(result.map((r) => r.verdict)).toEqual(ok(verdict));
  });

  it('shows only violation observations while retaining all raw observations', () => {
    const result = composeDecisionVerdict(
      criteria,
      { default_value: 0.08, swallow_error: 0.91 },
      thresholds,
    );
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
    const result = composeDecisionVerdict(
      criteria,
      { default_value: 0.699, swallow_error: 0.1 },
      thresholds,
    );
    expect(result.map(toDisplayVerdict)).toEqual(
      ok({
        verdict: 'borderline',
        reasoning: 'Jev判定: 判定保留: 業務値の補完 (0.699)',
        citations: [],
      }),
    );
  });

  it('shows only a summary when all observations pass', () => {
    const result = composeDecisionVerdict(
      criteria,
      { default_value: 0.1, swallow_error: 0.2 },
      thresholds,
    );
    expect(result.map(toDisplayVerdict)).toEqual(
      ok({ verdict: 'pass', reasoning: 'Jev判定: 指摘なし', citations: [] }),
    );
  });

  it.each([NaN, Infinity, -0.1, 1.1])('rejects invalid probability %s', (value) => {
    expect(
      composeDecisionVerdict(
        criteria,
        { default_value: value, swallow_error: 0 },
        thresholds,
      ).isErr(),
    ).toBe(true);
  });

  it('rejects missing, unexpected and duplicate answers instead of treating them as pass', () => {
    expect(composeDecisionVerdict(criteria, { default_value: 0 }, thresholds).isErr()).toBe(true);
    expect(
      composeDecisionVerdict(
        criteria,
        { default_value: 0, swallow_error: 0, extra: 0 },
        thresholds,
      ).isErr(),
    ).toBe(true);
    expect(
      composeDecisionVerdict(
        [...criteria, ...criteria],
        { default_value: 0, swallow_error: 0 },
        thresholds,
      ).isErr(),
    ).toBe(true);
    expect(composeDecisionVerdict([], {}, thresholds).isErr()).toBe(true);
  });

  it.each([
    { passMax: 0.7, violationMin: 0.3 },
    { passMax: 0.5, violationMin: 0.5 },
    { passMax: -0.1, violationMin: 0.7 },
    { passMax: 0.3, violationMin: 1.1 },
  ])('rejects invalid thresholds %j', (invalid) => {
    expect(
      composeDecisionVerdict(criteria, { default_value: 0, swallow_error: 0 }, invalid).isErr(),
    ).toBe(true);
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
