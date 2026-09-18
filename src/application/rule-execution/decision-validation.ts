import { err, ok, type Result } from 'neverthrow';

import type { DecisionCriterion } from '../../rules/decision-rule-types';
import type { DecisionThresholds } from '../../shared/decision-types';

export function validateCriteria(criteria: readonly DecisionCriterion[]): Result<void, Error> {
  if (criteria.length === 0) return err(new Error('Decision criteria must not be empty.'));
  const ids = new Set<string>();
  for (const criterion of criteria) {
    if (!/^[a-z][a-z0-9_]*$/.test(criterion.id) || ids.has(criterion.id)) {
      return err(new Error(`Invalid or duplicate criterion ID: "${criterion.id}".`));
    }
    if (criterion.label.trim() === '' || criterion.statement.trim() === '') {
      return err(new Error(`Empty label or statement for "${criterion.id}".`));
    }
    ids.add(criterion.id);
  }
  return ok(undefined);
}

export function validateThresholds(t: DecisionThresholds): Result<void, Error> {
  const valid =
    Number.isFinite(t.passMax) &&
    Number.isFinite(t.violationMin) &&
    0 <= t.passMax &&
    t.passMax < t.violationMin &&
    t.violationMin <= 1;
  return valid ? ok(undefined) : err(new Error('Invalid decision thresholds.'));
}

export function validateProbabilities(
  ids: readonly string[],
  probabilities: Readonly<Record<string, number>>,
): Result<void, Error> {
  if (Object.keys(probabilities).length !== ids.length) {
    return err(new Error('Decision answer IDs do not match the questions.'));
  }
  for (const id of ids) {
    const value = probabilities[id];
    if (value === undefined || !Number.isFinite(value) || value < 0 || value > 1) {
      return err(new Error(`Missing or invalid Noul answer: "${id}".`));
    }
  }
  return ok(undefined);
}
