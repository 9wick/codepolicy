import { inject, injectable } from '@needle-di/core';
import { ResultAsync, errAsync } from 'neverthrow';

import type { CodepolicyError } from '../../shared/errors';
import { codepolicyError } from '../../shared/errors';
import type { ChangedFile } from '../../shared/types';

import { DiffParser } from './diff.parser';
import { SimpleGitClient } from './simple-git.adapter';

function validateBase(base: string): CodepolicyError | null {
  if (base.startsWith('-')) {
    return codepolicyError(
      'GIT_INVALID_BASE',
      `Invalid base ref "${base}": must not start with "-".`,
    );
  }
  return null;
}

@injectable()
export class GitDiffService {
  constructor(
    private git = inject(SimpleGitClient),
    private diffParser = inject(DiffParser),
  ) {}

  getChangedFiles(base?: string): ResultAsync<ChangedFile[], CodepolicyError> {
    if (base !== undefined) {
      const validationError = validateBase(base);
      if (validationError) {
        return errAsync(validationError);
      }
      return this.verifyAndDiff(base);
    }
    return this.executeDiff();
  }

  private verifyAndDiff(base: string): ResultAsync<ChangedFile[], CodepolicyError> {
    const git = this.git;
    return ResultAsync.fromPromise(git.verifyRef(base), (cause) =>
      codepolicyError(
        'GIT_BASE_NOT_FOUND',
        `Base ref "${base}" not found. If running in CI, ensure the ref is fetched (e.g. git fetch --depth=1 origin ${base}).`,
        cause,
      ),
    ).andThen(() => this.executeDiff(base));
  }

  private executeDiff(base?: string): ResultAsync<ChangedFile[], CodepolicyError> {
    const git = this.git;
    return ResultAsync.fromPromise(git.diff(base), (cause) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.includes('not a git repository')) {
        return codepolicyError('GIT_NOT_REPO', 'Not a git repository', cause);
      }
      return codepolicyError('GIT_DIFF_ERROR', `Failed to get git diff: ${message}`, cause);
    }).andThen((rawDiff) => this.diffParser.parse(rawDiff));
  }
}
