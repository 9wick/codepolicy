import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { injectable } from '@needle-di/core';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { codepolicyError } from '../shared/errors';
import type { CodepolicyError } from '../shared/errors';

import { dynamicImport, extractDefaultRuleModule } from './external-rule-loader.lib';
import type { RuleModule } from './rule-types';

@injectable()
export class ExternalRuleLoader {
  load(rulePaths: string[], configDir: string): ResultAsync<RuleModule[], CodepolicyError> {
    return ResultAsync.combine(rulePaths.map((rulePath) => this.loadOne(rulePath, configDir)));
  }

  private loadOne(rulePath: string, configDir: string): ResultAsync<RuleModule, CodepolicyError> {
    const resolvedPath = path.resolve(configDir, rulePath);
    const importUrl = pathToFileURL(resolvedPath).href;

    return dynamicImport(importUrl, `Failed to load external rule module: ${rulePath}`).andThen(
      (loadedModule) => {
        const ruleModule = extractDefaultRuleModule(loadedModule);
        if (!ruleModule) {
          return errAsync(
            codepolicyError(
              'CONFIG_PARSE_ERROR',
              `External rule module must default-export { id, definition }: ${rulePath}`,
            ),
          );
        }
        return okAsync(ruleModule);
      },
    );
  }
}
