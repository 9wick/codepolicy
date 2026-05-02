import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExternalRuleLoader } from './external-rule-loader.service';

describe('ExternalRuleLoader', () => {
  let tmpDir: string;
  let loader: ExternalRuleLoader;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codepolicy-external-rule-'));
    loader = new ExternalRuleLoader();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads a project-specific rule module from config-relative path', async () => {
    const rulesDir = path.join(tmpDir, 'tools', 'codepolicy-rules');
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(
      path.join(rulesDir, 'plain-language.mjs'),
      `export default {
  id: 'plain-language',
  definition: {
    meta: { scope: 'file', threshold: 70 },
    create: () => ({})
  }
};
`,
    );

    const result = await loader.load(['./tools/codepolicy-rules/plain-language.mjs'], tmpDir);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject([
      {
        id: 'plain-language',
        definition: {
          meta: {
            scope: 'file',
            threshold: 70,
          },
        },
      },
    ]);
  });

  it('rejects an external rule module with invalid default export', async () => {
    const rulesDir = path.join(tmpDir, 'tools', 'codepolicy-rules');
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(path.join(rulesDir, 'broken.mjs'), `export default { nope: true };`);

    const result = await loader.load(['./tools/codepolicy-rules/broken.mjs'], tmpDir);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('CONFIG_PARSE_ERROR');
  });
});
