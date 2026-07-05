import { createHash } from 'node:crypto';

import { InjectionToken, inject, injectable } from '@needle-di/core';
import { ResultAsync, okAsync } from 'neverthrow';

import {
  CacheStoreToken,
  type CacheKey,
  type CachedEntry,
  type LookupOutcome,
  makeCacheKey,
} from '../../infrastructure/cache/cache-store';
import type { CodepolicyError } from '../../shared/errors';
import type { RuleVerdict } from '../../shared/types';
import { CODEPOLICY_VERSION } from '../../shared/version';

export type CacheKeyInput = {
  ruleId: string;
  ruleVersion: string;
  codepolicyVersion: string;
  model: string;
  reasoningEffort: string | undefined;
  scopeCode: string;
  scopeSignature: string | undefined;
  scopeType: string;
  scopeName: string;
  filePath: string;
  fileTreeHash: string;
};

export const CacheDisabledToken = new InjectionToken<boolean>('CacheDisabled');

function buildKeyMaterial(input: CacheKeyInput): string {
  return [
    `r:${input.ruleId}`,
    `rv:${input.ruleVersion}`,
    `sv:${input.codepolicyVersion}`,
    `m:${input.model}`,
    `re:${input.reasoningEffort ?? ''}`,
    `st:${input.scopeType}`,
    `sn:${input.scopeName}`,
    `fp:${input.filePath}`,
    `fth:${input.fileTreeHash}`,
    `sg:${input.scopeSignature ?? ''}`,
    `sc:${input.scopeCode}`,
  ].join('\n');
}

@injectable()
export class EvalCacheService {
  constructor(
    private store = inject(CacheStoreToken),
    private disabled = inject(CacheDisabledToken),
    private inFlight: Map<string, ResultAsync<LookupOutcome, CodepolicyError>> = new Map(),
  ) {}

  static toCacheKey(input: CacheKeyInput): CacheKey {
    const hash = createHash('sha256').update(buildKeyMaterial(input)).digest('hex');
    return makeCacheKey(hash);
  }

  lookup(input: CacheKeyInput): ResultAsync<LookupOutcome, CodepolicyError> {
    if (this.disabled) return okAsync<LookupOutcome, CodepolicyError>({ kind: 'miss' });
    const key = EvalCacheService.toCacheKey(input);
    const existing = this.inFlight.get(key.raw);
    if (existing) return existing;

    const promise = this.store.lookup(key);
    this.inFlight.set(key.raw, promise);

    void promise.match(
      () => {
        this.inFlight.delete(key.raw);
      },
      () => {
        this.inFlight.delete(key.raw);
      },
    );

    return promise;
  }

  save(input: CacheKeyInput, verdict: RuleVerdict): ResultAsync<void, CodepolicyError> {
    if (this.disabled) return okAsync<void, CodepolicyError>(undefined);
    const key = EvalCacheService.toCacheKey(input);
    const entry: CachedEntry = {
      verdict: verdict.verdict,
      reasoning: verdict.reasoning,
      citations: verdict.citations,
      savedAt: new Date().toISOString(),
      codepolicyVersion: CODEPOLICY_VERSION,
    };
    return this.store.save(key, entry);
  }
}
