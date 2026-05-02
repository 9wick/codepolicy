import { describe, expect, it } from 'vitest';

import type { ScopeContext } from '../../rules/rule-types';
import { llmScoreSchema } from '../../shared/schema-definitions';

import { buildUserPrompt } from './create-llm-helper';

const makeCtx = (overrides?: Partial<ScopeContext>): ScopeContext => ({
  source: 'function hello() { return "world"; }',
  filePath: 'src/hello.ts',
  scopeType: 'function',
  name: 'hello',
  signature: 'function hello()',
  fileTree: 'src/hello.ts\nsrc/main.ts',
  startLine: 1,
  endLine: 1,
  ...overrides,
});

describe('buildUserPrompt', () => {
  it('should include prompt and output format when no include options specified', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check naming.',
      responseFormat: llmScoreSchema,
    });

    expect(result).toContain('## チェック観点\nCheck naming.');
    expect(result).toContain('## 出力形式');
    expect(result).toContain('- score (必須, type: integer):');
    expect(result).toContain('- reason (必須, type: string):');
    expect(result).toContain('追加プロパティは出力しない');
  });

  it('should include filePath when include.filePath is true', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check naming.',
      include: { filePath: true },
      responseFormat: llmScoreSchema,
    });

    expect(result).toContain('ファイル: src/hello.ts');
  });

  it('should include scopeType when include.scopeType is true', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check naming.',
      include: { scopeType: true },
      responseFormat: llmScoreSchema,
    });

    expect(result).toContain('スコープ: function');
  });

  it('should include name when include.name is true', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check naming.',
      include: { name: true },
      responseFormat: llmScoreSchema,
    });

    expect(result).toContain('名前: hello');
  });

  it('should include source code when include.source is true', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check naming.',
      include: { source: true },
      responseFormat: llmScoreSchema,
    });

    expect(result).toContain('## 対象コード');
    expect(result).toContain('function hello() { return "world"; }');
  });

  it('should include all context when all include options are true', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check all.',
      include: {
        filePath: true,
        source: true,
        scopeType: true,
        name: true,
        signature: true,
        fileTree: true,
      },
      responseFormat: llmScoreSchema,
    });

    expect(result).toContain('ファイル: src/hello.ts');
    expect(result).toContain('スコープ: function');
    expect(result).toContain('名前: hello');
    expect(result).toContain('## 対象コード');
    expect(result).toContain('## 関数シグネチャ');
    expect(result).toContain('function hello()');
    expect(result).toContain('## ファイルツリー');
  });

  it('should not include context when include options are false', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check naming.',
      include: { filePath: false, source: false, scopeType: false, name: false },
      responseFormat: llmScoreSchema,
    });

    expect(result).toContain('## チェック観点\nCheck naming.');
    expect(result).toContain('## 出力形式');
    expect(result).not.toContain('ファイル:');
    expect(result).not.toContain('スコープ:');
    expect(result).not.toContain('名前:');
    expect(result).not.toContain('## 対象コード');
  });

  it('should include signature when include.signature is true', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check.',
      include: { signature: true },
      responseFormat: llmScoreSchema,
    });

    expect(result).toContain('## 関数シグネチャ');
    expect(result).toContain('function hello()');
  });

  it('should include fileTree when include.fileTree is true', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check.',
      include: { fileTree: true },
      responseFormat: llmScoreSchema,
    });

    expect(result).toContain('## ファイルツリー');
    expect(result).toContain('src/hello.ts');
  });

  it('should not include signature when ctx.signature is undefined', () => {
    const result = buildUserPrompt(makeCtx({ signature: undefined }), {
      prompt: 'Check.',
      include: { signature: true },
      responseFormat: llmScoreSchema,
    });

    expect(result).not.toContain('## 関数シグネチャ');
  });

  it('should not include fileTree when ctx.fileTree is undefined', () => {
    const result = buildUserPrompt(makeCtx({ fileTree: undefined }), {
      prompt: 'Check.',
      include: { fileTree: true },
      responseFormat: llmScoreSchema,
    });

    expect(result).not.toContain('## ファイルツリー');
  });

  it('places rule prompt and output format before context (rule-stable prefix for prompt cache)', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Rule-specific instructions go here.',
      include: { fileTree: true, source: true, filePath: true },
      responseFormat: llmScoreSchema,
    });

    const promptIdx = result.indexOf('## チェック観点');
    const formatIdx = result.indexOf('## 出力形式');
    const filePathIdx = result.indexOf('ファイル: src/hello.ts');
    const fileTreeIdx = result.indexOf('## ファイルツリー');
    const sourceIdx = result.indexOf('## 対象コード');

    expect(promptIdx).toBe(0);
    expect(promptIdx).toBeLessThan(formatIdx);
    expect(formatIdx).toBeLessThan(filePathIdx);
    expect(filePathIdx).toBeLessThan(fileTreeIdx);
    expect(fileTreeIdx).toBeLessThan(sourceIdx);
  });

  it('shares prefix across different scopes for the same rule (prompt-cache friendly)', () => {
    const include = { fileTree: true, source: true, filePath: true, signature: true } as const;
    const samePrompt = 'Same rule: identical prompt for both calls.';

    const a = buildUserPrompt(makeCtx({ name: 'foo', source: 'function foo() {}' }), {
      prompt: samePrompt,
      include,
      responseFormat: llmScoreSchema,
    });
    const b = buildUserPrompt(makeCtx({ name: 'bar', source: 'function bar() {}' }), {
      prompt: samePrompt,
      include,
      responseFormat: llmScoreSchema,
    });

    // 同じ rule (同じ prompt + responseFormat) なら、scope 別に呼んでも先頭の rule prompt と出力形式の節は完全に一致する。
    const filePathIdxA = a.indexOf('ファイル:');
    const filePathIdxB = b.indexOf('ファイル:');
    expect(filePathIdxA).toBeGreaterThan(0);
    expect(filePathIdxA).toBe(filePathIdxB);
    expect(a.slice(0, filePathIdxA)).toBe(b.slice(0, filePathIdxB));
  });

  it('different rule prompts produce different prefixes (cache miss across rules is expected)', () => {
    const a = buildUserPrompt(makeCtx(), {
      prompt: 'Rule A: check naming.',
      include: { source: true },
      responseFormat: llmScoreSchema,
    });
    const b = buildUserPrompt(makeCtx(), {
      prompt: 'Rule B: check fallbacks.',
      include: { source: true },
      responseFormat: llmScoreSchema,
    });

    expect(a.startsWith('## チェック観点\nRule A')).toBe(true);
    expect(b.startsWith('## チェック観点\nRule B')).toBe(true);
    expect(a).not.toBe(b);
  });
});
