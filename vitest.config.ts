import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    CODEPOLICY_TEST_AGENT: JSON.stringify('github-copilot/gpt-4.1'),
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    environment: 'node',
    include: ['src/**/*.test.ts', '.codepolicy/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    passWithNoTests: true,
    // Claude CodeのBashツールではデフォルトreporterの出力が消える問題の回避策
    // see: https://github.com/anthropics/claude-code/issues/19663
    ...(process.env['CLAUDE_CODE_ENTRYPOINT'] ? { reporters: ['verbose'] } : {}),
    // テスト内でcodepolicy→LLM→Claude Code がネスト起動する際のエラー回避
    env: {
      CLAUDECODE: '0',
    },
  },
});
