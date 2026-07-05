import { okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it } from 'vitest';

import { createTestContainer } from '../../test-support/test-container';
import { codepolicyError } from '../../shared/errors';
import type { LintErrorEntry, LintResult, ResolvedRule } from '../../shared/types';

import { Reporter } from './reporter.service';

const makeRule = (overrides?: Partial<ResolvedRule>): ResolvedRule => ({
  id: 'function-contract',
  scope: 'function',
  agent: 'claude',
  borderline: 'warn',
  level: 'error',
  create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
  ...overrides,
});

const makeResult = (overrides?: Partial<LintResult>): LintResult => ({
  filePath: 'src/user/repository.ts',
  scopeName: 'getUserById()',
  rule: makeRule(),
  verdict: 'violation',
  reasoning: 'getUser() の実装内部でログの書き込みが行われています。',
  citations: [],
  usage: {
    inputTokens: 1200,
    outputTokens: 350,
    reasoningTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  },
  durationMs: 1500,
  ...overrides,
});

describe('Reporter', () => {
  let reporter: Reporter;

  beforeEach(() => {
    ({ target: reporter } = createTestContainer(Reporter));
  });

  describe('format', () => {
    it('violation あり → 整形テキストに violation 情報が含まれる', () => {
      const results: LintResult[] = [
        makeResult(),
        makeResult({
          filePath: 'src/user/service.ts',
          scopeName: 'updateUser()',
          rule: makeRule({ id: 'layer-responsibility', level: 'warn' }),
          reasoning: 'UserService がDBの接続処理を直接参照しています。',
          verdict: 'violation',
        }),
      ];

      const output = reporter.format({ results, errors: [] });

      expect(output).toContain('2 violation(s) found');
      expect(output).toContain('src/user/repository.ts > getUserById()');
      expect(output).toContain('[function-contract] violation (error)');
      expect(output).toContain('[1.5sec | token in:1,200 out:350]');
      expect(output).toContain('getUser() の実装内部でログの書き込みが行われています。');
      expect(output).toContain('src/user/service.ts > updateUser()');
      expect(output).toContain('[layer-responsibility] violation (warn)');
      expect(output).toContain('UserService がDBの接続処理を直接参照しています。');
    });

    it('borderline あり → summary に borderline 件数が含まれる', () => {
      const results: LintResult[] = [
        makeResult({ verdict: 'borderline', rule: makeRule({ borderline: 'warn' }) }),
      ];

      const output = reporter.format({ results, errors: [] });

      expect(output).toContain('1 borderline(s) found');
      expect(output).toContain('[function-contract] borderline (warn)');
    });

    it('violation と borderline 混在 → summary に両方の件数が含まれる', () => {
      const results: LintResult[] = [
        makeResult({ verdict: 'violation' }),
        makeResult({
          filePath: 'src/user/service.ts',
          scopeName: 'updateUser()',
          verdict: 'borderline',
          rule: makeRule({ id: 'layer-responsibility', borderline: 'warn' }),
        }),
      ];

      const output = reporter.format({ results, errors: [] });

      expect(output).toContain('1 violation(s), 1 borderline(s) found');
    });

    it('citations がある場合、インデントされて表示される', () => {
      const results: LintResult[] = [makeResult({ citations: ['const x = 1;', 'return x;'] })];

      const output = reporter.format({ results, errors: [] });

      expect(output).toContain('const x = 1;');
      expect(output).toContain('return x;');
    });

    it('citations が空の場合、citation 行は表示されない', () => {
      const results: LintResult[] = [makeResult({ citations: [] })];

      const output = reporter.format({ results, errors: [] });

      expect(output).not.toContain('      - ');
    });

    it('severity=off (borderline かつ rule.borderline=off) の finding は表示されない', () => {
      const results: LintResult[] = [
        makeResult({ verdict: 'borderline', rule: makeRule({ borderline: 'off' }) }),
      ];

      const output = reporter.format({ results, errors: [] });

      expect(output).toContain('all checks passed');
    });

    it('verdict=pass の結果は表示されない', () => {
      const results: LintResult[] = [makeResult({ verdict: 'pass', citations: [] })];

      const output = reporter.format({ results, errors: [] });

      expect(output).toContain('all checks passed');
    });

    it('violation なし → 成功メッセージ（usage合計を含む）', () => {
      const results: LintResult[] = [
        makeResult({ verdict: 'pass' }),
        makeResult({
          verdict: 'pass',
          filePath: 'src/user/service.ts',
          scopeName: 'updateUser()',
          rule: makeRule({ id: 'layer-responsibility' }),
        }),
      ];

      const output = reporter.format({ results, errors: [] });

      expect(output).toContain('all checks passed');
      expect(output).toContain('2 scopes');
      expect(output).toContain('2 rules');
      expect(output).toContain('[3.0sec | token in:2,400 out:700]');
    });

    it('空結果 → 成功メッセージ (0 scopes × 0 rules)', () => {
      const output = reporter.format({ results: [], errors: [] });

      expect(output).toContain('all checks passed');
      expect(output).toContain('0 scopes');
      expect(output).toContain('0 rules');
    });

    it('同じスコープに複数違反がある場合、グループ化される', () => {
      const results: LintResult[] = [
        makeResult(),
        makeResult({
          rule: makeRule({ id: 'naming-convention', level: 'warn' }),
          reasoning: '命名規則に違反しています。',
          verdict: 'violation',
        }),
      ];

      const output = reporter.format({ results, errors: [] });

      // Should group under same scope header
      const headerCount = (output.match(/src\/user\/repository\.ts > getUserById\(\)/g) ?? [])
        .length;
      expect(headerCount).toBe(1);
      expect(output).toContain('[function-contract]');
      expect(output).toContain('[naming-convention]');
    });
  });

  describe('getExitCode', () => {
    it('violation なし → exit code 0', () => {
      const results: LintResult[] = [makeResult({ verdict: 'pass' })];
      expect(reporter.getExitCode({ results, errors: [] })).toBe(0);
    });

    it('warn のみ → exit code 0', () => {
      const results: LintResult[] = [
        makeResult({
          verdict: 'violation',
          rule: makeRule({ level: 'warn' }),
        }),
      ];
      expect(reporter.getExitCode({ results, errors: [] })).toBe(0);
    });

    it('error あり → exit code 1', () => {
      const results: LintResult[] = [
        makeResult({
          verdict: 'violation',
          rule: makeRule({ level: 'error' }),
        }),
      ];
      expect(reporter.getExitCode({ results, errors: [] })).toBe(1);
    });

    it('warn と error 混在 → exit code 1', () => {
      const results: LintResult[] = [
        makeResult({
          verdict: 'violation',
          rule: makeRule({ level: 'warn' }),
        }),
        makeResult({
          verdict: 'violation',
          rule: makeRule({ level: 'error' }),
        }),
      ];
      expect(reporter.getExitCode({ results, errors: [] })).toBe(1);
    });

    it('borderline (rule.borderline=warn) → exit code 0', () => {
      const results: LintResult[] = [
        makeResult({
          verdict: 'borderline',
          rule: makeRule({ level: 'error', borderline: 'warn' }),
        }),
      ];
      expect(reporter.getExitCode({ results, errors: [] })).toBe(0);
    });

    it('borderline (rule.borderline=error) → exit code 1', () => {
      const results: LintResult[] = [
        makeResult({
          verdict: 'borderline',
          rule: makeRule({ level: 'error', borderline: 'error' }),
        }),
      ];
      expect(reporter.getExitCode({ results, errors: [] })).toBe(1);
    });

    it('空結果 → exit code 0', () => {
      expect(reporter.getExitCode({ results: [], errors: [] })).toBe(0);
    });

    it('verdict=pass の error ルールは exit code に影響しない', () => {
      const results: LintResult[] = [
        makeResult({
          verdict: 'pass',
          rule: makeRule({ level: 'error' }),
        }),
      ];
      expect(reporter.getExitCode({ results, errors: [] })).toBe(0);
    });

    it('エラーエントリがある場合 → exit code 1', () => {
      const errors: LintErrorEntry[] = [
        {
          filePath: 'src/foo.ts',
          scopeName: 'myFn()',
          rule: makeRule(),
          error: codepolicyError('LLM_API_ERROR', 'API timeout'),
        },
      ];
      expect(reporter.getExitCode({ results: [], errors })).toBe(1);
    });
  });

  describe('format with errors', () => {
    it('エラーエントリがある場合 → エラー情報が出力に含まれる', () => {
      const errors: LintErrorEntry[] = [
        {
          filePath: 'src/foo.ts',
          scopeName: 'myFn()',
          rule: makeRule({ id: 'function-contract' }),
          error: codepolicyError('LLM_API_ERROR', 'API timeout'),
        },
      ];
      const output = reporter.format({ results: [], errors });

      expect(output).toContain('1 error');
      expect(output).toContain('src/foo.ts');
      expect(output).toContain('function-contract');
      expect(output).toContain('API timeout');
    });

    it('結果とエラーが混在する場合 → 両方が出力される', () => {
      const results: LintResult[] = [makeResult({ verdict: 'violation' })];
      const errors: LintErrorEntry[] = [
        {
          filePath: 'src/bar.ts',
          scopeName: 'barFn()',
          rule: makeRule({ id: 'naming-convention' }),
          error: codepolicyError('LLM_API_ERROR', 'Connection refused'),
        },
      ];
      const output = reporter.format({ results, errors });

      expect(output).toContain('1 violation(s) found');
      expect(output).toContain('1 error');
      expect(output).toContain('Connection refused');
    });
  });
});
