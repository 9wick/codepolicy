import { createHash } from 'node:crypto';

import type {
  LintResult,
  ModelReasoningEffort,
  ResolvedRule,
  RuleVerdict,
  ScopeUnit,
  TokenUsage,
} from '../../shared/types';
import { CODEPOLICY_VERSION } from '../../shared/version';

import type { CacheKeyInput } from './eval-cache.service';

export function buildCacheInput(
  scope: ScopeUnit,
  rule: ResolvedRule,
  fileTree: string | undefined,
  reasoningEffort: ModelReasoningEffort | undefined,
  mode?: 'file',
): CacheKeyInput {
  // Jevはinclude、textはmetaで宣言した場合だけ、ファイル構成の変化で無効化する。
  const usesFileTree =
    rule.kind === 'decision'
      ? rule.definition.include.includes('fileTree')
      : rule.usesFileTree === true;
  const fileTreeHash =
    usesFileTree && fileTree
      ? createHash('sha256').update(fileTree).digest('hex').slice(0, 16)
      : '';
  return {
    ruleId: rule.id,
    ruleVersion: rule.ruleVersion ?? '',
    codepolicyVersion: CODEPOLICY_VERSION,
    model: rule.agent,
    reasoningEffort,
    scopeCode: scope.code,
    scopeSignature: scope.signature,
    scopeType: scope.scopeType,
    scopeName: scope.name,
    filePath: scope.filePath,
    fileTreeHash,
    ...(mode ? { mode } : {}),
  };
}

const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

export function buildResultFromCache(
  scope: ScopeUnit,
  rule: ResolvedRule,
  cachedVerdict: RuleVerdict,
  durationMs: number,
): LintResult {
  return {
    filePath: scope.filePath,
    scopeName: scope.name,
    rule,
    verdict: cachedVerdict.verdict,
    reasoning: cachedVerdict.reasoning,
    citations: cachedVerdict.citations,
    usage: ZERO_USAGE,
    durationMs,
  };
}
