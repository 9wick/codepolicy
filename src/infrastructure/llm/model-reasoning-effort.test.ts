import { describe, expect, it } from 'vitest';

import { parseModelReasoningEffort } from './model-reasoning-effort';

describe('parseModelReasoningEffort', () => {
  it('未指定は undefined を返す', () => {
    const result = parseModelReasoningEffort(undefined);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeUndefined();
  });

  it('有効な値を受け入れる', () => {
    const result = parseModelReasoningEffort('medium');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('medium');
  });

  it('無効な値はエラーを返す', () => {
    const result = parseModelReasoningEffort('turbo');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('Unsupported reasoning effort');
  });
});
