import { Type } from '@sinclair/typebox';
import { okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CodepolicyConfig } from '../shared/types';
import { createTestContainer } from '../test-support/test-container';

import { RuleResolver } from './rule-resolver.service';
import type { RuleModule } from './rule-types';

const makeRule = (id: string, overrides?: Partial<RuleModule>): RuleModule => ({
  id,
  definition: {
    meta: { scope: 'function' },
    create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
  },
  ...overrides,
});

const makeConfig = (rules: CodepolicyConfig['rules']): CodepolicyConfig => ({
  filter: 'diff',
  agent: 'config-agent',
  rules,
});

describe('RuleResolver', () => {
  let resolver: RuleResolver;

  beforeEach(() => {
    ({ target: resolver } = createTestContainer(RuleResolver));
  });

  it('should resolve rules listed in config', () => {
    const rules = [makeRule('naming'), makeRule('no-magic')];
    const config = makeConfig({ naming: 'error', 'no-magic': 'warn' });

    const result = resolver.resolve(config, rules);

    expect(result.isOk()).toBe(true);
    const resolved = result._unsafeUnwrap();
    expect(resolved).toHaveLength(2);
    expect(resolved[0]!).toMatchObject({
      id: 'naming',
      scope: 'function',
      agent: 'config-agent',
      borderline: 'warn',
      level: 'error',
    });
    expect(resolved[0]!.create).toBeTypeOf('function');
    expect(resolved[1]!.level).toBe('warn');
  });

  it('should include rules with level off in resolved output', () => {
    const rules = [makeRule('naming'), makeRule('no-magic')];
    const config = makeConfig({ naming: 'error', 'no-magic': 'off' });

    const result = resolver.resolve(config, rules);

    expect(result.isOk()).toBe(true);
    const resolved = result._unsafeUnwrap();
    expect(resolved).toHaveLength(2);
    expect(resolved[1]!).toMatchObject({ id: 'no-magic', level: 'off' });
  });

  it('should include rules with object-style level off in resolved output', () => {
    const rules = [makeRule('naming')];
    const config = makeConfig({ naming: { level: 'off' } });

    const result = resolver.resolve(config, rules);

    expect(result.isOk()).toBe(true);
    const resolved = result._unsafeUnwrap();
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!).toMatchObject({ id: 'naming', level: 'off' });
  });

  it('should override borderline from config', () => {
    const rules = [makeRule('naming')];
    const config = makeConfig({ naming: { level: 'error', borderline: 'off' } });

    const result = resolver.resolve(config, rules);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()[0]!.borderline).toBe('off');
  });

  it('should default borderline to warn when config does not specify', () => {
    const rules = [makeRule('naming')];
    const config = makeConfig({ naming: 'warn' });

    const result = resolver.resolve(config, rules);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()[0]!.borderline).toBe('warn');
  });

  it('should only include rules listed in config (whitelist)', () => {
    const rules = [makeRule('naming'), makeRule('no-magic'), makeRule('complexity')];
    const config = makeConfig({ naming: 'error' });

    const result = resolver.resolve(config, rules);

    expect(result.isOk()).toBe(true);
    const resolved = result._unsafeUnwrap();
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.id).toBe('naming');
  });

  it('should return RULE_NOT_FOUND when config references missing rule', () => {
    const rules = [makeRule('naming')];
    const config = makeConfig({ naming: 'error', 'nonexistent-rule': 'warn' });

    const result = resolver.resolve(config, rules);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('RULE_NOT_FOUND');
    expect(result._unsafeUnwrapErr().message).toContain('nonexistent-rule');
  });

  it('should return RULE_NOT_FOUND listing all missing rule IDs', () => {
    const rules: RuleModule[] = [];
    const config = makeConfig({ 'rule-a': 'error', 'rule-b': 'warn' });

    const result = resolver.resolve(config, rules);

    expect(result.isErr()).toBe(true);
    const errorMsg = result._unsafeUnwrapErr().message;
    expect(errorMsg).toContain('rule-a');
    expect(errorMsg).toContain('rule-b');
  });

  it('should return RULE_NOT_FOUND when override references unknown rule', () => {
    const rules = [makeRule('naming')];
    const config: CodepolicyConfig = {
      filter: 'diff',
      agent: 'config-agent',
      rules: { naming: 'error' },
      overrides: [{ files: ['**/*.test.ts'], rules: { 'unknown-rule': 'off' } }],
    };

    const result = resolver.resolve(config, rules);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('RULE_NOT_FOUND');
    expect(result._unsafeUnwrapErr().message).toContain('unknown-rule');
  });

  it('should override agent from config', () => {
    const rules = [makeRule('naming')];
    const config = makeConfig({ naming: 'error' });
    config.agent = 'github-copilot/gpt-4.1';

    const result = resolver.resolve(config, rules);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()[0]!.agent).toBe('github-copilot/gpt-4.1');
  });

  it('should handle empty config rules', () => {
    const rules = [makeRule('naming')];
    const config = makeConfig({});

    const result = resolver.resolve(config, rules);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('should extract and pass options to resolved rule', () => {
    const optionsSchema = Type.Object({ dirs: Type.Array(Type.String()) });
    const rules: RuleModule[] = [
      {
        id: 'ssot',
        definition: {
          meta: { scope: 'function' },
          optionsSchema,
          create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
        },
      },
    ];
    const config = makeConfig({ ssot: { level: 'error', dirs: ['src/'] } as never });

    const result = resolver.resolve(config, rules);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()[0]!.options).toEqual({ dirs: ['src/'] });
  });

  it('should reject unknown options for rule without optionsSchema', () => {
    const rules = [makeRule('naming')];
    const config = makeConfig({ naming: { level: 'error', unknown: true } as never });

    const result = resolver.resolve(config, rules);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('CONFIG_PARSE_ERROR');
    expect(result._unsafeUnwrapErr().message).toContain('does not accept options');
  });

  it('should reject invalid options that fail schema validation', () => {
    const optionsSchema = Type.Object({ dirs: Type.Array(Type.String()) });
    const rules: RuleModule[] = [
      {
        id: 'ssot',
        definition: {
          meta: { scope: 'function' },
          optionsSchema,
          create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
        },
      },
    ];
    const config = makeConfig({ ssot: { level: 'error', dirs: 'not-array' } as never });

    const result = resolver.resolve(config, rules);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('CONFIG_PARSE_ERROR');
    expect(result._unsafeUnwrapErr().message).toContain('Invalid options');
  });

  it('should return undefined options for string config', () => {
    const rules = [makeRule('naming')];
    const config = makeConfig({ naming: 'error' });

    const result = resolver.resolve(config, rules);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()[0]!.options).toBeUndefined();
  });

  it('should accept rule with optionsSchema when no options provided and all optional', () => {
    const optionsSchema = Type.Object({ dirs: Type.Optional(Type.Array(Type.String())) });
    const rules: RuleModule[] = [
      {
        id: 'ssot',
        definition: {
          meta: { scope: 'function' },
          optionsSchema,
          create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
        },
      },
    ];
    const config = makeConfig({ ssot: 'error' });

    const result = resolver.resolve(config, rules);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()[0]!.options).toEqual({});
  });
});
