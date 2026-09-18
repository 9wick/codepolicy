import { err, ok, type Result } from 'neverthrow';

import { toSdkModelId } from '../../infrastructure/llm/decision-model';
import type { DecisionCriterion, DecisionRuleDefinition } from '../../rules/decision-rule-types';
import type { ScopeContext } from '../../rules/rule-types';
import type {
  DecisionObservation,
  DecisionThresholds,
  DecisionVerdict,
  NoulRequest,
} from '../../shared/decision-types';
import type { RuleVerdict, VerdictLabel } from '../../shared/types';

import { validateCriteria, validateProbabilities, validateThresholds } from './decision-validation';

function buildState(
  ctx: ScopeContext,
  definition: DecisionRuleDefinition,
): Result<Record<string, string>, Error> {
  if (!definition.include.includes('source')) {
    return err(new Error('Decision state requires nonempty source.'));
  }
  const state: Record<string, string> = {};
  for (const field of definition.include) {
    const value = ctx[field];
    if (field === 'signature' && value === undefined) continue;
    if (!value?.trim()) {
      return err(new Error(`Missing decision context: ${field}.`));
    }
    state[field] = value;
  }
  return ok(state);
}

function buildQuestions(criteria: readonly DecisionCriterion[]): NoulRequest['questions'] {
  const questions: NoulRequest['questions'] = {};
  for (const criterion of criteria) {
    questions[criterion.id] = { type: 'noul', instructions: criterion.statement };
  }
  return questions;
}

export function buildDecisionRequest(
  ctx: ScopeContext,
  definition: DecisionRuleDefinition,
  model: string,
): Result<NoulRequest, Error> {
  return validateCriteria(definition.criteria)
    .andThen(() => toSdkModelId(model))
    .andThen((sdkModel) =>
      buildState(ctx, definition).map((state) => ({
        model: sdkModel,
        state,
        questions: buildQuestions(definition.criteria),
      })),
    )
    .andThen((request) =>
      JSON.stringify(request).length <= 60_000
        ? ok(request)
        : err(new Error('Decision request exceeds 60000 characters.')),
    );
}

function classify(value: number, thresholds: DecisionThresholds): VerdictLabel {
  if (value >= thresholds.violationMin) return 'violation';
  if (value <= thresholds.passMax) return 'pass';
  return 'borderline';
}

function observe(
  criteria: readonly DecisionCriterion[],
  probabilities: Readonly<Record<string, number>>,
  thresholds: DecisionThresholds,
): Result<DecisionObservation[], Error> {
  const observations: DecisionObservation[] = [];
  for (const criterion of criteria) {
    const probability = probabilities[criterion.id];
    if (probability === undefined) return err(new Error(`Missing Noul answer: ${criterion.id}.`));
    observations.push({
      id: criterion.id,
      label: criterion.label,
      probability,
      verdict: classify(probability, thresholds),
    });
  }
  return ok(observations);
}

function aggregate(observations: readonly DecisionObservation[]): VerdictLabel {
  if (observations.some((item) => item.verdict === 'violation')) return 'violation';
  return observations.every((item) => item.verdict === 'pass') ? 'pass' : 'borderline';
}

export function composeDecisionVerdict(
  criteria: readonly DecisionCriterion[],
  probabilities: Readonly<Record<string, number>>,
  thresholds: DecisionThresholds,
): Result<DecisionVerdict, Error> {
  return validateCriteria(criteria)
    .andThen(() => validateThresholds(thresholds))
    .andThen(() =>
      validateProbabilities(
        criteria.map((item) => item.id),
        probabilities,
      ),
    )
    .andThen(() => observe(criteria, probabilities, thresholds))
    .map((observations) => ({ verdict: aggregate(observations), thresholds, observations }));
}

export function toDisplayVerdict(result: DecisionVerdict): RuleVerdict {
  if (result.verdict === 'pass')
    return { verdict: 'pass', reasoning: 'Jev判定: 指摘なし', citations: [] };
  const details = result.observations
    .filter((item) => item.verdict === result.verdict)
    .map((item) => `${item.label} (${item.probability})`)
    .join('; ');
  const prefix = result.verdict === 'borderline' ? 'Jev判定: 判定保留: ' : 'Jev判定: ';
  return { verdict: result.verdict, reasoning: `${prefix}${details}`, citations: [] };
}
