import { injectable } from '@needle-di/core';
import { Result, ok } from 'neverthrow';

import type { CodepolicyError } from '../../shared/errors';
import { codepolicyError } from '../../shared/errors';
import type { ChangedFile } from '../../shared/types';

import { parseFileSection, splitIntoFileSections } from './diff-parser.lib';

@injectable()
export class DiffParser {
  parse(rawDiff: string): Result<ChangedFile[], CodepolicyError> {
    if (rawDiff.trim() === '') {
      return ok([]);
    }

    return Result.fromThrowable(
      () => {
        const files: ChangedFile[] = [];
        const fileSections = splitIntoFileSections(rawDiff);
        for (const section of fileSections) {
          const parsed = parseFileSection(section);
          if (parsed) {
            files.push(parsed);
          }
        }
        return files;
      },
      (cause) => codepolicyError('GIT_DIFF_ERROR', 'Failed to parse diff output', cause),
    )();
  }
}
