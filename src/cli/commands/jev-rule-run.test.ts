import { runCommand } from 'citty';
import { ok, okAsync } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigLoader } from '../../application/config/config-loader.service';
import { CreateDecisionClient } from '../../infrastructure/llm/typesafe-client';
import type { NoulRequest } from '../../shared/decision-types';
import { createTestContainer } from '../../test-support/test-container';

import command from './rule-run.command';

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function setup() {
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
  return { systemOne, output, errors };
}

describe('Jev rule run command', () => {
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
