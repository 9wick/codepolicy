import { runCommand, runMain } from 'citty';
import { okAsync } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LintPipeline } from '../application/rule-execution/lint-pipeline.service';
import { createTestContainer } from '../test-support/test-container';

vi.mock('citty', async (importOriginal) => {
  const actual = await importOriginal<typeof import('citty')>();
  return { ...actual, runMain: vi.fn(async () => {}) };
});

import './entry';

const main = vi.mocked(runMain).mock.calls[0]?.[0];

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('main lint cache argument wiring', () => {
  it.each([
    { rawArgs: [], noCache: false },
    { rawArgs: ['--no-cache'], noCache: true },
  ])('passes noCache=$noCache from $rawArgs to the pipeline', async ({ rawArgs, noCache }) => {
    expect(main).toBeDefined();
    if (!main) return;
    const { target } = createTestContainer(LintPipeline);
    const run = vi.spyOn(target, 'run').mockReturnValue(okAsync({ results: [], errors: [] }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCommand(main, { rawArgs });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ noCache }));
  });
});
