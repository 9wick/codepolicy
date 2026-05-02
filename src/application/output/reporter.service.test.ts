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
  threshold: 70,
  level: 'error',
  create: () => okAsync(() => okAsync({ score: 100, reason: 'ok' })),
  ...overrides,
});

const makeResult = (overrides?: Partial<LintResult>): LintResult => ({
  filePath: 'src/user/repository.ts',
  scopeName: 'getUserById()',
  rule: makeRule(),
  score: 42,
  reason: 'getUser() の実装内部でログの書き込みが行われています。',
  passed: false,
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
          rule: makeRule({ id: 'layer-responsibility', threshold: 80, level: 'warn' }),
          score: 61,
          reason: 'UserService がDBの接続処理を直接参照しています。',
          passed: false,
        }),
      ];

      const output = reporter.format({ results, errors: [] });

      expect(output).toContain('2 violations found');
      expect(output).toContain('src/user/repository.ts > getUserById()');
      expect(output).toContain('[function-contract] score: 42 (threshold: 70) error');
      expect(output).toContain('[1.5sec | token in:1,200 out:350]');
      expect(output).toContain('getUser() の実装内部でログの書き込みが行われています。');
      expect(output).toContain('src/user/service.ts > updateUser()');
      expect(output).toContain('[layer-responsibility] score: 61 (threshold: 80) warn');
      expect(output).toContain('UserService がDBの接続処理を直接参照しています。');
    });

    it('violation なし → 成功メッセージ（usage合計を含む）', () => {
      const results: LintResult[] = [
        makeResult({ passed: true, score: 85 }),
        makeResult({
          passed: true,
          score: 90,
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
          rule: makeRule({ id: 'naming-convention', threshold: 60, level: 'warn' }),
          score: 30,
          reason: '命名規則に違反しています。',
          passed: false,
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
      const results: LintResult[] = [makeResult({ passed: true, score: 85 })];
      expect(reporter.getExitCode({ results, errors: [] })).toBe(0);
    });

    it('warn のみ → exit code 0', () => {
      const results: LintResult[] = [
        makeResult({
          passed: false,
          rule: makeRule({ level: 'warn' }),
        }),
      ];
      expect(reporter.getExitCode({ results, errors: [] })).toBe(0);
    });

    it('error あり → exit code 1', () => {
      const results: LintResult[] = [
        makeResult({
          passed: false,
          rule: makeRule({ level: 'error' }),
        }),
      ];
      expect(reporter.getExitCode({ results, errors: [] })).toBe(1);
    });

    it('warn と error 混在 → exit code 1', () => {
      const results: LintResult[] = [
        makeResult({
          passed: false,
          rule: makeRule({ level: 'warn' }),
        }),
        makeResult({
          passed: false,
          rule: makeRule({ level: 'error' }),
        }),
      ];
      expect(reporter.getExitCode({ results, errors: [] })).toBe(1);
    });

    it('空結果 → exit code 0', () => {
      expect(reporter.getExitCode({ results: [], errors: [] })).toBe(0);
    });

    it('passed=true の error ルールは exit code に影響しない', () => {
      const results: LintResult[] = [
        makeResult({
          passed: true,
          score: 85,
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
      const results: LintResult[] = [makeResult({ passed: false })];
      const errors: LintErrorEntry[] = [
        {
          filePath: 'src/bar.ts',
          scopeName: 'barFn()',
          rule: makeRule({ id: 'naming-convention' }),
          error: codepolicyError('LLM_API_ERROR', 'Connection refused'),
        },
      ];
      const output = reporter.format({ results, errors });

      expect(output).toContain('1 violations');
      expect(output).toContain('1 error');
      expect(output).toContain('Connection refused');
    });
  });
});
