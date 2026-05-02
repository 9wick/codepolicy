import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestContainer } from '../../test-support/test-container';

import { WorkingDir } from './config-loader.service';
import { ConfigLoader } from './config-loader.service';

describe('ConfigLoader', () => {
  let tmpDir: string;
  let loader: ConfigLoader;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codepolicy-config-'));
    ({ target: loader } = createTestContainer(ConfigLoader, [
      { provide: WorkingDir, useValue: tmpDir },
    ]));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should load a valid config with defaults', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.codepolicy.yml'),
      `agent: github-copilot/gpt-4.1
rules:
  naming-convention: error
  no-magic-numbers:
    level: warn
    threshold: 5
`,
    );

    const result = await loader.load();

    expect(result.isOk()).toBe(true);
    const config = result._unsafeUnwrap();
    expect(config.filter).toBe('diff');
    expect(config.rules).toEqual({
      'naming-convention': 'error',
      'no-magic-numbers': { level: 'warn', threshold: 5 },
    });
    expect(config.ignore).toBeUndefined();
  });

  it('should load config with explicit filter and ignore', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.codepolicy.yml'),
      `agent: github-copilot/gpt-4.1
filter: all
rules:
  naming-convention: error
ignore:
  - "**/*.test.ts"
  - "dist/**"
`,
    );

    const result = await loader.load();

    expect(result.isOk()).toBe(true);
    const config = result._unsafeUnwrap();
    expect(config.filter).toBe('all');
    expect(config.ignore).toEqual(['**/*.test.ts', 'dist/**']);
  });

  it('should load config with project-specific rule paths', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.codepolicy.yml'),
      `agent: github-copilot/gpt-4.1
rulePaths:
  - ./tools/codepolicy-rules/plain-language.mjs
rules:
  plain-language: error
`,
    );

    const result = await loader.load();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      filter: 'diff',
      rulePaths: ['./tools/codepolicy-rules/plain-language.mjs'],
      rules: {
        'plain-language': 'error',
      },
    });
  });

  it('should allow $schema in config and exclude it from the loaded result', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.codepolicy.yml'),
      `$schema: "./schemas/codepolicy-config.schema.json"
agent: github-copilot/gpt-4.1
rules:
  naming-convention: error
`,
    );

    const result = await loader.load();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      filter: 'diff',
      agent: 'github-copilot/gpt-4.1',
      rules: {
        'naming-convention': 'error',
      },
    });
  });

  it('should load config from explicit path', async () => {
    const customPath = path.join(tmpDir, 'custom.yml');
    await fs.writeFile(
      customPath,
      `agent: github-copilot/gpt-4.1
rules:
  naming-convention: warn
`,
    );

    const result = await loader.load(customPath);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().rules).toEqual({ 'naming-convention': 'warn' });
  });

  it('should return CONFIG_NOT_FOUND when file does not exist', async () => {
    const result = await loader.load();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('CONFIG_NOT_FOUND');
  });

  it('should return CONFIG_PARSE_ERROR for invalid YAML', async () => {
    await fs.writeFile(path.join(tmpDir, '.codepolicy.yml'), 'rules: [invalid yaml');

    const result = await loader.load();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('CONFIG_PARSE_ERROR');
  });

  it('should return CONFIG_PARSE_ERROR when rules field is missing', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.codepolicy.yml'),
      `agent: github-copilot/gpt-4.1
filter: diff
`,
    );

    const result = await loader.load();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('CONFIG_PARSE_ERROR');
    expect(result._unsafeUnwrapErr().message).toContain('rules');
  });

  it('should return CONFIG_PARSE_ERROR when rules is not an object', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.codepolicy.yml'),
      `agent: github-copilot/gpt-4.1
rules:
  - naming-convention
  - no-magic-numbers
`,
    );

    const result = await loader.load();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('CONFIG_PARSE_ERROR');
    expect(result._unsafeUnwrapErr().message).toContain('rules');
  });

  it('should return CONFIG_PARSE_ERROR for invalid filter value', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.codepolicy.yml'),
      `agent: github-copilot/gpt-4.1
filter: staged
rules:
  naming-convention: error
`,
    );

    const result = await loader.load();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('CONFIG_PARSE_ERROR');
    expect(result._unsafeUnwrapErr().message).toContain('filter');
  });

  it('should return CONFIG_PARSE_ERROR when config is a scalar', async () => {
    await fs.writeFile(path.join(tmpDir, '.codepolicy.yml'), 'just a string\n');

    const result = await loader.load();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('CONFIG_PARSE_ERROR');
  });

  it('should load config with base field', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.codepolicy.yml'),
      `agent: github-copilot/gpt-4.1
base: origin/main
rules:
  naming-convention: error
`,
    );

    const result = await loader.load();

    expect(result.isOk()).toBe(true);
    const config = result._unsafeUnwrap();
    expect(config.base).toBe('origin/main');
  });

  it('should leave base undefined when not specified', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.codepolicy.yml'),
      `agent: github-copilot/gpt-4.1
rules:
  naming-convention: error
`,
    );

    const result = await loader.load();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().base).toBeUndefined();
  });

  it('should return CONFIG_PARSE_ERROR when ignore is not an array', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.codepolicy.yml'),
      `agent: github-copilot/gpt-4.1
rules:
  naming-convention: error
ignore: "*.test.ts"
`,
    );

    const result = await loader.load();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('CONFIG_PARSE_ERROR');
    expect(result._unsafeUnwrapErr().message).toContain('ignore');
  });

  it('should reject config without agent', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.codepolicy.yml'),
      `rules:
  naming-convention: error
`,
    );

    const result = await loader.load();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('CONFIG_PARSE_ERROR');
  });
});
