import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type CachedEntry, makeCacheKey } from './cache-store';
import { createFileCacheStore } from './file-cache-store';

const asKey = makeCacheKey;

const sampleEntry: CachedEntry = {
  verdict: 'pass',
  reasoning: 'looks fine',
  citations: [],
  savedAt: '2026-04-19T00:00:00.000Z',
  codepolicyVersion: '0.0.0-test',
};

describe('FileCacheStore', () => {
  let cacheRoot: string;

  beforeEach(async () => {
    cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codepolicy-cache-test-'));
  });

  afterEach(async () => {
    await fs.rm(cacheRoot, { recursive: true, force: true });
  });

  it('returns hit after save', async () => {
    const store = createFileCacheStore(cacheRoot);
    const key = asKey('a'.repeat(64));

    const saveResult = await store.save(key, sampleEntry);
    expect(saveResult.isOk()).toBe(true);

    const lookup = await store.lookup(key);
    expect(lookup.isOk()).toBe(true);
    const outcome = lookup._unsafeUnwrap();
    expect(outcome.kind).toBe('hit');
    if (outcome.kind === 'hit') {
      expect(outcome.entry).toEqual(sampleEntry);
    }
  });

  it('returns miss for unknown key', async () => {
    const store = createFileCacheStore(cacheRoot);
    const lookup = await store.lookup(asKey('b'.repeat(64)));
    expect(lookup.isOk()).toBe(true);
    expect(lookup._unsafeUnwrap().kind).toBe('miss');
  });

  it('returns corrupted when JSON is invalid', async () => {
    const store = createFileCacheStore(cacheRoot);
    const key = asKey('c'.repeat(64));
    const filePath = path.join(cacheRoot, `${key.raw}.json`);
    await fs.mkdir(cacheRoot, { recursive: true });
    await fs.writeFile(filePath, '{ broken json');

    const lookup = await store.lookup(key);
    expect(lookup.isOk()).toBe(true);
    const outcome = lookup._unsafeUnwrap();
    expect(outcome.kind).toBe('corrupted');
  });

  it('returns corrupted for a legacy score/reason entry (pre-verdict cache format)', async () => {
    // 旧フォーマット {score, reason} は additionalProperties:false + 必須 verdict/citations 欠如で
    // 必ず schema 不一致になる。旧キャッシュは corrupted → 再評価という移行経路の検証。
    const store = createFileCacheStore(cacheRoot);
    const key = asKey('f'.repeat(64));
    const filePath = path.join(cacheRoot, `${key.raw}.json`);
    await fs.mkdir(cacheRoot, { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({
        score: 80,
        reason: 'legacy entry',
        savedAt: '2026-01-01T00:00:00.000Z',
        codepolicyVersion: '0.0.0-legacy',
      }),
    );

    const lookup = await store.lookup(key);
    expect(lookup.isOk()).toBe(true);
    expect(lookup._unsafeUnwrap().kind).toBe('corrupted');
  });

  it('creates cache directory on first save', async () => {
    const nested = path.join(cacheRoot, 'deeply', 'nested');
    const store = createFileCacheStore(nested);
    const key = asKey('d'.repeat(64));

    const saveResult = await store.save(key, sampleEntry);
    expect(saveResult.isOk()).toBe(true);

    const exists = await fs
      .stat(path.join(nested, `${key.raw}.json`))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it('survives concurrent saves of the same key without corrupting JSON', async () => {
    const store = createFileCacheStore(cacheRoot);
    const key = asKey('e'.repeat(64));

    const variants: CachedEntry[] = Array.from({ length: 10 }, (_, i) => ({
      ...sampleEntry,
      citations: [String(i)],
    }));

    const results = await Promise.all(variants.map((entry) => store.save(key, entry)));
    expect(results.every((r) => r.isOk())).toBe(true);

    const lookup = await store.lookup(key);
    expect(lookup.isOk()).toBe(true);
    const outcome = lookup._unsafeUnwrap();
    expect(outcome.kind).toBe('hit');
  });
});
