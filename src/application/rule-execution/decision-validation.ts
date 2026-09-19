import { err, ok, type Result } from 'neverthrow';

import type {
  ConcernOutcome,
  DecisionCriterion,
  DecisionConcern,
  DecisionRuleDefinition,
  EvidenceExpression,
} from '../../rules/decision-rule-types';
import type { DecisionAnswer, DecisionThresholds } from '../../shared/decision-types';

function validProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateViolationChoices(
  criterion: DecisionCriterion & { type: 'choice' },
): Result<void, Error> {
  const violations = criterion.violationChoices;
  if (violations === undefined) return ok(undefined);
  const invalid =
    violations.length === 0 ||
    new Set(violations).size !== violations.length ||
    violations.some((id) => criterion.choices[id] === undefined);
  return invalid ? err(new Error(`Invalid choices for "${criterion.id}".`)) : ok(undefined);
}

function validateChoiceCriterion(criterion: DecisionCriterion): Result<void, Error> {
  if (criterion.type !== 'choice') return ok(undefined);
  const choices = Object.entries(criterion.choices);
  const invalidChoice = choices.some(
    ([id, description]) => !/^[a-z][a-z0-9_]*$/.test(id) || description.trim() === '',
  );
  if (choices.length < 2 || invalidChoice) {
    return err(new Error(`Invalid choices for "${criterion.id}".`));
  }
  return validateViolationChoices(criterion);
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
  return validateChoiceCriterion(criterion);
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

function validateExpression(
  expression: EvidenceExpression,
  choicesByCriterion: ReadonlyMap<string, Readonly<Record<string, string>>>,
): Result<void, Error> {
  if (expression.type === 'choice') {
    const choices = choicesByCriterion.get(expression.criterionId);
    return choices?.[expression.choiceId] === undefined
      ? err(
          new Error(`Unknown policy reference: ${expression.criterionId}.${expression.choiceId}.`),
        )
      : ok(undefined);
  }
  if (expression.expressions.length === 0) {
    return err(new Error('Policy expressions must not be empty.'));
  }
  for (const child of expression.expressions) {
    const validated = validateExpression(child, choicesByCriterion);
    if (validated.isErr()) return validated;
  }
  return ok(undefined);
}

function validateOutcome(
  outcome: ConcernOutcome,
  existingIds: ReadonlySet<string>,
  choicesByCriterion: ReadonlyMap<string, Readonly<Record<string, string>>>,
): Result<void, Error> {
  if (
    !/^[a-z][a-z0-9_]*$/.test(outcome.id) ||
    existingIds.has(outcome.id) ||
    outcome.reason.trim() === ''
  ) {
    return err(new Error(`Invalid or duplicate outcome: "${outcome.id}".`));
  }
  return validateExpression(outcome.when, choicesByCriterion);
}

function validateConcern(
  concern: DecisionConcern,
  existingIds: ReadonlySet<string>,
  choicesByCriterion: ReadonlyMap<string, Readonly<Record<string, string>>>,
): Result<void, Error> {
  if (
    !/^[a-z][a-z0-9_]*$/.test(concern.id) ||
    existingIds.has(concern.id) ||
    concern.label.trim() === '' ||
    concern.outcomes.length === 0
  ) {
    return err(new Error(`Invalid or duplicate concern: "${concern.id}".`));
  }
  const outcomeIds = new Set<string>();
  for (const outcome of concern.outcomes) {
    const validated = validateOutcome(outcome, outcomeIds, choicesByCriterion);
    if (validated.isErr()) return validated;
    outcomeIds.add(outcome.id);
  }
  return ok(undefined);
}

function validatePolicy(definition: DecisionRuleDefinition): Result<void, Error> {
  if (definition.policy === undefined) return ok(undefined);
  if (definition.policy.concerns.length === 0) {
    return err(new Error('Composed decision policy must contain concerns.'));
  }
  const choicesByCriterion = new Map(
    definition.criteria.map((criterion) => [criterion.id, criterion.choices]),
  );
  const concernIds = new Set<string>();
  for (const concern of definition.policy.concerns) {
    const validated = validateConcern(concern, concernIds, choicesByCriterion);
    if (validated.isErr()) return validated;
    concernIds.add(concern.id);
  }
  return ok(undefined);
}

export function validateDecisionDefinition(
  definition: DecisionRuleDefinition,
): Result<void, Error> {
  return validateCriteria(definition.criteria).andThen(() => validatePolicy(definition));
}

function validateNoulAnswer(criterion: DecisionCriterion, answer: DecisionAnswer) {
  return answer.type === 'noul' && validProbability(answer.probability)
    ? ok(undefined)
    : err(new Error(`Invalid Noul answer: "${criterion.id}".`));
}

function validateChoiceAnswer(
  criterion: DecisionCriterion & { type: 'choice' },
  answer: DecisionAnswer,
): Result<void, Error> {
  if (answer.type !== 'choice' || !validProbability(answer.confidence)) {
    return err(new Error(`Invalid Choice answer: "${criterion.id}".`));
  }
  const expected = Object.keys(criterion.choices);
  const actual = Object.keys(answer.probabilities);
  const validIds =
    actual.length === expected.length &&
    expected.every((id) => actual.includes(id)) &&
    expected.includes(answer.choice);
  const validValues = Object.values(answer.probabilities).every(validProbability);
  return validIds && validValues
    ? ok(undefined)
    : err(new Error(`Invalid Choice answer: "${criterion.id}".`));
}

function validateAnswer(criterion: DecisionCriterion, answer: DecisionAnswer): Result<void, Error> {
  return criterion.type === 'choice'
    ? validateChoiceAnswer(criterion, answer)
    : validateNoulAnswer(criterion, answer);
}

export function validateDecisionAnswers(
  definition: DecisionRuleDefinition,
  answers: Readonly<Record<string, DecisionAnswer>>,
): Result<void, Error> {
  if (Object.keys(answers).length !== definition.criteria.length) {
    return err(new Error('Decision answer IDs do not match the questions.'));
  }
  for (const criterion of definition.criteria) {
    const answer = answers[criterion.id];
    if (answer === undefined) return err(new Error(`Missing decision answer: ${criterion.id}.`));
    const validated = validateAnswer(criterion, answer);
    if (validated.isErr()) return validated;
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
    if (value === undefined || !validProbability(value)) {
      return err(new Error(`Missing or invalid decision answer: "${id}".`));
    }
  }
  return ok(undefined);
}
