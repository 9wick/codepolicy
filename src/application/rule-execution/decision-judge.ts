import { err, ok, type Result } from 'neverthrow';

import { toSdkModelId } from '../../infrastructure/llm/decision-model';
import type {
  ComposedDecisionRuleDefinition,
  ConcernOutcome,
  DecisionCriterion,
  DecisionRuleDefinition,
  DirectDecisionRuleDefinition,
  EvidenceExpression,
} from '../../rules/decision-rule-types';
import type { ScopeContext } from '../../rules/rule-types';
import type {
  ChoiceDecisionAnswer,
  DecisionAnswer,
  DecisionConcernResult,
  DecisionObservation,
  DecisionRequest,
  DecisionThresholds,
  DecisionVerdict,
} from '../../shared/decision-types';
import type { RuleVerdict, VerdictLabel } from '../../shared/types';

import {
  validateDecisionAnswers,
  validateDecisionDefinition,
  validateThresholds,
} from './decision-validation';

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

function buildQuestions(criteria: readonly DecisionCriterion[]): DecisionRequest['questions'] {
  const questions: Record<string, DecisionRequest['questions'][string]> = {};
  for (const criterion of criteria) {
    questions[criterion.id] =
      criterion.type === 'choice'
        ? {
            type: 'choice',
            instructions: criterion.statement,
            criteria: criterion.choices,
          }
        : { type: 'noul', instructions: criterion.statement };
  }
  return questions;
}

export function buildDecisionRequest(
  ctx: ScopeContext,
  definition: DecisionRuleDefinition,
  model: string,
): Result<DecisionRequest, Error> {
  return validateDecisionDefinition(definition)
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
  if (value + Number.EPSILON >= thresholds.violationMin) return 'violation';
  if (value <= thresholds.passMax + Number.EPSILON) return 'pass';
  return 'borderline';
}

function choiceDetail(answer: ChoiceDecisionAnswer) {
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
  };
}

function directProbability(
  criterion: DirectDecisionRuleDefinition['criteria'][number],
  answer: DecisionAnswer,
): Result<number, Error> {
  if (criterion.type !== 'choice' && answer.type === 'noul') return ok(answer.probability);
  if (criterion.type !== 'choice' || answer.type !== 'choice') {
    return err(new Error(`Decision answer type mismatch: ${criterion.id}.`));
  }
  return choiceViolationProbability(criterion.id, criterion.violationChoices, answer);
}

function choiceViolationProbability(
  criterionId: string,
  violationChoices: readonly string[],
  answer: ChoiceDecisionAnswer,
): Result<number, Error> {
  let probability = 0;
  for (const id of violationChoices) {
    const value = answer.probabilities[id];
    if (value === undefined) return err(new Error(`Missing violation Choice: ${id}.`));
    probability += value;
  }
  return probability <= 1
    ? ok(probability)
    : err(new Error(`Violation probability exceeds 1: ${criterionId}.`));
}

function composeDirect(
  definition: DirectDecisionRuleDefinition,
  answers: Readonly<Record<string, DecisionAnswer>>,
  thresholds: DecisionThresholds,
): Result<DecisionVerdict, Error> {
  const observations: DecisionObservation[] = [];
  for (const criterion of definition.criteria) {
    const answer = answers[criterion.id];
    if (answer === undefined) return err(new Error(`Missing decision answer: ${criterion.id}.`));
    const probability = directProbability(criterion, answer);
    if (probability.isErr()) return err(probability.error);
    observations.push({
      id: criterion.id,
      label: criterion.label,
      probability: probability.value,
      verdict: classify(probability.value, thresholds),
      ...(answer.type === 'choice' ? { choice: choiceDetail(answer) } : {}),
    });
  }
  const verdict = observations.some((item) => item.verdict === 'violation')
    ? 'violation'
    : observations.every((item) => item.verdict === 'pass')
      ? 'pass'
      : 'borderline';
  return ok({ verdict, thresholds, observations });
}

type EvidenceScore = { readonly matched: boolean; readonly probability: number };

