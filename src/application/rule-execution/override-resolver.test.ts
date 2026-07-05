import { okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import type { OverrideEntry, ResolvedRule } from '../../shared/types';

import { applyOverrides, matchesOverride } from './override-resolver';

const baseRule: ResolvedRule = {
  id: 'naming',
  scope: 'function',
  agent: 'claude',
  borderline: 'warn',
  level: 'error',
  create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
  options: { style: 'camelCase' },
};

describe('matchesOverride', () => {
  it('returns true when filePath matches a files pattern', () => {
    const override: OverrideEntry = { files: ['src/**/*.ts'], rules: {} };
    expect(matchesOverride('src/app/foo.ts', override)).toBe(true);
  });

  it('returns false when filePath does not match any files pattern', () => {
    const override: OverrideEntry = { files: ['tests/**/*.ts'], rules: {} };
    expect(matchesOverride('src/app/foo.ts', override)).toBe(false);
  });

  it('returns false when filePath matches files but also matches ignores', () => {
    const override: OverrideEntry = {
      files: ['src/**/*.ts'],
      ignores: ['src/**/*.test.ts'],
      rules: {},
    };
    expect(matchesOverride('src/app/foo.test.ts', override)).toBe(false);
  });

  it('returns true when filePath matches files and does not match ignores', () => {
    const override: OverrideEntry = {
      files: ['src/**/*.ts'],
      ignores: ['src/**/*.test.ts'],
      rules: {},
    };
    expect(matchesOverride('src/app/foo.ts', override)).toBe(true);
  });
});

describe('applyOverrides', () => {
  it('returns base rule unchanged when no overrides exist', () => {
    const result = applyOverrides(baseRule, 'src/app/foo.ts', []);

    expect(result).toEqual(baseRule);
  });

  it('returns null when matching override sets level=off', () => {
    const overrides: OverrideEntry[] = [{ files: ['src/**/*.ts'], rules: { naming: 'off' } }];

    const result = applyOverrides(baseRule, 'src/app/foo.ts', overrides);

    expect(result).toBeNull();
  });

  it('returns rule with new borderline when override changes borderline', () => {
    const overrides: OverrideEntry[] = [
      { files: ['src/**/*.ts'], rules: { naming: { level: 'error', borderline: 'off' } } },
    ];

    const result = applyOverrides(baseRule, 'src/app/foo.ts', overrides);

    expect(result).not.toBeNull();
    expect(result!.borderline).toBe('off');
    expect(result!.level).toBe('error');
  });

  it('replaces base options completely when override provides options', () => {
    const overrides: OverrideEntry[] = [
      {
        files: ['src/**/*.ts'],
        rules: { naming: { level: 'error', prefix: 'I' } as never },
      },
    ];

    const result = applyOverrides(baseRule, 'src/app/foo.ts', overrides);

    expect(result).not.toBeNull();
    expect(result!.options).toEqual({ prefix: 'I' });
  });

  it('returns base rule unchanged when file does not match override', () => {
    const overrides: OverrideEntry[] = [{ files: ['tests/**/*.ts'], rules: { naming: 'off' } }];

    const result = applyOverrides(baseRule, 'src/app/foo.ts', overrides);

    expect(result).toEqual(baseRule);
  });

  it('applies later override over earlier one (last wins)', () => {
    const overrides: OverrideEntry[] = [
      { files: ['src/**/*.ts'], rules: { naming: { level: 'warn', borderline: 'off' } } },
      { files: ['src/**/*.ts'], rules: { naming: { level: 'error', borderline: 'error' } } },
    ];

    const result = applyOverrides(baseRule, 'src/app/foo.ts', overrides);

    expect(result).not.toBeNull();
    expect(result!.level).toBe('error');
    expect(result!.borderline).toBe('error');
  });

  it('excludes file when override has matching ignores pattern', () => {
    const overrides: OverrideEntry[] = [
      {
        files: ['src/**/*.ts'],
        ignores: ['src/**/*.test.ts'],
        rules: { naming: 'off' },
      },
    ];

    const result = applyOverrides(baseRule, 'src/app/foo.test.ts', overrides);

    expect(result).toEqual(baseRule);
  });

  it('changes level from error to warn', () => {
    const overrides: OverrideEntry[] = [{ files: ['src/**/*.ts'], rules: { naming: 'warn' } }];

    const result = applyOverrides(baseRule, 'src/app/foo.ts', overrides);

    expect(result).not.toBeNull();
    expect(result!.level).toBe('warn');
  });

  it('revives a rule from off to error via override', () => {
    const offRule: ResolvedRule = { ...baseRule, level: 'off' };
    const overrides: OverrideEntry[] = [{ files: ['src/**/*.ts'], rules: { naming: 'error' } }];

    const result = applyOverrides(offRule, 'src/app/foo.ts', overrides);

    expect(result).not.toBeNull();
    expect(result!.level).toBe('error');
  });
});
