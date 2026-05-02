import { createOpencodeServer } from '@opencode-ai/sdk/v2';
import { describe, expect, it, vi } from 'vitest';

import { createTestContainer } from '../../test-support/test-container';

import { OpenCodeServerManager } from './opencode-server-manager';

vi.mock('@opencode-ai/sdk/v2', () => ({
  createOpencodeServer: vi.fn(),
  createOpencodeClient: vi.fn().mockReturnValue({}),
}));

describe('OpenCodeServerManager', () => {
  it('passes provider allowlist with setCacheKey: true to createOpencodeServer', async () => {
    const createOpencodeServerSpy = vi.mocked(createOpencodeServer);
    createOpencodeServerSpy.mockResolvedValue({
      url: 'http://localhost:0',
      close: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof createOpencodeServer>>);

    const { target } = createTestContainer(OpenCodeServerManager, []);
    await target.acquire();

    expect(createOpencodeServerSpy).toHaveBeenCalledTimes(1);
    const args = createOpencodeServerSpy.mock.calls[0]?.[0];
    expect(args).toBeDefined();
    const provider = args?.config?.provider;
    expect(provider).toBeDefined();
    if (!provider) return;
    expect(provider.copilot).toEqual({ options: { setCacheKey: true } });
    expect(provider.openai).toEqual({ options: { setCacheKey: true } });
    expect(provider.anthropic).toEqual({ options: { setCacheKey: true } });
    expect(provider.openrouter).toEqual({ options: { setCacheKey: true } });
  });

  it('does not enable setCacheKey for non-allowlisted providers', async () => {
    const createOpencodeServerSpy = vi.mocked(createOpencodeServer);
    createOpencodeServerSpy.mockResolvedValue({
      url: 'http://localhost:0',
      close: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof createOpencodeServer>>);

    const { target } = createTestContainer(OpenCodeServerManager, []);
    await target.acquire();

    const args = createOpencodeServerSpy.mock.calls[0]?.[0];
    const provider = args?.config?.provider;
    if (!provider) return;
    expect(provider.ollama).toBeUndefined();
    expect(provider.local).toBeUndefined();
  });
});
