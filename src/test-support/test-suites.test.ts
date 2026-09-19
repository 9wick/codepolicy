import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function collect(config: string): string[] {
  const output = execFileSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'list', '--filesOnly', '--config', config],
    { encoding: 'utf8', timeout: 20_000, env: { ...process.env, NO_COLOR: '1' } },
  );
  return output
    .trim()
    .split('\n')
    .filter((line) => line.endsWith('.test.ts'));
}

describe('test suite boundaries', () => {
  it('test suites are disjoint and cover all current test files', () => {
    const internal = collect('vitest.config.ts');
    const infra = collect('vitest.infra.config.ts');
    const rules = collect('vitest.rules.config.ts');
    const actual = [...internal, ...infra, ...rules].map((file) =>
      path.relative(process.cwd(), path.resolve(file)),
    );
    const expected = ['src', '.codepolicy'].flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.test.ts'))
        .map((file) => path.join(dir, file)),
    );

    expect(new Set(actual).size).toBe(actual.length);
    expect(actual.sort()).toEqual(expected.sort());
    expect(internal.length).toBeGreaterThan(0);
    expect(infra).toHaveLength(2);
    expect(infra.every((file) => file.endsWith('.infra.test.ts'))).toBe(true);
    expect(rules).toHaveLength(15);
    expect(rules.every((file) => file.endsWith('/rule.test.ts'))).toBe(true);
    expect(
      internal.some((file) => file.endsWith('.infra.test.ts') || file.endsWith('/rule.test.ts')),
    ).toBe(false);
  }, 60_000);
});
