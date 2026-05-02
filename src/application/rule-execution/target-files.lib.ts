import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { ResultAsync, okAsync } from 'neverthrow';

import type { CodepolicyError } from '../../shared/errors';
import { codepolicyError } from '../../shared/errors';
import type { ChangedFile } from '../../shared/types';

import { shouldSkipEntry } from './fs-walk';
import { normalizeGlobPath } from './glob-path';

function shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean {
  const normalizedPath = normalizeGlobPath(filePath);
  return ignorePatterns.some((pattern) => path.matchesGlob(normalizedPath, pattern));
}

function buildFileChainFromEntries(
  entries: Dirent[],
  rootDir: string,
  currentDir: string,
  ignorePatterns: string[],
): ResultAsync<string[], CodepolicyError> {
  let chain: ResultAsync<string[], CodepolicyError> = okAsync([]);

  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue;

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);
    if (shouldIgnoreFile(relativePath, ignorePatterns)) continue;

    if (entry.isDirectory()) {
      chain = chain.andThen((files) =>
        collectTypeScriptFiles(rootDir, absolutePath, ignorePatterns).map((subFiles) => [
          ...files,
          ...subFiles,
        ]),
      );
      continue;
    }

    if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      chain = chain.map((files) => [...files, relativePath]);
    }
  }

  return chain;
}

export function collectTypeScriptFiles(
  rootDir: string,
  currentDir: string,
  ignorePatterns: string[],
): ResultAsync<string[], CodepolicyError> {
  return ResultAsync.fromPromise(fs.readdir(currentDir, { withFileTypes: true }), (cause) =>
    codepolicyError(
      'FILE_READ_ERROR',
      `Failed to read directory: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    ),
  ).andThen((entries) => buildFileChainFromEntries(entries, rootDir, currentDir, ignorePatterns));
}

function createChangedFileForAll(
  rootDir: string,
  filePath: string,
): ResultAsync<ChangedFile, CodepolicyError> {
  return ResultAsync.fromPromise(fs.readFile(path.join(rootDir, filePath), 'utf-8'), (cause) =>
    codepolicyError(
      'FILE_READ_ERROR',
      `Failed to read file: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    ),
  ).map((sourceCode) => {
    const totalLines = sourceCode.split('\n').length;
    return { filePath, lineRanges: [{ start: 1, end: totalLines }] };
  });
}

export function loadAllFiles(
  workingDir: string,
  ignorePatterns: string[],
): ResultAsync<ChangedFile[], CodepolicyError> {
  return collectTypeScriptFiles(workingDir, workingDir, ignorePatterns).andThen((filePaths) =>
    ResultAsync.combine(filePaths.map((filePath) => createChangedFileForAll(workingDir, filePath))),
  );
}
