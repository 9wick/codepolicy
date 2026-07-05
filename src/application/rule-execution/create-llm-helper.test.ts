import { Type } from '@sinclair/typebox';
import { err, ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LlmProvider, LlmResponse } from '../../infrastructure/llm/llm-provider';
import { resolveProvider } from '../../infrastructure/llm/resolve-provider';
import type { ScopeContext } from '../../rules/rule-types';
import type { TokenUsage } from '../../shared/types';

import { buildUserPrompt, createLlmHelper } from './create-llm-helper';

vi.mock('../../infrastructure/llm/resolve-provider', () => ({
  resolveProvider: vi.fn(),
}));

// buildUserPrompt はレスポンススキーマの中身に依存しないため、テスト専用の簡単なスキーマで検証する。
const testResponseSchema = Type.Object(
  {
    score: Type.Integer({ description: 'test score field' }),
    reason: Type.String({ description: 'test reason field' }),
  },
  { additionalProperties: false },
);

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
      responseFormat: testResponseSchema,
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
      responseFormat: testResponseSchema,
    });

    expect(result).toContain('ファイル: src/hello.ts');
  });

  it('should include scopeType when include.scopeType is true', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check naming.',
      include: { scopeType: true },
      responseFormat: testResponseSchema,
    });

    expect(result).toContain('スコープ: function');
  });

  it('should include name when include.name is true', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check naming.',
      include: { name: true },
      responseFormat: testResponseSchema,
    });

    expect(result).toContain('名前: hello');
  });

  it('should include source code when include.source is true', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check naming.',
      include: { source: true },
      responseFormat: testResponseSchema,
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
      responseFormat: testResponseSchema,
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
      responseFormat: testResponseSchema,
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
      responseFormat: testResponseSchema,
    });

    expect(result).toContain('## 関数シグネチャ');
    expect(result).toContain('function hello()');
  });

  it('should include fileTree when include.fileTree is true', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Check.',
      include: { fileTree: true },
      responseFormat: testResponseSchema,
    });

    expect(result).toContain('## ファイルツリー');
    expect(result).toContain('src/hello.ts');
  });

  it('should not include signature when ctx.signature is undefined', () => {
    const result = buildUserPrompt(makeCtx({ signature: undefined }), {
      prompt: 'Check.',
      include: { signature: true },
      responseFormat: testResponseSchema,
    });

    expect(result).not.toContain('## 関数シグネチャ');
  });

  it('should not include fileTree when ctx.fileTree is undefined', () => {
    const result = buildUserPrompt(makeCtx({ fileTree: undefined }), {
      prompt: 'Check.',
      include: { fileTree: true },
      responseFormat: testResponseSchema,
    });

    expect(result).not.toContain('## ファイルツリー');
  });

  it('places rule prompt and output format before context (rule-stable prefix for prompt cache)', () => {
    const result = buildUserPrompt(makeCtx(), {
      prompt: 'Rule-specific instructions go here.',
      include: { fileTree: true, source: true, filePath: true },
      responseFormat: testResponseSchema,
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
      responseFormat: testResponseSchema,
    });
    const b = buildUserPrompt(makeCtx({ name: 'bar', source: 'function bar() {}' }), {
      prompt: samePrompt,
      include,
      responseFormat: testResponseSchema,
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
      responseFormat: testResponseSchema,
    });
    const b = buildUserPrompt(makeCtx(), {
      prompt: 'Rule B: check fallbacks.',
      include: { source: true },
      responseFormat: testResponseSchema,
    });

    expect(a.startsWith('## チェック観点\nRule A')).toBe(true);
    expect(b.startsWith('## チェック観点\nRule B')).toBe(true);
    expect(a).not.toBe(b);
  });
});

// --- judge() ---

const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

function usage(inputTokens: number): TokenUsage {
  return { ...ZERO_USAGE, inputTokens };
}

