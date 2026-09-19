import { defineConfig } from 'vitest/config';

const allTests = ['src/**/*.test.ts', '.codepolicy/**/*.test.ts'];
const infraTests = ['src/**/*.infra.test.ts', '.codepolicy/**/*.infra.test.ts'];
const ruleTests = ['src/rules/*/rule.test.ts'];
const excluded = ['**/node_modules/**', '**/dist/**'];

export const testSuites = {
  internal: { include: allTests, exclude: [...excluded, ...infraTests, ...ruleTests] },
  infra: { include: infraTests, exclude: excluded },
  rules: { include: ruleTests, exclude: excluded },
};

export const commonConfig = defineConfig({
  define: {
    // 環境によって利用可能なモデルが異なるため env で上書き可能にする
    CODEPOLICY_TEST_AGENT: JSON.stringify(process.env['CODEPOLICY_TEST_AGENT'] ?? 'openai/gpt-5.4'),
    CODEPOLICY_TEST_JEV_MODEL: JSON.stringify(
      process.env['CODEPOLICY_TEST_JEV_MODEL'] ?? 'typesafe-jev-1.13.0',
    ),
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    environment: 'node',
    passWithNoTests: false,
    retry: 0,
    // Claude CodeのBashツールではデフォルトreporterの出力が消える問題の回避策
    // see: https://github.com/anthropics/claude-code/issues/19663
    ...(process.env['CLAUDE_CODE_ENTRYPOINT'] ? { reporters: ['verbose'] } : {}),
    // テスト内でcodepolicy→LLM→Claude Code がネスト起動する際のエラー回避
    env: {
      CLAUDECODE: '0',
    },
  },
});
