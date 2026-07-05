import { createHash } from 'node:crypto';

import type { TObject } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { injectable } from '@needle-di/core';
import { err, ok } from 'neverthrow';
import type { Result } from 'neverthrow';

import { codepolicyError } from '../shared/errors';
import type { CodepolicyError } from '../shared/errors';
import type { ResolvedRule, CodepolicyConfig } from '../shared/types';

import { extractBorderline, extractLevel, extractOptions } from './rule-config-utils';
import type { RuleModule } from './rule-types';

function computeRuleVersion(mod: RuleModule, options: Record<string, unknown> | undefined): string {
  const material = [
    mod.definition.create.toString(),
    mod.definition.optionsSchema ? JSON.stringify(mod.definition.optionsSchema) : '',
    options ? JSON.stringify(options) : '',
  ].join('\n');
  return createHash('sha256').update(material).digest('hex');
}

function validateOptions(
  ruleId: string,
  options: Record<string, unknown> | undefined,
  optionsSchema: TObject | undefined,
): Result<Record<string, unknown> | undefined, CodepolicyError> {
  if (!optionsSchema) {
    if (options) {
      return err(
        codepolicyError(
          'CONFIG_PARSE_ERROR',
          `Rule "${ruleId}" does not accept options: ${Object.keys(options).join(', ')}`,
        ),
      );
    }
    return ok(undefined);
  }

  const effective = options ?? {};
  if (!Value.Check(optionsSchema, effective)) {
    const errors = [...Value.Errors(optionsSchema, effective)];
    const messages = errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    return err(
      codepolicyError('CONFIG_PARSE_ERROR', `Invalid options for rule "${ruleId}": ${messages}`),
    );
  }

  return ok(effective);
}

function buildRuleMap(rules: RuleModule[]): Map<string, RuleModule> {
  const ruleMap = new Map<string, RuleModule>();
  for (const rule of rules) {
    ruleMap.set(rule.id, rule);
  }
  return ruleMap;
}

function checkMissingRules(
  ruleMap: Map<string, RuleModule>,
  config: CodepolicyConfig,
): Result<void, CodepolicyError> {
  const configRuleIds = Object.keys(config.rules);
  const missingIds = configRuleIds.filter((id) => !ruleMap.has(id));
  if (missingIds.length > 0) {
    return err(
      codepolicyError(
        'RULE_NOT_FOUND',
        `Rule files not found for configured rules: ${missingIds.join(', ')}`,
      ),
    );
  }

  const overrideRuleIds = (config.overrides ?? []).flatMap((o) => Object.keys(o.rules));
  const missingOverrideIds = overrideRuleIds.filter((id) => !ruleMap.has(id));
  if (missingOverrideIds.length > 0) {
    return err(
      codepolicyError(
        'RULE_NOT_FOUND',
        `Rule files not found for override rules: ${[...new Set(missingOverrideIds)].join(', ')}`,
      ),
    );
  }

  return ok(undefined);
}

function resolveRule(
  id: string,
  config: CodepolicyConfig,
  ruleMap: Map<string, RuleModule>,
): Result<ResolvedRule | undefined, CodepolicyError> {
  const ruleConfig = config.rules[id];
  if (ruleConfig === undefined) return ok(undefined);

  const mod = ruleMap.get(id);
  if (!mod) return ok(undefined);

  const rawOptions = extractOptions(ruleConfig);
  return validateOptions(id, rawOptions, mod.definition.optionsSchema).map((options) => ({
    id: mod.id,
    scope: mod.definition.meta.scope,
    agent: config.agent,
    borderline: extractBorderline(ruleConfig) ?? 'warn',
    level: extractLevel(ruleConfig),
    create: mod.definition.create,
    options,
    cacheable: mod.definition.meta.cacheable,
    usesFileTree: mod.definition.meta.usesFileTree,
    ruleVersion: computeRuleVersion(mod, options),
  }));
}

@injectable()
export class RuleResolver {
  resolve(config: CodepolicyConfig, rules: RuleModule[]): Result<ResolvedRule[], CodepolicyError> {
    const ruleMap = buildRuleMap(rules);

    const checkResult = checkMissingRules(ruleMap, config);
    if (checkResult.isErr()) return err(checkResult.error);

    const resolved: ResolvedRule[] = [];
    for (const id of Object.keys(config.rules)) {
      const result = resolveRule(id, config, ruleMap);
      if (result.isErr()) return err(result.error);
      if (result.value) resolved.push(result.value);
    }

    return ok(resolved);
  }
}
