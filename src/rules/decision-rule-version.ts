import { createHash } from 'node:crypto';

import type { DecisionThresholds } from '../shared/decision-types';

import type { DecisionRuleDefinition } from './decision-rule-types';

export function computeDecisionRuleVersion(
  definition: DecisionRuleDefinition,
  thresholds: DecisionThresholds,
): string {
  const material = JSON.stringify({
    include: definition.include,
    criteria: definition.criteria,
    thresholds,
  });
  return createHash('sha256').update(material).digest('hex');
}
