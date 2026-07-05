import { describe, expect, it } from 'vitest';

import type { ResolvedRule, RuleVerdict, ScopeUnit } from '../../shared/types';

import { buildCacheInput, buildResultFromCache } from './cache-helpers';

const baseScope: ScopeUnit = {
  filePath: 'src/foo.ts',
  scopeType: 'function',
  name: 'foo',
  code: 'function foo() { return 1; }',
  startLine: 1,
  endLine: 1,
};

function makeRule(overrides: Partial<ResolvedRule>): ResolvedRule {
  return {
    id: 'rule-x',
    scope: 'function',
    agent: 'github-copilot/gpt-4.1',
    borderline: 'warn',
    level: 'error',
    create: () => {
      throw new Error('not used in tests');
    },
    ruleVersion: 'v1',
    ...overrides,
  };
}

describe('buildCacheInput', () => {
  it('omits fileTreeHash when rule.usesFileTree is undefined', () => {
    const rule = makeRule({});
    const a = buildCacheInput(baseScope, rule, 'tree-version-1', undefined);
    const b = buildCacheInput(baseScope, rule, 'tree-version-2-with-new-file', undefined);
    expect(a.fileTreeHash).toBe('');
    expect(b.fileTreeHash).toBe('');
    expect(a).toEqual(b);
  });

  it('omits fileTreeHash when rule.usesFileTree is false', () => {
    const rule = makeRule({ usesFileTree: false });
    const a = buildCacheInput(baseScope, rule, 'tree-1', undefined);
    const b = buildCacheInput(baseScope, rule, 'tree-2', undefined);
    expect(a.fileTreeHash).toBe('');
    expect(a).toEqual(b);
  });

  it('includes fileTreeHash when rule.usesFileTree is true', () => {
    const rule = makeRule({ usesFileTree: true });
    const a = buildCacheInput(baseScope, rule, 'tree-1', undefined);
    const b = buildCacheInput(baseScope, rule, 'tree-2', undefined);
    expect(a.fileTreeHash).not.toBe('');
    expect(b.fileTreeHash).not.toBe('');
    expect(a.fileTreeHash).not.toBe(b.fileTreeHash);
  });

  it('produces empty fileTreeHash when fileTree is undefined even with usesFileTree=true', () => {
    const rule = makeRule({ usesFileTree: true });
    const result = buildCacheInput(baseScope, rule, undefined, undefined);
    expect(result.fileTreeHash).toBe('');
  });

  it('keeps scope identity fields stable across fileTree changes for non-fileTree rules', () => {
    const rule = makeRule({ usesFileTree: false });
    const a = buildCacheInput(baseScope, rule, 'tree-A', undefined);
    const b = buildCacheInput(baseScope, rule, 'tree-B', undefined);
    expect(a.scopeCode).toBe(b.scopeCode);
    expect(a.filePath).toBe(b.filePath);
    expect(a.scopeName).toBe(b.scopeName);
    // 全フィールドが完全一致 = cache key も一致 = cache hit
    expect(a).toStrictEqual(b);
  });
});

describe('buildResultFromCache', () => {
  it('carries verdict/reasoning/citations from the cached verdict into a LintResult', () => {
    const rule = makeRule({});
    const cachedVerdict: RuleVerdict = {
      verdict: 'violation',
      reasoning: 'キャッシュされた判定理由。',
      citations: ['const x = 1;'],
    };

    const result = buildResultFromCache(baseScope, rule, cachedVerdict, 123);

    expect(result.filePath).toBe(baseScope.filePath);
    expect(result.scopeName).toBe(baseScope.name);
    expect(result.rule).toBe(rule);
    expect(result.verdict).toBe('violation');
    expect(result.reasoning).toBe('キャッシュされた判定理由。');
    expect(result.citations).toEqual(['const x = 1;']);
    expect(result.durationMs).toBe(123);
    expect(result.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
  });
});
