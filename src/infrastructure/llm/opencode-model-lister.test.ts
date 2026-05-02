import { ResultAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestContainer } from '../../test-support/test-container';

import type { OpencodeModel } from './opencode-model-lister';
import { OpenCodeModelLister } from './opencode-model-lister';
import type { OpenCodeInstance } from './opencode-server-manager';
import { OpenCodeServerManager } from './opencode-server-manager';

function createMockInstance(providerListResult: object): OpenCodeInstance {
  return {
    client: {
      provider: {
        list: vi.fn().mockResolvedValue(providerListResult),
      },
    },
    server: { url: 'http://localhost:3000', close: vi.fn() },
  } as unknown as OpenCodeInstance;
}

describe('OpenCodeModelLister', () => {
  let lister: OpenCodeModelLister;
  let mockServerManager: { acquire: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServerManager = {
      acquire: vi.fn(),
      release: vi.fn(),
    };
    const { target } = createTestContainer(OpenCodeModelLister, [
      { provide: OpenCodeServerManager, useValue: mockServerManager },
    ]);
    lister = target;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupAcquire(instance: OpenCodeInstance) {
    mockServerManager.acquire.mockReturnValue(
      ResultAsync.fromSafePromise(Promise.resolve(instance)),
    );
  }

  it('正常系: connectedプロバイダーのモデル一覧を取得する', async () => {
    setupAcquire(
      createMockInstance({
        data: {
          connected: ['anthropic', 'openai'],
          all: [
            {
              id: 'anthropic',
              models: {
                'claude-sonnet-4-20250514': {
                  id: 'claude-sonnet-4-20250514',
                  name: 'Claude Sonnet 4',
                },
                'claude-opus-4-20250514': {
                  id: 'claude-opus-4-20250514',
                  name: 'Claude Opus 4',
                },
              },
            },
            {
              id: 'openai',
              models: {
                'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o' },
              },
            },
          ],
        },
      }),
    );

    const result = await lister.listModels();

    expect(result.isOk()).toBe(true);
    const models = result._unsafeUnwrap();
    expect(models).toEqual<OpencodeModel[]>([
      {
        id: 'anthropic/claude-sonnet-4-20250514',
        providerID: 'anthropic',
        modelID: 'claude-sonnet-4-20250514',
        displayName: 'Claude Sonnet 4',
      },
      {
        id: 'anthropic/claude-opus-4-20250514',
        providerID: 'anthropic',
        modelID: 'claude-opus-4-20250514',
        displayName: 'Claude Opus 4',
      },
      {
        id: 'openai/gpt-4o',
        providerID: 'openai',
        modelID: 'gpt-4o',
        displayName: 'GPT-4o',
      },
    ]);
    expect(mockServerManager.release).toHaveBeenCalledOnce();
  });

  it('正常系: connectedでないプロバイダーは除外される', async () => {
    setupAcquire(
      createMockInstance({
        data: {
          connected: ['anthropic'],
          all: [
            {
              id: 'anthropic',
              models: {
                'claude-sonnet-4-20250514': {
                  id: 'claude-sonnet-4-20250514',
                  name: 'Claude Sonnet 4',
                },
              },
            },
            {
              id: 'openai',
              models: {
                'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o' },
              },
            },
          ],
        },
      }),
    );

    const result = await lister.listModels();

    expect(result.isOk()).toBe(true);
    const models = result._unsafeUnwrap();
    expect(models).toHaveLength(1);
    expect(models[0]?.providerID).toBe('anthropic');
    expect(models.every((m: OpencodeModel) => m.providerID !== 'openai')).toBe(true);
  });

  it('異常系: サーバー起動失敗時にerrを返す', async () => {
    mockServerManager.acquire.mockReturnValue(
      ResultAsync.fromPromise(
        Promise.reject(new Error('Connection refused')),
        (e) => new Error(`OpenCode API request failed: ${(e as Error).message}`),
      ),
    );

    const result = await lister.listModels();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('OpenCode API request failed');
    expect(result._unsafeUnwrapErr().message).toContain('Connection refused');
    expect(mockServerManager.release).toHaveBeenCalledOnce();
  });

  it('異常系: provider.list()がデータなしの場合にerrを返す', async () => {
    setupAcquire(createMockInstance({ data: undefined }));

    const result = await lister.listModels();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('OpenCode provider.list returned no data');
    expect(mockServerManager.release).toHaveBeenCalledOnce();
  });

  it('正常終了時にreleaseが呼ばれる', async () => {
    setupAcquire(
      createMockInstance({
        data: {
          connected: ['anthropic'],
          all: [
            {
              id: 'anthropic',
              models: {
                'claude-sonnet-4-20250514': {
                  id: 'claude-sonnet-4-20250514',
                  name: 'Claude Sonnet 4',
                },
              },
            },
          ],
        },
      }),
    );

    await lister.listModels();

    expect(mockServerManager.release).toHaveBeenCalledOnce();
  });

  it('エラー時にもreleaseが呼ばれる', async () => {
    setupAcquire(createMockInstance({ data: undefined }));

    const result = await lister.listModels();

    expect(result.isErr()).toBe(true);
    expect(mockServerManager.release).toHaveBeenCalledOnce();
  });
});
