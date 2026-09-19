import { errAsync, okAsync, type ResultAsync } from 'neverthrow';

import { codepolicyError } from '../shared/errors';
import type { CodepolicyError } from '../shared/errors';
import type { CodepolicyConfig } from '../shared/types';

import { builtinRules } from './builtin-rules';
import { builtinDecisionRules } from './builtin-decision-rules';
import type { RegisteredRule } from './decision-rule-types';
import { ExternalRuleLoader } from './external-rule-loader.service';

function findDuplicateRuleIds(rules: RegisteredRule[]): string[] {
  const counts = new Map<string, number>();
  for (const rule of rules) {
    counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
}

export function loadRuleModules(
  config: CodepolicyConfig,
  externalRuleLoader: ExternalRuleLoader,
  configDir: string,
): ResultAsync<RegisteredRule[], CodepolicyError> {
  return externalRuleLoader.load(config.rulePaths ?? [], configDir).andThen((externalRules) => {
    const combinedRules = [...builtinRules, ...builtinDecisionRules, ...externalRules];
    const duplicateIds = findDuplicateRuleIds(combinedRules);
    if (duplicateIds.length > 0) {
      return errAsync(
        codepolicyError(
          'CONFIG_PARSE_ERROR',
          `Duplicate rule ids found across builtin and external rules: ${duplicateIds.join(', ')}`,
        ),
      );
    }
    return okAsync(combinedRules);
  });
}
