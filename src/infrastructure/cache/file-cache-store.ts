import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Type } from '@sinclair/typebox';
import { Result, ResultAsync, errAsync, okAsync } from 'neverthrow';

import type { CodepolicyError } from '../../shared/errors';
import { codepolicyError } from '../../shared/errors';
import { validateBySchema } from '../llm/llm-provider';

import type { CacheKey, CacheStore, CachedEntry, LookupOutcome } from './cache-store';

const cachedEntrySchema = Type.Object(
  {
    score: Type.Number(),
    reason: Type.String(),
    savedAt: Type.String(),
    codepolicyVersion: Type.String(),
  },
  { additionalProperties: false },
);

function toFilePath(rootDir: string, key: CacheKey): string {
  return path.join(rootDir, `${key.raw}.json`);
}

function isNotFoundError(cause: unknown): boolean {
  if (cause === null || typeof cause !== 'object') return false;
  return Reflect.get(cause, 'code') === 'ENOENT';
}

function readRawFile(filePath: string): ResultAsync<string | null, CodepolicyError> {
  return ResultAsync.fromPromise(fs.readFile(filePath, 'utf-8'), (cause) => cause).orElse(
    (cause) =>
      isNotFoundError(cause)
        ? okAsync<string | null, CodepolicyError>(null)
        : errAsync(
            codepolicyError(
              'CACHE_READ_ERROR',
              `Failed to read cache entry at ${filePath}: ${cause instanceof Error ? cause.message : String(cause)}`,
              cause,
            ),
          ),
  );
}

const parseJson = Result.fromThrowable(
  (raw: string): unknown => JSON.parse(raw),
  (cause): Error => (cause instanceof Error ? cause : new Error(String(cause))),
);

function classifyRaw(raw: string | null): LookupOutcome {
  if (raw === null) return { kind: 'miss' };
  const parsed = parseJson(raw);
  if (parsed.isErr()) return { kind: 'corrupted', cause: parsed.error };
  const validated = validateBySchema(parsed.value, cachedEntrySchema);
  if (validated.isErr()) return { kind: 'corrupted', cause: validated.error };
  const entry: CachedEntry = {
    score: validated.value.score,
    reason: validated.value.reason,
    savedAt: validated.value.savedAt,
    codepolicyVersion: validated.value.codepolicyVersion,
  };
  return { kind: 'hit', entry };
}

function ensureDir(dir: string): ResultAsync<void, CodepolicyError> {
  return ResultAsync.fromPromise(fs.mkdir(dir, { recursive: true }), (cause) =>
    codepolicyError(
      'CACHE_WRITE_ERROR',
      `Failed to create cache directory ${dir}: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    ),
  ).map(() => undefined);
}

function writeAtomic(
  finalPath: string,
  payload: string,
  rootDir: string,
): ResultAsync<void, CodepolicyError> {
  const tempPath = path.join(rootDir, `.tmp-${randomBytes(8).toString('hex')}`);
  return ResultAsync.fromPromise(fs.writeFile(tempPath, payload, 'utf-8'), (cause) =>
    codepolicyError(
      'CACHE_WRITE_ERROR',
      `Failed to write temp cache entry at ${tempPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    ),
  ).andThen(() =>
    ResultAsync.fromPromise(fs.rename(tempPath, finalPath), (cause) =>
      codepolicyError(
        'CACHE_WRITE_ERROR',
        `Failed to rename cache entry to ${finalPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      ),
    ),
  );
}

export function createFileCacheStore(rootDir: string): CacheStore {
  return {
    lookup(key) {
      return readRawFile(toFilePath(rootDir, key)).map(classifyRaw);
    },
    save(key, entry) {
      const payload = JSON.stringify(entry);
      const finalPath = toFilePath(rootDir, key);
      return ensureDir(rootDir).andThen(() => writeAtomic(finalPath, payload, rootDir));
    },
  };
}
