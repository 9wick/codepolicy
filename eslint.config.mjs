// @ts-check
import eslint from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import importX from 'eslint-plugin-import-x';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';
import strictTypes from '@9wick/eslint-plugin-strict-type-rules';

// =============================================================================
// ESLint 設定
// =============================================================================

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '~/.cache',
      '**/coverage/**',
      'vitest.setup.ts',
      'tools/bun-test-guard.ts',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Register peer plugins required by strict-type-rules
  eslintComments.recommended,
  { plugins: { 'import-x': importX, sonarjs } },

  // Strict type rules (recommended + test relaxation)
  ...strictTypes.configs.recommended,
  ...strictTypes.configs.test,

  // Type-checked rules require projectService; disae for files outside src/ (non-test)
  {
    files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    ignores: ['src/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/**/*.test.ts', 'src/test-support/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  // ==========================================================================
  // Source files
  // ==========================================================================
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Custom import extensions
      'import-x/extensions': [
        'error',
        'never',
        {
          service: 'always',
          parser: 'always',
          adapter: 'always',
          port: 'always',
          command: 'always',
          lib: 'always',
        },
      ],
    },
  },

  // Service files: DI constructors with many inject() defaults inflate cyclomatic complexity
  {
    files: ['src/**/*.service.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      complexity: ['error', 10],
    },
  },

  // Command / config files have sub-extensions but are not DI modules
  {
    files: ['**/*.command.{ts,tsx}', '**/*.config.{ts,tsx}'],
    rules: {
      '@9wick/strict-type-rules/nestjs-like-di-for-needle-di': 'off',
      '@9wick/strict-type-rules/no-exported-callable': 'off',
      '@9wick/strict-type-rules/require-injectable-class': 'off',
      '@9wick/strict-type-rules/no-process-access': 'off',
    },
  },

  // .codepolicy/: self-package import is always classified as internal
  {
    files: ['.codepolicy/**/*.ts'],
    settings: {
      'import-x/internal-regex': '^codepolicy$',
    },
  },

  // CLI layer: console and process access are the boundary to the outside world
  {
    files: ['src/cli/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-console': 'off',
      '@9wick/strict-type-rules/no-process-access': 'off',
    },
  },

  // Anthropic SDK: BetaMessage type cannot be resolved by projectService
  {
    files: ['src/infrastructure/llm/anthropic.adapter.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  // DI container bootstrap: process.cwd() is bound here as the single source
  {
    files: ['src/shared/container.ts'],
    rules: {
      '@9wick/strict-type-rules/no-process-access': 'off',
    },
  },
);