// resolveProvider をモックし、judge() が発行する generate() 呼び出し順に
// あらかじめ用意したレスポンスを返す fake provider を差し込む。
function queueProviderResponses(responses: LlmResponse<unknown>[]): ReturnType<typeof vi.fn> {
  const generate = vi.fn();
  for (const response of responses) {
    generate.mockImplementationOnce(() => ok(response));
  }
  const provider: LlmProvider = { generate: generate as unknown as LlmProvider['generate'] };
  vi.mocked(resolveProvider).mockReturnValue(ok(provider));
  return generate;
}

describe('createLlmHelper.judge', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns proposer pass verdict directly without calling the verifier', async () => {
    const generate = queueProviderResponses([
      {
        output: { citations: [], matchedCriterion: null, reasoning: '問題なし', verdict: 'pass' },
        usage: usage(10),
      },
    ]);
    const helper = createLlmHelper(makeCtx(), 'claude-x', '.');

    const result = await helper.judge({
      criteria: '命名規則を確認する。',
      include: { source: true },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      verdict: 'pass',
      reasoning: '問題なし',
      citations: [],
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('returns proposer borderline verdict directly without calling the verifier', async () => {
    const source = 'function hello() { return "world"; }';
    const generate = queueProviderResponses([
      {
        output: {
          citations: ['return "world";'],
          matchedCriterion: '曖昧な戻り値',
          reasoning: '確信が持てない',
          verdict: 'borderline',
        },
        usage: usage(10),
      },
    ]);
    const helper = createLlmHelper(makeCtx({ source }), 'claude-x', '.');

    const result = await helper.judge({ criteria: '戻り値の妥当性を確認する。' });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      verdict: 'borderline',
      reasoning: '確信が持てない',
      citations: ['return "world";'],
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('downgrades violation to pass when no cited evidence exists in the target source (hallucination)', async () => {
    const generate = queueProviderResponses([
      {
        output: {
          citations: ['this text does not appear anywhere in the source'],
          matchedCriterion: '存在しない基準',
          reasoning: '違反に見える',
          verdict: 'violation',
        },
        usage: usage(10),
      },
    ]);
    const helper = createLlmHelper(makeCtx(), 'claude-x', '.');

    const result = await helper.judge({ criteria: '何らかの観点を確認する。' });

    expect(result.isOk()).toBe(true);
    const verdict = result._unsafeUnwrap();
    expect(verdict.verdict).toBe('pass');
    expect(verdict.citations).toEqual([]);
    expect(verdict.reasoning).toContain('見つからなかった');
    // 有効な citation が無いので verifier(2段目) は呼ばれない。
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('tolerates whitespace differences when matching citations against the source', async () => {
    const source = 'function hello() {\n  return "world";\n}';
    const generate = queueProviderResponses([
      {
        output: {
          citations: ['return "world";'],
          matchedCriterion: '該当基準',
          reasoning: '違反の可能性',
          verdict: 'violation',
        },
        usage: usage(10),
      },
      {
        output: { reasoning: '再検証の結果、違反と確認', result: 'confirmed' },
        usage: usage(5),
      },
    ]);
    const helper = createLlmHelper(makeCtx({ source }), 'claude-x', '.');

    const result = await helper.judge({ criteria: '何らかの観点を確認する。' });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().verdict).toBe('violation');
    // whitespace正規化により citation が生き残り、verifier まで到達している。
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('matches citations found only in extraCitationSources (e.g. compared code in another file)', async () => {
    const generate = queueProviderResponses([
      {
        output: {
          citations: ['const shared = 1;'],
          matchedCriterion: '重複コード',
          reasoning: '別ファイルと重複',
          verdict: 'violation',
        },
        usage: usage(10),
      },
      {
        output: { reasoning: '重複を確認', result: 'confirmed' },
        usage: usage(5),
      },
    ]);
    const helper = createLlmHelper(makeCtx({ source: 'function unrelated() {}' }), 'claude-x', '.');

    const result = await helper.judge({
      criteria: '重複コードを確認する。',
      extraCitationSources: ['const shared = 1;'],
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().verdict).toBe('violation');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('maps verifier result "confirmed" to violation, keeping proposer citations and verifier reasoning', async () => {
    const source = 'function hello() { return "world"; }';
    const generate = queueProviderResponses([
      {
        output: {
          citations: ['return "world"'],
          matchedCriterion: '該当基準',
          reasoning: '一次判定の理由',
          verdict: 'violation',
        },
        usage: usage(10),
      },
      { output: { reasoning: '独立に再検証し違反を確認', result: 'confirmed' }, usage: usage(5) },
    ]);
    const helper = createLlmHelper(makeCtx({ source }), 'claude-x', '.');

    const result = await helper.judge({ criteria: '何らかの観点を確認する。' });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      verdict: 'violation',
      reasoning: '独立に再検証し違反を確認',
      citations: ['return "world"'],
    });
    // verifier に一次判定の reasoning が渡っていないことを確認する（敵対的フレーミングの前提）。
    const verifierPrompt: string = generate.mock.calls[1]?.[0]?.prompt?.user ?? '';
    expect(verifierPrompt).not.toContain('一次判定の理由');
    expect(verifierPrompt).toContain('return "world"');
  });

  it('maps verifier result "dismissed" to pass with empty citations', async () => {
    const source = 'function hello() { return "world"; }';
    queueProviderResponses([
      {
        output: {
          citations: ['return "world"'],
          matchedCriterion: '該当基準',
          reasoning: '一次判定の理由',
          verdict: 'violation',
        },
        usage: usage(10),
      },
      { output: { reasoning: '文脈上問題なく棄却', result: 'dismissed' }, usage: usage(5) },
    ]);
    const helper = createLlmHelper(makeCtx({ source }), 'claude-x', '.');

    const result = await helper.judge({ criteria: '何らかの観点を確認する。' });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      verdict: 'pass',
      reasoning: '文脈上問題なく棄却',
      citations: [],
    });
  });

  it('maps verifier result "inconclusive" to borderline, keeping citations', async () => {
    const source = 'function hello() { return "world"; }';
    queueProviderResponses([
      {
        output: {
          citations: ['return "world"'],
          matchedCriterion: '該当基準',
          reasoning: '一次判定の理由',
          verdict: 'violation',
        },
        usage: usage(10),
      },
      { output: { reasoning: '判断がつかない', result: 'inconclusive' }, usage: usage(5) },
    ]);
    const helper = createLlmHelper(makeCtx({ source }), 'claude-x', '.');

    const result = await helper.judge({ criteria: '何らかの観点を確認する。' });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      verdict: 'borderline',
      reasoning: '判断がつかない',
      citations: ['return "world"'],
    });
  });

  it('accumulates usage across the proposer and verifier stages', async () => {
    const source = 'function hello() { return "world"; }';
    queueProviderResponses([
      {
        output: {
          citations: ['return "world"'],
          matchedCriterion: '該当基準',
          reasoning: '一次判定の理由',
          verdict: 'violation',
        },
        usage: usage(10),
      },
      { output: { reasoning: '違反を確認', result: 'confirmed' }, usage: usage(5) },
    ]);
    const helper = createLlmHelper(makeCtx({ source }), 'claude-x', '.');

    await helper.judge({ criteria: '何らかの観点を確認する。' });

    expect(helper.getUsage().inputTokens).toBe(15);
  });

  it('propagates provider resolution errors', async () => {
    vi.mocked(resolveProvider).mockReturnValue(err(new Error('Unsupported model')));
    const helper = createLlmHelper(makeCtx(), 'unknown-model', '.');

    const result = await helper.judge({ criteria: '何らかの観点を確認する。' });

    expect(result.isErr()).toBe(true);
  });
});
