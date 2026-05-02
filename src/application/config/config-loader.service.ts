import fs from 'node:fs/promises';
import path from 'node:path';

import { InjectionToken, inject, injectable } from '@needle-di/core';
import { ResultAsync } from 'neverthrow';

import { parseYamlWithSchema, validateCodepolicyConfig } from '../../shared/schema';
import { codepolicyError } from '../../shared/errors';
import type { CodepolicyError } from '../../shared/errors';
import type { CodepolicyConfig } from '../../shared/types';

export const WorkingDir = new InjectionToken<string>('WorkingDir');

@injectable()
export class ConfigLoader {
  constructor(private workingDir = inject(WorkingDir)) {}

  load(configPath?: string): ResultAsync<CodepolicyConfig, CodepolicyError> {
    const resolvedPath = configPath ?? path.join(this.workingDir, '.codepolicy.yml');

    return ResultAsync.fromPromise(fs.readFile(resolvedPath, 'utf-8'), (cause) =>
      codepolicyError('CONFIG_NOT_FOUND', `Config file not found: ${resolvedPath}`, cause),
    ).andThen((content) =>
      parseYamlWithSchema(content, validateCodepolicyConfig, {
        parseErrorCode: 'CONFIG_PARSE_ERROR',
        parseErrorMessage: 'Failed to parse config YAML.',
        objectErrorMessage: 'Config must be a YAML object.',
        objectLabel: 'Config',
      }),
    );
  }
}
