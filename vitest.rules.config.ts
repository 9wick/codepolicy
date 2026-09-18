import { defineConfig } from 'vitest/config';

import { commonConfig, testSuites } from './vitest.shared.config';

export default defineConfig({
  ...commonConfig,
  test: { ...commonConfig.test, ...testSuites.rules, fileParallelism: false, maxWorkers: 1 },
});
