import type { BorderlineHandling, RuleConfig, RuleLevel } from '../shared/types';

export function extractLevel(ruleConfig: RuleConfig): RuleLevel {
  return typeof ruleConfig === 'string' ? ruleConfig : ruleConfig.level;
}

// default ('warn' when absent) は呼び出し側 (resolver) が適用する。ここでは config の生値のみ返す。
export function extractBorderline(ruleConfig: RuleConfig): BorderlineHandling | undefined {
  return typeof ruleConfig === 'object' ? ruleConfig.borderline : undefined;
}

export function extractOptions(ruleConfig: RuleConfig): Record<string, unknown> | undefined {
  if (typeof ruleConfig === 'string') return undefined;
  const copy: Record<string, unknown> = { ...ruleConfig };
  delete copy.level;
  delete copy.borderline;
  return Object.keys(copy).length > 0 ? copy : undefined;
}
