import { describe, expect, it } from 'vitest';

import { createTestContainer } from '../../test-support/test-container';

import { SimpleGitClient } from './simple-git.adapter';
import { GitDiffService } from './git-diff.service';

describe('GitDiffService', () => {
  it('should return changed files on successful diff', async () => {
    const rawDiff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index abc1234..def5678 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,4 @@',
      ' const a = 1;',
      '+const b = 2;',
      ' const c = 3;',
      ' const d = 4;',
    ].join('\n');

    const { target } = createTestContainer(GitDiffService, [
      {
        provide: SimpleGitClient,
        useValue: { diff: () => Promise.resolve(rawDiff), verifyRef: () => Promise.resolve('') },
      },
    ]);

    const result = await target.getChangedFiles();
    expect(result.isOk()).toBe(true);
    const files = result._unsafeUnwrap();
    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({
      filePath: 'src/foo.ts',
      lineRanges: [{ start: 2, end: 2 }],
    });
  });

  it('should return empty array when no diff', async () => {
    const { target } = createTestContainer(GitDiffService, [
      {
        provide: SimpleGitClient,
        useValue: { diff: () => Promise.resolve(''), verifyRef: () => Promise.resolve('') },
      },
    ]);

    const result = await target.getChangedFiles();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('should return GIT_NOT_REPO error when not in a git repository', async () => {
    const { target } = createTestContainer(GitDiffService, [
      {
        provide: SimpleGitClient,
        useValue: {
          diff: () =>
            Promise.reject(
              new Error('fatal: not a git repository (or any of the parent directories): .git'),
            ),
          verifyRef: () => Promise.resolve(''),
        },
      },
    ]);

    const result = await target.getChangedFiles();
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('GIT_NOT_REPO');
  });

  it('should return GIT_DIFF_ERROR for other git errors', async () => {
    const { target } = createTestContainer(GitDiffService, [
      {
        provide: SimpleGitClient,
        useValue: {
          diff: () => Promise.reject(new Error('some unexpected git error')),
          verifyRef: () => Promise.resolve('abc123'),
        },
      },
    ]);

    const result = await target.getChangedFiles();
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('GIT_DIFF_ERROR');
  });

  it('should pass base to SimpleGitClient.diff when specified', async () => {
    let capturedBase: string | undefined;
    const { target } = createTestContainer(GitDiffService, [
      {
        provide: SimpleGitClient,
        useValue: {
          diff: (base?: string) => {
            capturedBase = base;
            return Promise.resolve('');
          },
          verifyRef: () => Promise.resolve('abc123'),
        },
      },
    ]);

    await target.getChangedFiles('origin/main');
    expect(capturedBase).toBe('origin/main');
  });

  it('should use default HEAD when base is not specified', async () => {
    let capturedBase: string | undefined;
    const { target } = createTestContainer(GitDiffService, [
      {
        provide: SimpleGitClient,
        useValue: {
          diff: (base?: string) => {
            capturedBase = base;
            return Promise.resolve('');
          },
          verifyRef: () => Promise.resolve('abc123'),
        },
      },
    ]);

    await target.getChangedFiles();
    expect(capturedBase).toBeUndefined();
  });

  it('should reject base starting with dash', async () => {
    const { target } = createTestContainer(GitDiffService, [
      {
        provide: SimpleGitClient,
        useValue: {
          diff: () => Promise.resolve(''),
          verifyRef: () => Promise.resolve('abc123'),
        },
      },
    ]);

    const result = await target.getChangedFiles('--malicious');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('GIT_INVALID_BASE');
  });

  it('should return GIT_BASE_NOT_FOUND when ref does not exist', async () => {
    const { target } = createTestContainer(GitDiffService, [
      {
        provide: SimpleGitClient,
        useValue: {
          diff: () => Promise.resolve(''),
          verifyRef: () => Promise.reject(new Error('fatal: Needed a single revision')),
        },
      },
    ]);

    const result = await target.getChangedFiles('nonexistent-ref');
    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe('GIT_BASE_NOT_FOUND');
    expect(error.message).toContain('nonexistent-ref');
  });
});
