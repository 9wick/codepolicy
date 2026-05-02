import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const cliDir = path.resolve(import.meta.dirname);

const cliFiles = [
  'entry.ts',
  'commands/rule-run.command.ts',
  'commands/rule-list.command.ts',
  'commands/rule-show.command.ts',
  'commands/validate.command.ts',
  'commands/model-list.command.ts',
];

describe('CLI modules must not call process.exit()', () => {
  it.each(cliFiles)('%s', async (relPath) => {
    const src = await readFile(path.join(cliDir, relPath), 'utf-8');
    expect(src).not.toMatch(/process\.exit\s*\(/);
  });
});

describe('CLI entry point lifecycle', () => {
  it('calls destroyAppContainer after command execution in both success and error paths', async () => {
    const src = await readFile(path.join(cliDir, 'entry.ts'), 'utf-8');
    expect(src).toContain('destroyAppContainer');
    const callCount = (src.match(/destroyAppContainer\(\)/g) ?? []).length;
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
