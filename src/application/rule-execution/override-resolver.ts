import path from 'node:path';

import { extractBorderline, extractLevel, extractOptions } from '../../rules/rule-config-utils';
import type { OverrideEntry, ResolvedRule } from '../../shared/types';

import { normalizeGlobPath } from './glob-path';

export function matchesOverride(filePath: string, override: OverrideEntry): boolean {
  const normalized = normalizeGlobPath(filePath);
  const matchesFiles = override.files.some((pattern) => path.matchesGlob(normalized, pattern));
  if (!matchesFiles) return false;
  if (override.ignores) {
    return !override.ignores.some((pattern) => path.matchesGlob(normalized, pattern));
  }
  return true;
}

export function applyOverrides(
  baseRule: ResolvedRule,
  filePath: string,
  overrides: OverrideEntry[],
): ResolvedRule | null {
  let level = baseRule.level;
  let borderline = baseRule.borderline;
  let options = baseRule.options;

  for (const override of overrides) {
    if (!matchesOverride(filePath, override)) continue;

    const ruleConfig = override.rules[baseRule.id];
    if (ruleConfig === undefined) continue;

    level = extractLevel(ruleConfig);
    const overrideBorderline = extractBorderline(ruleConfig);
    if (overrideBorderline !== undefined) {
      borderline = overrideBorderline;
    }
    const overrideOptions = extractOptions(ruleConfig);
    if (overrideOptions !== undefined) {
      options = overrideOptions;
    }
  }

  if (level === 'off') return null;

  return { ...baseRule, level, borderline, options };
}
