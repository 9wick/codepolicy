import { ok, err, ResultAsync } from 'neverthrow';
import { P, isMatching } from 'ts-pattern';

import { codepolicyError } from '../shared/errors';
import type { CodepolicyError } from '../shared/errors';

import type { RuleModule } from './rule-types';

const ruleDefinitionPattern = {
  meta: {
    scope: P.union(P.string, P.array(P.string)),
    threshold: P.number,
  },
  create: P.when((value: unknown) => typeof value === 'function'),
};

function isRuleDefinition(value: unknown): boolean {
  return isMatching(ruleDefinitionPattern, value);
}

function isRuleModule(value: unknown): boolean {
  return isMatching({ id: P.string, definition: P.when(isRuleDefinition) }, value);
}

export function extractDefaultRuleModule(loadedModule: unknown): RuleModule | undefined {
  if (!isMatching({ default: P.when(isRuleModule) }, loadedModule)) {
    return undefined;
  }

  // @ts-expect-error Runtime-validated via isRuleModule; function signatures cannot be narrowed by pattern matching
  const ruleModule: RuleModule = loadedModule.default;
  return ruleModule;
}

export function dynamicImport(
  url: string,
  errorMessage: string,
): ResultAsync<unknown, CodepolicyError> {
  return new ResultAsync(
    import(url).then(
      (mod: unknown) => ok(mod),
      (cause: unknown) => err(codepolicyError('RULE_NOT_FOUND', errorMessage, cause)),
    ),
  );
}
