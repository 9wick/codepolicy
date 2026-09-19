import { describe, expect, it } from 'vitest';

import { DEFAULT_DECISION_THRESHOLDS } from '../shared/decision-types';

import type { DecisionRuleDefinition } from './decision-rule-types';
import definition from './jev-no-implicit-fallback/rule';
import { computeDecisionRuleVersion } from './decision-rule-version';

describe('decision cache versions', () => {
  const version = (value: DecisionRuleDefinition) =>
    computeDecisionRuleVersion(value, DEFAULT_DECISION_THRESHOLDS);
  it('is stable for the same definition', () => {
    expect(version({ ...definition })).toBe(version(definition));
  });
  it.each(['id', 'label', 'statement'])('changes when criterion %s changes', (field) => {
    const changed = {
      ...definition,
      criteria: definition.criteria.map((criterion) => ({ ...criterion, [field]: 'changed' })),
    };
    expect(version(changed)).not.toBe(version(definition));
  });
  it('changes with criteria order, include selection and include order', () => {
    const variants: DecisionRuleDefinition[] = [
      { ...definition, criteria: [...definition.criteria].reverse() },
      { ...definition, include: ['source'] },
      { ...definition, include: [...definition.include].reverse() },
    ];
    for (const variant of variants) expect(version(variant)).not.toBe(version(definition));
  });
  it.each([
    { passMax: 0.2, violationMin: 0.7 },
    { passMax: 0.3, violationMin: 0.8 },
  ])('changes with thresholds $passMax / $violationMin', (thresholds) => {
    expect(computeDecisionRuleVersion(definition, thresholds)).not.toBe(version(definition));
  });
});
