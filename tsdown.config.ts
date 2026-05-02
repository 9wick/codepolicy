import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli/entry.ts', 'src/index.ts'],
  outDir: './dist',
  format: ['esm'],
  clean: true,
  treeshake: true,
  platform: 'node',
  target: 'es2022',
  fixedExtension: true,
  dts: true,
  sourcemap: false,
  external: ['@needle-di/core'],
});