function evaluateChoiceExpression(
  criterionId: string,
  choiceId: string,
  answers: Readonly<Record<string, DecisionAnswer>>,
): Result<EvidenceScore, Error> {
  const answer = answers[criterionId];
  if (answer === undefined || answer.type !== 'choice') {
    return err(new Error(`Missing Choice observation: ${criterionId}.`));
  }
  const probability = answer.probabilities[choiceId];
  return probability === undefined
    ? err(new Error(`Missing Choice probability: ${choiceId}.`))
    : ok({ matched: answer.choice === choiceId, probability });
}

function evaluateAllExpression(
  expressions: readonly EvidenceExpression[],
  answers: Readonly<Record<string, DecisionAnswer>>,
): Result<EvidenceScore, Error> {
  const scores = evaluateExpressions(expressions, answers);
  return scores.map((values) => ({
    matched: values.every((score) => score.matched),
    probability: Math.min(...values.map((score) => score.probability)),
  }));
}

function evaluateAnyExpression(
  expressions: readonly EvidenceExpression[],
  answers: Readonly<Record<string, DecisionAnswer>>,
): Result<EvidenceScore, Error> {
  const scores = evaluateExpressions(expressions, answers);
  return scores.map((values) => {
    const matched = values.filter((score) => score.matched);
    return {
      matched: matched.length > 0,
      probability:
        matched.length === 0 ? 0 : Math.max(...matched.map((score) => score.probability)),
    };
  });
}

function evaluateExpression(
  expression: EvidenceExpression,
  answers: Readonly<Record<string, DecisionAnswer>>,
): Result<EvidenceScore, Error> {
  if (expression.type === 'choice') {
    return evaluateChoiceExpression(expression.criterionId, expression.choiceId, answers);
  }
  return expression.type === 'all'
    ? evaluateAllExpression(expression.expressions, answers)
    : evaluateAnyExpression(expression.expressions, answers);
}

function evaluateExpressions(
  expressions: readonly EvidenceExpression[],
  answers: Readonly<Record<string, DecisionAnswer>>,
): Result<readonly EvidenceScore[], Error> {
  const scores: EvidenceScore[] = [];
  for (const child of expressions) {
    const score = evaluateExpression(child, answers);
    if (score.isErr()) return err(score.error);
    scores.push(score.value);
  }
  return ok(scores);
}

type ScoredOutcome = {
  readonly outcome: ConcernOutcome;
  readonly probability: number;
};

function bestOutcome(
  outcomes: readonly ScoredOutcome[],
  accepts: (outcome: ConcernOutcome) => boolean,
): ScoredOutcome | undefined {
  let best: ScoredOutcome | undefined;
  for (const scored of outcomes) {
    if (accepts(scored.outcome) && (best === undefined || scored.probability > best.probability)) {
      best = scored;
    }
  }
  return best;
}

function concernResult(
  concern: ComposedDecisionRuleDefinition['policy']['concerns'][number],
  scored: ScoredOutcome,
  verdict: VerdictLabel,
): DecisionConcernResult {
  return {
    id: concern.id,
    label: concern.label,
    verdict,
    probability: scored.probability,
    reason: scored.outcome.reason,
    reasonKind: scored.outcome.reasonKind,
  };
}

function scoreOutcomes(
  outcomes: readonly ConcernOutcome[],
  answers: Readonly<Record<string, DecisionAnswer>>,
): Result<readonly ScoredOutcome[], Error> {
  const scores: ScoredOutcome[] = [];
  for (const outcome of outcomes) {
    const evaluated = evaluateExpression(outcome.when, answers);
    if (evaluated.isErr()) return err(evaluated.error);
    if (evaluated.value.matched) scores.push({ outcome, probability: evaluated.value.probability });
  }
  return ok(scores);
}

