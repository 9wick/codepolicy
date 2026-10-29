import { describe, expect, it } from 'vitest';

import { DEFAULT_DECISION_THRESHOLDS } from '../shared/decision-types';

import type { DecisionRuleDefinition } from './decision-rule-types';
import definition from './jev-no-implicit-fallback/rule';
import multiCriteriaDefinition from './jev-strict-function-boundary/rule';
import { computeDecisionRuleVersion } from './decision-rule-version';

describe('decision cache versions', () => {
  const composedDefinition =
    definition.policy === undefined ? expect.fail('Expected composed definition.') : definition;
  const directDefinition =
    multiCriteriaDefinition.policy !== undefined
      ? expect.fail('Expected direct definition.')
      : multiCriteriaDefinition;
  const version = (value: DecisionRuleDefinition) =>
    computeDecisionRuleVersion(value, DEFAULT_DECISION_THRESHOLDS);
  it('is stable for the same definition', () => {
    expect(version({ ...definition })).toBe(version(definition));
  });
  it('changes when a criterion changes', () => {
    expect(
      version({
        ...composedDefinition,
        criteria: composedDefinition.criteria.map((criterion) => ({
          ...criterion,
          statement: `${criterion.statement} changed`,
        })),
      }),
    ).not.toBe(version(composedDefinition));
  });
  it('changes when the composed policy changes', () => {
    expect(
      version({
        ...composedDefinition,
        policy: {
          ...composedDefinition.policy,
          concerns: composedDefinition.policy.concerns.map((concern) => ({
            ...concern,
            label: `${concern.label} changed`,
          })),
        },
      }),
    ).not.toBe(version(composedDefinition));
  });
  it('changes with criteria order, include selection and include order', () => {
    const variants: readonly (readonly [DecisionRuleDefinition, DecisionRuleDefinition])[] = [
      [
        directDefinition,
        {
          ...directDefinition,
          criteria: [...directDefinition.criteria].reverse(),
        },
      ],
      [definition, { ...definition, include: ['source'] }],
      [definition, { ...definition, include: [...definition.include].reverse() }],
    ];
    for (const [original, variant] of variants) {
      expect(version(variant)).not.toBe(version(original));
    }
  });
  it.each([
    { passMax: 0.2, violationMin: 0.7 },
    { passMax: 0.3, violationMin: 0.8 },
  ])('changes with thresholds $passMax / $violationMin', (thresholds) => {
    expect(computeDecisionRuleVersion(definition, thresholds)).not.toBe(version(definition));
  });
});
