import { describe, expect, it } from 'vitest';

import { AnthropicProvider } from './anthropic.adapter';
import { CodexProvider } from './codex.adapter';
import { OpenCodeProvider } from './opencode.adapter';
import { resolveProvider } from './resolve-provider';

describe('resolveProvider', () => {
  it('claude- prefix は AnthropicProvider を返す', () => {
    const result = resolveProvider('claude-sonnet-4-6', '.');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeInstanceOf(AnthropicProvider);
  });

  it('gpt- prefix は CodexProvider を返す', () => {
    const result = resolveProvider('gpt-5.1-codex', '.');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeInstanceOf(CodexProvider);
  });

  it('o1- prefix は CodexProvider を返す', () => {
    const result = resolveProvider('o1-pro', '.');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeInstanceOf(CodexProvider);
  });

  it('o3- prefix は CodexProvider を返す', () => {
    const result = resolveProvider('o3-mini', '.');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeInstanceOf(CodexProvider);
  });

  it('codex- prefix は CodexProvider を返す', () => {
    const result = resolveProvider('codex-mini', '.');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeInstanceOf(CodexProvider);
  });

  it('provider/model 形式は OpenCodeProvider を返す', () => {
    const result = resolveProvider('anthropic/claude-sonnet-4-5', '.');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeInstanceOf(OpenCodeProvider);
  });

  it('未知のprefix は Err を返す', () => {
    const result = resolveProvider('llama-3', '.');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('Unsupported model');
    expect(result._unsafeUnwrapErr().message).toContain('llama-3');
  });
});
