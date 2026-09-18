import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ok, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CacheStoreToken } from '../../infrastructure/cache/cache-store';
import { createFileCacheStore } from '../../infrastructure/cache/file-cache-store';
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

let cacheRoot: string;
beforeEach(async () => {
  cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jev-pipeline-cache-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(cacheRoot, { recursive: true, force: true });
});

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
    { provide: CacheStoreToken, useValue: createFileCacheStore(cacheRoot) },
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
  it('reuses persisted decision results and logs raw observations without another API call', async () => {
    const test = setup(config);
    const result = (await test.target.run({}))._unsafeUnwrap();
    expect(result.errors).toEqual([]);
    expect(result.results[0]).toMatchObject({
      verdict: 'violation',
      reasoning: expect.stringContaining('0.91'),
      citations: [],
    });
    expect(test.systemOne).toHaveBeenCalledTimes(1);
    expect(test.lookup).toHaveBeenCalledTimes(1);
    expect(test.save).toHaveBeenCalledTimes(1);
    expect(test.debug.mock.calls.flat().join('\n')).toContain('jev-1.0.0');
    const restarted = setup(config);
    const cached = (await restarted.target.run({}))._unsafeUnwrap();
    expect(cached.results[0]).toMatchObject({
      verdict: 'violation',
      reasoning: result.results[0]?.reasoning,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    expect(restarted.systemOne).not.toHaveBeenCalled();
    expect(restarted.save).not.toHaveBeenCalled();
    expect(restarted.debug.mock.calls.flat().join('\n')).toContain('0.91');
  });
  it('noCache bypasses both lookup and save even with a populated cache', async () => {
    const test = setup(config);
    await test.target.run({});
    test.lookup.mockClear();
    test.save.mockClear();
    await test.target.run({ noCache: true });
    await test.target.run({ noCache: true });
    expect(test.systemOne).toHaveBeenCalledTimes(3);
    expect(test.lookup).not.toHaveBeenCalled();
    expect(test.save).not.toHaveBeenCalled();
  });
  it('reevaluates when source or requested model changes', async () => {
    const test = setup(config);
    await test.target.run({});
    test.extract.mockReturnValue(
      okAsync([
        {
          filePath: 'src/example.ts',
          scopeType: 'function',
          name: 'example',
          code: 'function example() { return 2; }',
          signature: 'function example(): number',
          startLine: 1,
          endLine: 1,
          isExported: true,
        },
      ]),
    );
    await test.target.run({});
    await test.target.run({ agent: 'typesafe-jev-1.13.0' });
    await test.target.run({ agent: 'typesafe-jev-1.13.0' });
    expect(test.systemOne).toHaveBeenCalledTimes(3);
    expect(test.save).toHaveBeenCalledTimes(3);
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
    const failed = (await test.target.run({ noCache: true }))._unsafeUnwrap();
    expect(failed.results).toEqual([]);
    expect(failed.errors[0]?.error.code).toBe('LLM_API_ERROR');
  });
});
