import { Type } from '@sinclair/typebox';
import { ResultAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestContainer } from '../../test-support/test-container';

import { OpenCodeProvider } from './opencode.adapter';
import type { OpenCodeInstance } from './opencode-server-manager';
import { OpenCodeServerManager } from './opencode-server-manager';

const testSchema = Type.Object({
  score: Type.Number(),
  reason: Type.String(),
});

function createMockInstance(overrides?: {
  sessionCreate?: () => Promise<{ data: { id: string } | undefined }>;
  sessionPrompt?: (
    args: unknown,
  ) => Promise<{ data: { parts: { type: string; text: string }[] } | undefined }>;
  providerList?: () => Promise<{
    data: {
      all: { id: string; models: Record<string, object> }[];
    };
  }>;
}): OpenCodeInstance {
  return {
    client: {
      session: {
        create:
          overrides?.sessionCreate ?? vi.fn().mockResolvedValue({ data: { id: 'session-1' } }),
        prompt:
          overrides?.sessionPrompt ??
          vi.fn().mockResolvedValue({
            data: {
              parts: [{ type: 'text', text: JSON.stringify({ score: 8, reason: 'good' }) }],
            },
          }),
      },
      provider: {
        list:
          overrides?.providerList ??
          vi.fn().mockResolvedValue({
            data: {
              all: [{ id: 'anthropic', models: { 'claude-sonnet-4-5': {} } }],
            },
          }),
      },
    },
    server: { url: 'http://localhost:3000', close: vi.fn() },
  } as unknown as OpenCodeInstance;
}

function createRequest(modelOverride?: string) {
  return {
    prompt: { system: 'You are a linter.', user: 'Evaluate this code.' },
    config: { model: modelOverride ?? 'anthropic/claude-sonnet-4-5' },
    returnSchema: testSchema,
  } as const;
}

describe('OpenCodeProvider', () => {
  let provider: OpenCodeProvider;
  let mockServerManager: { acquire: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServerManager = {
      acquire: vi.fn(),
      release: vi.fn(),
    };
    const { target } = createTestContainer(OpenCodeProvider, [
      { provide: OpenCodeServerManager, useValue: mockServerManager },
    ]);
    provider = target;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupAcquire(instance: OpenCodeInstance) {
    mockServerManager.acquire.mockReturnValue(
      ResultAsync.fromSafePromise(Promise.resolve(instance)),
    );
  }

  it('正常系: JSON構造化出力を取得しバリデーションに成功する', async () => {
    setupAcquire(createMockInstance());

    const result = await provider.generate(createRequest());

    expect(result.isOk()).toBe(true);
    const value = result._unsafeUnwrap();
    expect(value.output).toEqual({ score: 8, reason: 'good' });
    expect(value.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
    expect(mockServerManager.release).toHaveBeenCalledOnce();
  });

  it('異常系: サーバー起動失敗時にerrを返す', async () => {
    mockServerManager.acquire.mockReturnValue(
      ResultAsync.fromPromise(
        Promise.reject(new Error('Failed to start server')),
        (e) => new Error(`OpenCode API request failed: ${(e as Error).message}`),
      ),
    );

    const result = await provider.generate(createRequest());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('OpenCode API request failed');
    expect(result._unsafeUnwrapErr().message).toContain('Failed to start server');
    expect(mockServerManager.release).toHaveBeenCalledOnce();
  });

  it('異常系: セッション作成失敗時にerrを返す', async () => {
    setupAcquire(
      createMockInstance({
        sessionCreate: vi.fn().mockResolvedValue({ data: undefined }),
      }),
    );

    const result = await provider.generate(createRequest());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('Failed to create OpenCode session');
    expect(mockServerManager.release).toHaveBeenCalledOnce();
  });

  it('異常系: JSON解析失敗時にerrを返す', async () => {
    setupAcquire(
      createMockInstance({
        sessionPrompt: vi.fn().mockResolvedValue({
          data: { parts: [{ type: 'text', text: 'this is not json{{{' }] },
        }),
      }),
    );

    const result = await provider.generate(createRequest());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain(
      'Failed to parse OpenCode response as JSON',
    );
    expect(mockServerManager.release).toHaveBeenCalledOnce();
  });

  it('正常系: step-finishパートからtoken usageを取得する', async () => {
    setupAcquire(
      createMockInstance({
        sessionPrompt: vi.fn().mockResolvedValue({
          data: {
            parts: [
              { type: 'text', text: JSON.stringify({ score: 8, reason: 'good' }) },
              {
                type: 'step-finish',
                tokens: { input: 500, output: 200, reasoning: 0, cache: { read: 0, write: 0 } },
              },
            ],
          },
        }),
      }),
    );

    const result = await provider.generate(createRequest());

    expect(result.isOk()).toBe(true);
    const value = result._unsafeUnwrap();
    expect(value.output).toEqual({ score: 8, reason: 'good' });
    expect(value.usage).toEqual({
      inputTokens: 500,
      outputTokens: 200,
      reasoningTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
  });

  it('正常系: 並行リクエストではサーバーが再利用される', async () => {
    setupAcquire(createMockInstance());

    await Promise.all([provider.generate(createRequest()), provider.generate(createRequest())]);

    expect(mockServerManager.acquire).toHaveBeenCalledTimes(2);
    expect(mockServerManager.release).toHaveBeenCalledTimes(2);
  });

  it('memoizes validateModelExists per (client, model): 2nd call to same model skips provider.list', async () => {
    const providerListSpy = vi.fn().mockResolvedValue({
      data: { all: [{ id: 'anthropic', models: { 'claude-sonnet-4-5': {} } }] },
    });
    const instance = createMockInstance({ providerList: providerListSpy });
    setupAcquire(instance);

    const r1 = await provider.generate(createRequest());
    const r2 = await provider.generate(createRequest());

    expect(r1.isOk()).toBe(true);
    expect(r2.isOk()).toBe(true);
    expect(providerListSpy).toHaveBeenCalledTimes(1);
  });

  it('does not memoize across different model IDs', async () => {
    const providerListSpy = vi.fn().mockResolvedValue({
      data: {
        all: [{ id: 'anthropic', models: { 'claude-sonnet-4-5': {}, 'claude-opus-4-5': {} } }],
      },
    });
    const instance = createMockInstance({ providerList: providerListSpy });
    setupAcquire(instance);

    await provider.generate(createRequest('anthropic/claude-sonnet-4-5'));
    await provider.generate(createRequest('anthropic/claude-opus-4-5'));

    expect(providerListSpy).toHaveBeenCalledTimes(2);
  });
});
