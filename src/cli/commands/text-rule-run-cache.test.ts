import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runCommand } from 'citty';
import { okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigLoader } from '../../application/config/config-loader.service';
import { CacheStoreToken } from '../../infrastructure/cache/cache-store';
import { createFileCacheStore } from '../../infrastructure/cache/file-cache-store';
import definition from '../../rules/no-implicit-fallback/rule';
import type { RuleVerdict } from '../../shared/types';
import { createTestContainer } from '../../test-support/test-container';

import command from './rule-run.command';

let cacheRoot: string;
beforeEach(async () => {
  cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'text-cli-cache-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await fs.rm(cacheRoot, { recursive: true, force: true });
});

function setup() {
  const store = createFileCacheStore(cacheRoot);
  const lookup = vi.spyOn(store, 'lookup');
  const save = vi.spyOn(store, 'save');
  const { target } = createTestContainer(ConfigLoader, [
    { provide: CacheStoreToken, useValue: store },
  ]);
  vi.spyOn(target, 'load').mockReturnValue(
    okAsync({ filter: 'all', agent: 'claude', rules: { 'no-implicit-fallback': 'error' } }),
  );
  const evaluate = vi.fn(() =>
    okAsync({
      verdict: 'violation',
      reasoning: 'reason',
      citations: ['code'],
    } satisfies RuleVerdict),
  );
  vi.spyOn(definition, 'create').mockReturnValue(okAsync(evaluate));
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  return { evaluate, lookup, save, output };
}

describe('text rule run cache', () => {
  const rawArgs = ['no-implicit-fallback', 'src/shared/errors.ts'];
  it('persists text evaluations across containers without changing stdout', async () => {
    const first = setup();
    await runCommand(command, { rawArgs });
    const stdout = first.output.mock.calls.flat().join('\n');
    expect(first.evaluate).toHaveBeenCalledTimes(1);
    expect(first.save).toHaveBeenCalledTimes(1);
    const second = setup();
    second.output.mockClear();
    await runCommand(command, { rawArgs });
    expect(second.evaluate).not.toHaveBeenCalled();
    expect(second.output.mock.calls.flat().join('\n')).toBe(stdout);
    expect(second.lookup).toHaveBeenCalledTimes(1);
  });
  it('no-cache skips both store operations even after a cacheable run', async () => {
    const test = setup();
    await runCommand(command, { rawArgs });
    test.lookup.mockClear();
    test.save.mockClear();
    await runCommand(command, { rawArgs: [...rawArgs, '--no-cache'] });
    expect(test.evaluate).toHaveBeenCalledTimes(2);
    expect(test.lookup).not.toHaveBeenCalled();
    expect(test.save).not.toHaveBeenCalled();
  });
});
