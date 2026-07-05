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
): CacheKeyInput {
  // fileTree を prompt に含めない rule は、ファイル追加で cache を無効化する必要がない。
  // rule.usesFileTree===true のときだけ fileTreeHash を key に組み込む。
  const fileTreeHash =
    rule.usesFileTree === true && fileTree
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
