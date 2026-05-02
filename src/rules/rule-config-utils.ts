import type { RuleConfig, RuleLevel } from '../shared/types';

export function extractLevel(ruleConfig: RuleConfig): RuleLevel {
  return typeof ruleConfig === 'string' ? ruleConfig : ruleConfig.level;
}

export function extractThreshold(ruleConfig: RuleConfig): number | undefined {
  return typeof ruleConfig === 'object' ? ruleConfig.threshold : undefined;
}

export function extractOptions(ruleConfig: RuleConfig): Record<string, unknown> | undefined {
  if (typeof ruleConfig === 'string') return undefined;
  const copy: Record<string, unknown> = { ...ruleConfig };
  delete copy.level;
  delete copy.threshold;
  return Object.keys(copy).length > 0 ? copy : undefined;
}
