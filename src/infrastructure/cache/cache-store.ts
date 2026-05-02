import { InjectionToken } from '@needle-di/core';
import type { ResultAsync } from 'neverthrow';

import type { CodepolicyError } from '../../shared/errors';

export type CacheKey = { readonly raw: string };

export function makeCacheKey(raw: string): CacheKey {
  return { raw };
}

export type CachedEntry = {
  score: number;
  reason: string;
  savedAt: string;
  codepolicyVersion: string;
};

export type LookupOutcome =
  | { kind: 'hit'; entry: CachedEntry }
  | { kind: 'miss' }
  | { kind: 'corrupted'; cause: Error };

export type CacheStore = {
  lookup(key: CacheKey): ResultAsync<LookupOutcome, CodepolicyError>;
  save(key: CacheKey, entry: CachedEntry): ResultAsync<void, CodepolicyError>;
};

export const CacheStoreToken = new InjectionToken<CacheStore>('CacheStore');

export const CacheDisabledToken = new InjectionToken<boolean>('CacheDisabled');
