import type { ResultAsync } from 'neverthrow';

import { CreateDecisionClient } from '../../infrastructure/llm/typesafe-client';
import { createDecisionProvider } from '../../infrastructure/llm/typesafe-provider';
import type { DecisionRuleDefinition } from '../../rules/decision-rule-types';
import type { ScopeContext } from '../../rules/rule-types';
import { getAppContainer } from '../../shared/container';
import { DEFAULT_DECISION_THRESHOLDS, type DecisionEvaluation } from '../../shared/decision-types';
import { CreateLogger } from '../../shared/logger';

import { evaluateDecision } from './evaluate-decision';
import { generateFileTree } from './file-tree.lib';

export function runDecisionFile(
  ctx: ScopeContext,
  definition: DecisionRuleDefinition,
  model: string,
  workingDir: string,
): ResultAsync<DecisionEvaluation, Error> {
  return generateFileTree(workingDir).andThen((fileTree) =>
    runDecision({ ...ctx, fileTree }, definition, model),
  );
}

export function runDecision(
  ctx: ScopeContext,
  definition: DecisionRuleDefinition,
  model: string,
): ResultAsync<DecisionEvaluation, Error> {
  const container = getAppContainer();
  const provider = createDecisionProvider(container.get(CreateDecisionClient));
  const log = container.get(CreateLogger)('Jev');
  return evaluateDecision(ctx, definition, model, provider, DEFAULT_DECISION_THRESHOLDS).map(
    (evaluation) => {
      log.debug(JSON.stringify(evaluation));
      return evaluation;
    },
  );
}
