import { ok, okAsync } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitDiffService } from '../../infrastructure/git/git-diff.service';
import { CreateDecisionClient } from '../../infrastructure/llm/typesafe-client';
import { validateNoulResponse } from '../../infrastructure/llm/typesafe-provider';
import type { NoulRequest } from '../../shared/decision-types';
import { CreateLogger } from '../../shared/logger';
import type { CodepolicyConfig } from '../../shared/types';
import { createTestContainer } from '../../test-support/test-container';
import { expectDecisionContract } from '../../test-support/provider-contract';
import { ConfigLoader } from '../config/config-loader.service';

import { EvalCacheService } from './eval-cache.service';
import { LintPipeline } from './lint-pipeline.service';
import { ScopeExtractor } from './scope-extractor.service';

afterEach(() => vi.restoreAllMocks());

function setup(config: CodepolicyConfig, probability = 0.91) {
  const systemOne = vi.fn(async (request: NoulRequest) => {
    const response = {
      model: 'jev-1.0.0',
      answers: Object.fromEntries(
        Object.keys(request.questions).map((id) => [id, { type: 'noul', noul: probability }]),
      ),
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    expectDecisionContract(
      request,
      validateNoulResponse(response, Object.keys(request.questions))._unsafeUnwrap(),
    );
    return response;
  });
  const debug = vi.fn();
  const { target, container } = createTestContainer(LintPipeline, [
    { provide: CreateDecisionClient, useValue: () => ok({ systemOne }) },
    { provide: CreateLogger, useValue: () => ({ info: vi.fn(), warn: vi.fn(), debug }) },
  ]);
  vi.spyOn(container.get<ConfigLoader>(ConfigLoader), 'load').mockReturnValue(okAsync(config));
  vi.spyOn(container.get<GitDiffService>(GitDiffService), 'getChangedFiles').mockReturnValue(
    okAsync([{ filePath: 'src/example.ts', lineRanges: [{ start: 1, end: 1 }] }]),
  );
  const extract = vi
    .spyOn(container.get<ScopeExtractor>(ScopeExtractor), 'extract')
    .mockReturnValue(
      okAsync([
        {
          filePath: 'src/example.ts',
          scopeType: 'function',
          name: 'example',
          code: 'function example() { return 1; }',
          signature: 'function example(): number',
          startLine: 1,
          endLine: 1,
          isExported: true,
        },
      ]),
    );
  const lookup = vi.spyOn(container.get<EvalCacheService>(EvalCacheService), 'lookup');
  const save = vi.spyOn(container.get<EvalCacheService>(EvalCacheService), 'save');
  return { target, container, systemOne, debug, extract, lookup, save };
}

const config: CodepolicyConfig = {
  filter: 'diff',
  agent: 'typesafe-jev',
  rules: { 'jev-no-implicit-fallback': 'error' },
};

describe('Jev lint integration', () => {
  it('rejects unsupported options introduced by an override before API calls', async () => {
    const unsupported: { level: 'error'; threshold: number } = { level: 'error', threshold: 0.9 };
    const test = setup({
      ...config,
      overrides: [
        {
          files: ['src/**'],
          rules: { 'jev-no-implicit-fallback': unsupported },
        },
      ],
    });
    expect((await test.target.run({})).isErr()).toBe(true);
    expect(test.systemOne).not.toHaveBeenCalled();
  });
  it('runs a decision rule without text initialization or cache and logs raw observations', async () => {
    const test = setup(config);
    const result = (await test.target.run({}))._unsafeUnwrap();
    expect(result.errors).toEqual([]);
    expect(result.results[0]).toMatchObject({
      verdict: 'violation',
      reasoning: expect.stringContaining('0.91'),
      citations: [],
    });
    expect(test.systemOne).toHaveBeenCalledTimes(1);
    expect(test.lookup).not.toHaveBeenCalled();
    expect(test.save).not.toHaveBeenCalled();
    expect(test.debug.mock.calls.flat().join('\n')).toContain('jev-1.0.0');
  });
  it('rejects a model mismatch before scope extraction or cache access', async () => {
    const test = setup(config);
    expect((await test.target.run({ agent: 'openai/gpt-5.4' })).isErr()).toBe(true);
    expect(test.extract).not.toHaveBeenCalled();
    expect(test.systemOne).not.toHaveBeenCalled();
    expect(test.lookup).not.toHaveBeenCalled();
  });
  it('validates a rule enabled by an override before API calls', async () => {
    const test = setup({
      ...config,
      agent: 'openai/gpt-5.4',
      rules: { 'jev-no-implicit-fallback': 'off' },
      overrides: [{ files: ['src/**'], rules: { 'jev-no-implicit-fallback': 'error' } }],
    });
    expect((await test.target.run({})).isErr()).toBe(true);
    expect(test.systemOne).not.toHaveBeenCalled();
  });
  it('passes the file tree to placement and reports provider failures as errors, not pass', async () => {
    const test = setup({ ...config, rules: { 'jev-ssot-placement': 'warn' } }, 0.1);
    const result = (await test.target.run({}))._unsafeUnwrap();
    expect(result.results[0]?.verdict).toBe('pass');
    expect(test.systemOne.mock.calls[0]?.[0].state['fileTree']).toContain('src/');
    test.systemOne.mockRejectedValueOnce(new Error('missing key'));
    const failed = (await test.target.run({}))._unsafeUnwrap();
    expect(failed.results).toEqual([]);
    expect(failed.errors[0]?.error.code).toBe('LLM_API_ERROR');
  });
});
