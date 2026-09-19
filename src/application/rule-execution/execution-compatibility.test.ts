import { okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import definition from '../../rules/jev-no-implicit-fallback/rule';
import type { ResolvedRule } from '../../shared/types';

import { validateExecution } from './execution-compatibility';

const common = { id: 'test', scope: 'function', level: 'error', borderline: 'warn' };
const text: ResolvedRule = {
  ...common,
  scope: 'function',
  level: 'error',
  borderline: 'warn',
  agent: 'typesafe-jev',
  create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
};
const decision: ResolvedRule = {
  ...common,
  scope: 'function',
  level: 'error',
  borderline: 'warn',
  kind: 'decision',
  agent: 'typesafe-jev',
  definition,
  cacheable: false,
};

describe('execution compatibility', () => {
  it('rejects text rules with decision models and decision rules with text models', () => {
    expect(validateExecution([text], undefined)._unsafeUnwrapErr().message).toContain(
      'requires a text model',
    );
    expect(
      validateExecution([{ ...decision, agent: 'gpt-5.4' }], undefined)._unsafeUnwrapErr().message,
    ).toContain('requires a TypeSafe model');
  });
  it('rejects reasoning effort and invalid TypeSafe IDs before evaluation', () => {
    expect(validateExecution([decision], 'high').isErr()).toBe(true);
    expect(validateExecution([{ ...decision, agent: 'typesafe-jev-' }], undefined).isErr()).toBe(
      true,
    );
  });
  it('ignores disabled rules and accepts supported combinations', () => {
    expect(validateExecution([{ ...text, level: 'off' }], undefined).isOk()).toBe(true);
    expect(validateExecution([decision], undefined).isOk()).toBe(true);
    expect(validateExecution([{ ...text, agent: 'openai/gpt-5.4' }], 'high').isOk()).toBe(true);
  });
});
