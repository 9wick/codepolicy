import { err, ok, type Result } from 'neverthrow';

import type { ChoiceDecisionCriterion, DecisionCriterion } from '../../rules/decision-rule-types';
import type { DecisionThresholds } from '../../shared/decision-types';

function validateChoiceCriterion(criterion: ChoiceDecisionCriterion): Result<void, Error> {
  const choices = Object.entries(criterion.choices);
  const invalidChoice = choices.some(
    ([id, description]) => !/^[a-z][a-z0-9_]*$/.test(id) || description.trim() === '',
  );
  const invalidViolations =
    criterion.violationChoices.length === 0 ||
    new Set(criterion.violationChoices).size !== criterion.violationChoices.length ||
    criterion.violationChoices.some((id) => criterion.choices[id] === undefined);
  return choices.length >= 2 && !invalidChoice && !invalidViolations
    ? ok(undefined)
    : err(new Error(`Invalid choices for "${criterion.id}".`));
}

function validateCriterion(
  criterion: DecisionCriterion,
  existingIds: ReadonlySet<string>,
): Result<void, Error> {
  if (!/^[a-z][a-z0-9_]*$/.test(criterion.id) || existingIds.has(criterion.id)) {
    return err(new Error(`Invalid or duplicate criterion ID: "${criterion.id}".`));
  }
  if (criterion.label.trim() === '' || criterion.statement.trim() === '') {
    return err(new Error(`Empty label or statement for "${criterion.id}".`));
  }
  return criterion.type === 'choice' ? validateChoiceCriterion(criterion) : ok(undefined);
}

export function validateCriteria(criteria: readonly DecisionCriterion[]): Result<void, Error> {
  if (criteria.length === 0) return err(new Error('Decision criteria must not be empty.'));
  const ids = new Set<string>();
  for (const criterion of criteria) {
    const validated = validateCriterion(criterion, ids);
    if (validated.isErr()) return validated;
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
      return err(new Error(`Missing or invalid decision answer: "${id}".`));
    }
  }
  return ok(undefined);
}
