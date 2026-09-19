import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runCommand } from 'citty';
import { ok, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigLoader } from '../../application/config/config-loader.service';
import { CacheStoreToken } from '../../infrastructure/cache/cache-store';
import { createFileCacheStore } from '../../infrastructure/cache/file-cache-store';
import { CreateDecisionClient } from '../../infrastructure/llm/typesafe-client';
import type { NoulRequest } from '../../shared/decision-types';
import { createTestContainer } from '../../test-support/test-container';

import command from './rule-run.command';

let cacheRoot: string;
beforeEach(async () => {
  cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jev-cli-cache-'));
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
  const systemOne = vi.fn(async (request: NoulRequest) => ({
    model: 'jev-1.0.0',
    answers: Object.fromEntries(
      Object.keys(request.questions).map((id, index) => [
        id,
        { type: 'noul', noul: index === 0 ? 0.91 : 0.1 },
      ]),
    ),
    usage: { input_tokens: 20, output_tokens: 3 },
  }));
  const { target } = createTestContainer(ConfigLoader, [
    { provide: CacheStoreToken, useValue: store },
    { provide: CreateDecisionClient, useValue: () => ok({ systemOne }) },
  ]);
  vi.spyOn(target, 'load').mockReturnValue(
    okAsync({
      filter: 'all',
      agent: 'typesafe-jev',
      rules: { 'jev-no-implicit-fallback': 'error', 'jev-ssot-placement': 'warn' },
    }),
  );
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  return { systemOne, output, errors, lookup, save };
}

describe('Jev rule run command', () => {
  it('reuses cache across containers while preserving stdout', async () => {
    const test = setup();
    const rawArgs = ['jev-no-implicit-fallback', 'src/shared/errors.ts'];
    await runCommand(command, { rawArgs });
    const first = test.output.mock.calls.flat().join('\n');
    expect(test.save).toHaveBeenCalledTimes(1);
    const restarted = setup();
    restarted.output.mockClear();
    await runCommand(command, { rawArgs });
    expect(restarted.output.mock.calls.flat().join('\n')).toBe(first);
    expect(restarted.systemOne).not.toHaveBeenCalled();
    expect(restarted.lookup).toHaveBeenCalledTimes(1);
  });
  it('no-cache bypasses reads and writes with an existing entry', async () => {
    const test = setup();
    const rawArgs = ['jev-no-implicit-fallback', 'src/shared/errors.ts'];
    await runCommand(command, { rawArgs });
    test.lookup.mockClear();
    test.save.mockClear();
    await runCommand(command, { rawArgs: [...rawArgs, '--no-cache'] });
    await runCommand(command, { rawArgs: [...rawArgs, '--no-cache'] });
    expect(test.systemOne).toHaveBeenCalledTimes(3);
    expect(test.lookup).not.toHaveBeenCalled();
    expect(test.save).not.toHaveBeenCalled();
  });
  it('prints only flagged values and no citation line; a violation remains successful execution', async () => {
    const test = setup();
    await runCommand(command, { rawArgs: ['jev-no-implicit-fallback', 'src/shared/errors.ts'] });
    const output = test.output.mock.calls.flat().join('\n');
    expect(output).toContain('Verdict: violation');
    expect(output).toContain('0.91');
    expect(output).not.toContain('0.1');
    expect(output).not.toContain('Citations:');
    expect(process.exitCode).not.toBe(1);
  });
  it('rejects incompatible models before requesting Jev', async () => {
    const test = setup();
    await runCommand(command, {
      rawArgs: ['jev-no-implicit-fallback', 'src/shared/errors.ts', '--agent', 'openai/gpt-5.4'],
    });
    expect(process.exitCode).toBe(1);
    expect(test.systemOne).not.toHaveBeenCalled();
    expect(test.errors.mock.calls.flat().join('\n')).toContain('requires a TypeSafe model');
  });
  it('supplies the repository file tree to the placement rule', async () => {
    const test = setup();
    await runCommand(command, { rawArgs: ['jev-ssot-placement', 'src/shared/errors.ts'] });
    expect(test.systemOne.mock.calls[0]?.[0].state['fileTree']).toContain('src/');
    expect(test.errors).not.toHaveBeenCalled();
  });
});
