import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ResultAsync, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CacheStore } from '../../infrastructure/cache/cache-store';
import { createFileCacheStore } from '../../infrastructure/cache/file-cache-store';

import { type CacheKeyInput, EvalCacheService } from './eval-cache.service';

const baseInput: CacheKeyInput = {
  ruleId: 'no-implicit-fallback',
  ruleVersion: 'v1-hash',
  codepolicyVersion: '0.0.1',
  model: 'github-copilot/gpt-4.1',
  reasoningEffort: undefined,
  scopeCode: 'function foo() { return 1 }',
  scopeSignature: 'function foo(): number',
  scopeType: 'function',
  scopeName: 'foo',
  filePath: 'src/foo.ts',
  fileTreeHash: 'tree-1',
};

describe('EvalCacheService.toCacheKey', () => {
  it('produces the same key for the same input', () => {
    expect(EvalCacheService.toCacheKey(baseInput).raw).toBe(
      EvalCacheService.toCacheKey({ ...baseInput }).raw,
    );
  });

  it('produces a different key when model changes', () => {
    expect(EvalCacheService.toCacheKey(baseInput).raw).not.toBe(
      EvalCacheService.toCacheKey({ ...baseInput, model: 'openai/gpt-5' }).raw,
    );
  });

  it('produces a different key when reasoningEffort changes', () => {
    expect(EvalCacheService.toCacheKey(baseInput).raw).not.toBe(
      EvalCacheService.toCacheKey({ ...baseInput, reasoningEffort: 'high' }).raw,
    );
  });

  it('produces a different key when fileTreeHash changes', () => {
    expect(EvalCacheService.toCacheKey(baseInput).raw).not.toBe(
      EvalCacheService.toCacheKey({ ...baseInput, fileTreeHash: 'tree-2' }).raw,
    );
  });

  it('produces a different key when scopeSignature changes', () => {
    expect(EvalCacheService.toCacheKey(baseInput).raw).not.toBe(
      EvalCacheService.toCacheKey({ ...baseInput, scopeSignature: 'different' }).raw,
    );
  });

  it('produces a different key when ruleVersion changes', () => {
    expect(EvalCacheService.toCacheKey(baseInput).raw).not.toBe(
      EvalCacheService.toCacheKey({ ...baseInput, ruleVersion: 'v2-hash' }).raw,
    );
  });
});

describe('EvalCacheService (with FileCacheStore)', () => {
  let cacheRoot: string;
  let service: EvalCacheService;

  beforeEach(async () => {
    cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codepolicy-eval-cache-'));
    service = new EvalCacheService(createFileCacheStore(cacheRoot), false);
  });

  afterEach(async () => {
    await fs.rm(cacheRoot, { recursive: true, force: true });
  });

  it('save then lookup returns hit', async () => {
    const saveResult = await service.save(baseInput, {
      verdict: 'violation',
      reasoning: 'ok',
      citations: ['const x = 1;'],
    });
    expect(saveResult.isOk()).toBe(true);

    const lookup = await service.lookup(baseInput);
    const outcome = lookup._unsafeUnwrap();
    expect(outcome.kind).toBe('hit');
    if (outcome.kind === 'hit') {
      expect(outcome.entry.verdict).toBe('violation');
      expect(outcome.entry.reasoning).toBe('ok');
      expect(outcome.entry.citations).toEqual(['const x = 1;']);
    }
  });

  it('lookup with no save returns miss', async () => {
    const lookup = await service.lookup(baseInput);
    expect(lookup._unsafeUnwrap().kind).toBe('miss');
  });

  it('singleflights concurrent lookups: only one underlying lookup is observed', async () => {
    // counter ベースで「内部 lookup が走った回数」を観測する。3 並列でも 1 回しか走らない振る舞いを検証。
    let underlyingLookupCount = 0;
    const slowStore: CacheStore = {
      lookup: () =>
        ResultAsync.fromSafePromise(
          new Promise<{ kind: 'miss' }>((resolve) => {
            underlyingLookupCount++;
            setTimeout(() => resolve({ kind: 'miss' }), 5);
          }),
        ),
      save: () => okAsync(undefined),
    };
    const svc = new EvalCacheService(slowStore, false);

    const outcomes = await Promise.all([
      svc.lookup(baseInput),
      svc.lookup(baseInput),
      svc.lookup(baseInput),
    ]);

    // 振る舞い: 3 並列が同じ結果を受け取り、underlying lookup は 1 回だけ
    expect(outcomes.every((o) => o._unsafeUnwrap().kind === 'miss')).toBe(true);
    expect(underlyingLookupCount).toBe(1);
  });

  it('singleflight is per-key: different keys trigger separate lookups', async () => {
    let underlyingLookupCount = 0;
    const slowStore: CacheStore = {
      lookup: () =>
        ResultAsync.fromSafePromise(
          new Promise<{ kind: 'miss' }>((resolve) => {
            underlyingLookupCount++;
            setTimeout(() => resolve({ kind: 'miss' }), 5);
          }),
        ),
      save: () => okAsync(undefined),
    };
    const svc = new EvalCacheService(slowStore, false);

    await Promise.all([
      svc.lookup({ ...baseInput, scopeName: 'a' }),
      svc.lookup({ ...baseInput, scopeName: 'b' }),
      svc.lookup({ ...baseInput, scopeName: 'c' }),
    ]);

    expect(underlyingLookupCount).toBe(3);
  });

  it('disabled service: lookup returns miss and save has no observable effect', async () => {
    // disabled の振る舞いを「結果」と「副作用がないこと」の両面で観測する。
    // save 後の lookup でも miss が返ること = 永続化されていないこと。
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codepolicy-disabled-'));
    try {
      const svc = new EvalCacheService(createFileCacheStore(root), true);

      const lookupBefore = await svc.lookup(baseInput);
      expect(lookupBefore._unsafeUnwrap().kind).toBe('miss');

      const saveResult = await svc.save(baseInput, {
        verdict: 'pass',
        reasoning: 'should not persist',
        citations: [],
      });
      expect(saveResult.isOk()).toBe(true);

      const lookupAfter = await svc.lookup(baseInput);
      expect(lookupAfter._unsafeUnwrap().kind).toBe('miss');

      // 副作用がない = ファイルが書かれていない
      const filesAfter = await fs.readdir(root).catch(() => []);
      expect(filesAfter).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
