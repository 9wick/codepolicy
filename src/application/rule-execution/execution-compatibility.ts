import { err, ok, type Result } from 'neverthrow';

import { isDecisionModel, toSdkModelId } from '../../infrastructure/llm/decision-model';
import { codepolicyError, type CodepolicyError } from '../../shared/errors';
import type { ModelReasoningEffort, ResolvedRule } from '../../shared/types';

export function validateRuleModel(
  id: string,
  kind: 'text' | 'decision',
  model: string,
  effort: ModelReasoningEffort | undefined,
): Result<void, CodepolicyError> {
  if (kind === 'text') {
    return isDecisionModel(model)
      ? err(codepolicyError('INVALID_ARGUMENT', `Rule ${id} requires a text model.`))
      : ok(undefined);
  }
  if (!isDecisionModel(model)) {
    return err(codepolicyError('INVALID_ARGUMENT', `Rule ${id} requires a TypeSafe model.`));
  }
  if (effort !== undefined) {
    return err(
      codepolicyError('INVALID_ARGUMENT', 'TypeSafe models do not support reasoning-effort.'),
    );
  }
  return toSdkModelId(model)
    .map(() => undefined)
    .mapErr((cause) => codepolicyError('INVALID_ARGUMENT', cause.message, cause));
}

export function validateExecution(
  rules: readonly ResolvedRule[],
  effort: ModelReasoningEffort | undefined,
): Result<void, CodepolicyError> {
  for (const rule of rules) {
    if (rule.level === 'off') continue;
    const options = validateDecisionOptions(rule.id, rule.kind ?? 'text', rule.options);
    if (options.isErr()) return options;
    const result = validateRuleModel(rule.id, rule.kind ?? 'text', rule.agent, effort);
    if (result.isErr()) return result;
  }
  return ok(undefined);
}

export function validateDecisionOptions(
  id: string,
  kind: 'text' | 'decision',
  options: Record<string, unknown> | undefined,
): Result<void, CodepolicyError> {
  if (kind === 'decision' && options !== undefined) {
    return err(
      codepolicyError(
        'CONFIG_PARSE_ERROR',
        `Rule "${id}" does not accept options: ${Object.keys(options).join(', ')}`,
      ),
    );
  }
  return ok(undefined);
}
