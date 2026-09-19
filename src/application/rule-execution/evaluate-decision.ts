import { errAsync, type ResultAsync } from 'neverthrow';

import type { DecisionRuleDefinition } from '../../rules/decision-rule-types';
import type { ScopeContext } from '../../rules/rule-types';
import type {
  DecisionEvaluation,
  DecisionProvider,
  DecisionThresholds,
} from '../../shared/decision-types';

import { buildDecisionRequest, composeDecisionVerdict } from './decision-judge';
import { validateThresholds } from './decision-validation';

export function evaluateDecision(
  ctx: ScopeContext,
  definition: DecisionRuleDefinition,
  model: string,
  provider: DecisionProvider,
  thresholds: DecisionThresholds,
): ResultAsync<DecisionEvaluation, Error> {
  const request = validateThresholds(thresholds).andThen(() =>
    buildDecisionRequest(ctx, definition, model),
  );
  if (request.isErr()) return errAsync(request.error);
  const start = performance.now();
  return provider.ask(request.value).andThen((response) =>
    composeDecisionVerdict(definition.criteria, response.probabilities, thresholds).map(
      (result) => ({
        result,
        requestedModel: model,
        responseModel: response.model,
        usage: response.usage,
        durationMs: Math.round(performance.now() - start),
      }),
    ),
  );
}