function composeConcern(
  concern: ComposedDecisionRuleDefinition['policy']['concerns'][number],
  answers: Readonly<Record<string, DecisionAnswer>>,
): Result<DecisionConcernResult, Error> {
  const evaluated = scoreOutcomes(concern.outcomes, answers);
  if (evaluated.isErr()) return err(evaluated.error);
  const scores = evaluated.value;
  const violation = bestOutcome(scores, (outcome) => outcome.verdict === 'violation');
  if (violation !== undefined) {
    return ok(concernResult(concern, violation, 'violation'));
  }
  const borderline = bestOutcome(scores, (outcome) => outcome.verdict === 'borderline');
  if (borderline !== undefined) {
    return ok(concernResult(concern, borderline, 'borderline'));
  }
  const pass = bestOutcome(scores, (outcome) => outcome.verdict === 'pass');
  if (pass !== undefined) {
    return ok(concernResult(concern, pass, 'pass'));
  }
  const probability = scores.reduce((maximum, item) => Math.max(maximum, item.probability), 0);
  return ok({
    id: concern.id,
    label: concern.label,
    verdict: 'borderline',
    probability,
    reason: '判定確率が中間、または観測の組み合わせが不整合',
    reasonKind: 'uncertain_observation',
  });
}

function buildComposedObservations(
  definition: ComposedDecisionRuleDefinition,
  answers: Readonly<Record<string, DecisionAnswer>>,
): Result<readonly DecisionObservation[], Error> {
  const observations: DecisionObservation[] = [];
  for (const criterion of definition.criteria) {
    const answer = answers[criterion.id];
    if (answer === undefined || answer.type !== 'choice') {
      return err(new Error(`Missing Choice observation: ${criterion.id}.`));
    }
    const probability = answer.probabilities[answer.choice];
    if (probability === undefined) {
      return err(new Error(`Missing selected Choice probability: ${criterion.id}.`));
    }
    observations.push({
      id: criterion.id,
      label: criterion.label,
      probability,
      choice: choiceDetail(answer),
    });
  }
  return ok(observations);
}

function aggregateConcerns(concerns: readonly DecisionConcernResult[]): VerdictLabel {
  if (concerns.some((item) => item.verdict === 'violation')) return 'violation';
  return concerns.every((item) => item.verdict === 'pass') ? 'pass' : 'borderline';
}

function composeComposed(
  definition: ComposedDecisionRuleDefinition,
  answers: Readonly<Record<string, DecisionAnswer>>,
  thresholds: DecisionThresholds,
): Result<DecisionVerdict, Error> {
  const concerns: DecisionConcernResult[] = [];
  for (const concern of definition.policy.concerns) {
    const result = composeConcern(concern, answers);
    if (result.isErr()) return err(result.error);
    concerns.push(result.value);
  }
  return buildComposedObservations(definition, answers).map((observations) => ({
    verdict: aggregateConcerns(concerns),
    thresholds,
    observations,
    concerns,
  }));
}

export function composeDecisionVerdict(
  definition: DecisionRuleDefinition,
  answers: Readonly<Record<string, DecisionAnswer>>,
  thresholds: DecisionThresholds,
): Result<DecisionVerdict, Error> {
  return validateDecisionDefinition(definition)
    .andThen(() => validateThresholds(thresholds))
    .andThen(() => validateDecisionAnswers(definition, answers))
    .andThen(() =>
      definition.policy === undefined
        ? composeDirect(definition, answers, thresholds)
        : composeComposed(definition, answers, thresholds),
    );
}

function formatConcern(result: DecisionConcernResult): string {
  if (result.reasonKind === 'insufficient_context') {
    return `判断材料不足: ${result.reason} (${result.probability})`;
  }
  if (result.reasonKind === 'uncertain_observation') {
    return `判定確率が中間: ${result.label} (${result.probability})`;
  }
  return `${result.reason} (${result.probability})`;
}

export function toDisplayVerdict(result: DecisionVerdict): RuleVerdict {
  if (result.verdict === 'pass') {
    return { verdict: 'pass', reasoning: 'Jev判定: 指摘なし', citations: [] };
  }
  if (result.concerns !== undefined) {
    const details = result.concerns
      .filter((item) => item.verdict !== 'pass')
      .map(formatConcern)
      .join('; ');
    return { verdict: result.verdict, reasoning: `Jev判定: ${details}`, citations: [] };
  }
  const details = result.observations
    .filter((item) => item.verdict === result.verdict)
    .map((item) => `${item.label} (${item.probability})`)
    .join('; ');
  const prefix = result.verdict === 'borderline' ? 'Jev判定: 判定保留: ' : 'Jev判定: ';
  return { verdict: result.verdict, reasoning: `${prefix}${details}`, citations: [] };
}
