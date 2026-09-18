import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { CacheStoreToken, type CacheStore } from '../../infrastructure/cache/cache-store';
import { codepolicyError } from '../../shared/errors';
import { CreateLogger } from '../../shared/logger';
import type { ResolvedTextRule, ScopeUnit } from '../../shared/types';
import { createTestContainer } from '../../test-support/test-container';

import {
  RuleEvaluationService,
  type EvaluationData,
  type PreparedEvaluator,
} from './rule-evaluation.service';

const scope: ScopeUnit = {
  filePath: 'a.ts',
  scopeType: 'function',
  name: 'f',
  code: 'function f() {}',
  startLine: 1,
  endLine: 1,
};
const data: EvaluationData = {
  verdict: 'violation',
  reasoning: 'reason',
  citations: ['code'],
  durationMs: 12,
  usage: {
    inputTokens: 8,
    outputTokens: 2,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    reasoningTokens: 0,
  },
};
const rule: ResolvedTextRule = {
  id: 'test',
  scope: 'function',
  agent: 'claude',
  level: 'error',
  borderline: 'warn',
  ruleVersion: 'v1',
  create: () => okAsync(() => okAsync(data)),
};

function setup() {
  const lookup = vi.fn<CacheStore['lookup']>(() => okAsync({ kind: 'miss' }));
  const save = vi.fn<CacheStore['save']>(() => okAsync(undefined));
  const evaluate = vi.fn<PreparedEvaluator>(() => okAsync(data));
  const warn = vi.fn();
  const { target } = createTestContainer(RuleEvaluationService, [
    { provide: CacheStoreToken, useValue: { lookup, save } },
    { provide: CreateLogger, useValue: () => ({ info: vi.fn(), debug: vi.fn(), warn }) },
  ]);
  return { target, lookup, save, evaluate, warn };
}

describe('shared evaluation cache contract', () => {
  it('does not save a failed evaluation and preserves its cause', async () => {
    const test = setup();
    const cause = new Error('provider failure');
    test.evaluate.mockReturnValue(errAsync(cause));
    const result = await test.target.evaluate(scope, rule, undefined, test.evaluate, {});
    expect(result._unsafeUnwrapErr()).toMatchObject({ code: 'LLM_API_ERROR', cause });
    expect(test.save).not.toHaveBeenCalled();
  });
  it('propagates read errors without contacting the provider', async () => {
    const test = setup();
    const error = codepolicyError('CACHE_READ_ERROR', 'permission denied');
    test.lookup.mockReturnValue(errAsync(error));
    expect(
      (await test.target.evaluate(scope, rule, undefined, test.evaluate, {}))._unsafeUnwrapErr(),
    ).toBe(error);
    expect(test.evaluate).not.toHaveBeenCalled();
    expect(test.save).not.toHaveBeenCalled();
  });
  it('preserves evaluated results and warns on write failure', async () => {
    const test = setup();
    test.save.mockReturnValue(errAsync(codepolicyError('CACHE_WRITE_ERROR', 'disk full')));
    const result = (
      await test.target.evaluate(scope, rule, undefined, test.evaluate, {})
    )._unsafeUnwrap();
    expect(result).toMatchObject(data);
    expect(test.warn).toHaveBeenCalledWith(expect.stringContaining('disk full'));
  });
  it('warns, evaluates and saves when an entry is corrupted', async () => {
    const test = setup();
    test.lookup.mockReturnValue(okAsync({ kind: 'corrupted', cause: new Error('invalid JSON') }));
    expect((await test.target.evaluate(scope, rule, undefined, test.evaluate, {})).isOk()).toBe(
      true,
    );
    expect(test.evaluate).toHaveBeenCalledTimes(1);
    expect(test.save).toHaveBeenCalledTimes(1);
    expect(test.warn).toHaveBeenCalledWith(expect.stringContaining('corrupted'));
  });
  it('keeps custom cacheable:false behavior without consulting the store', async () => {
    const test = setup();
    await test.target.evaluate(scope, { ...rule, cacheable: false }, undefined, test.evaluate, {});
    expect(test.evaluate).toHaveBeenCalledTimes(1);
    expect(test.lookup).not.toHaveBeenCalled();
    expect(test.save).not.toHaveBeenCalled();
  });
  it('reuses a legacy text entry without invoking the evaluator or counting old usage', async () => {
    const test = setup();
    test.lookup.mockReturnValue(
      okAsync({
        kind: 'hit',
        entry: {
          verdict: 'violation',
          reasoning: 'saved',
          citations: ['saved code'],
          savedAt: '2026-01-01',
          codepolicyVersion: '0.2.2',
        },
      }),
    );
    const result = (
      await test.target.evaluate(scope, rule, undefined, test.evaluate, {})
    )._unsafeUnwrap();
    expect(result).toMatchObject({
      verdict: 'violation',
      reasoning: 'saved',
      citations: ['saved code'],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    });
    expect(test.evaluate).not.toHaveBeenCalled();
    expect(test.save).not.toHaveBeenCalled();
  });
});
