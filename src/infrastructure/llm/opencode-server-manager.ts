import { inject, injectable } from '@needle-di/core';
import {
  type OpencodeClient,
  createOpencodeClient,
  createOpencodeServer,
} from '@opencode-ai/sdk/v2';
import { ResultAsync } from 'neverthrow';

import { CreateLogger } from '../../shared/logger';
import { type Disposable, LifecycleManager } from '../../shared/lifecycle-manager';

export type OpenCodeInstance = {
  client: OpencodeClient;
  server: { url: string; close(): void };
};

const IDLE_CLOSE_DELAY_MS = 3_000;

// Provider allowlist for OpenAI-style automatic prompt caching via `prompt_cache_key`.
// Only enable on providers we have verified handle the parameter without side effects.
const PROMPT_CACHE_KEY_PROVIDERS = ['copilot', 'openai', 'anthropic', 'openrouter'] as const;

function buildProviderConfig(): Record<string, { options: { setCacheKey: boolean } }> {
  const out: Record<string, { options: { setCacheKey: boolean } }> = {};
  for (const id of PROMPT_CACHE_KEY_PROVIDERS) {
    out[id] = { options: { setCacheKey: true } };
  }
  return out;
}

function toError(cause: unknown): Error {
  return new Error(
    `OpenCode API request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
}

@injectable()
export class OpenCodeServerManager implements Disposable {
  private cachedResult: ResultAsync<OpenCodeInstance, Error> | null = null;
  private refCount = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lifecycle = inject(LifecycleManager);
  private log = inject(CreateLogger)('OpenCodeServerManager');

  constructor() {
    this.lifecycle.register(this);
  }

  acquire(): ResultAsync<OpenCodeInstance, Error> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.refCount++;
    if (!this.cachedResult) {
      this.log.info('starting new server');
      this.cachedResult = ResultAsync.fromPromise(
        createOpencodeServer({
          port: 0,
          config: {
            agent: { codepolicy: { steps: 1, tools: {} } },
            provider: buildProviderConfig(),
          },
        }),
        toError,
      )
        .map((server) => ({
          client: createOpencodeClient({ baseUrl: server.url }),
          server,
        }))
        .mapErr((error) => {
          this.cachedResult = null;
          this.refCount = 0;
          return error;
        });
    }
    return this.cachedResult;
  }

  release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0 && this.cachedResult) {
      const ref = this.cachedResult;
      this.idleTimer = setTimeout(() => {
        if (this.refCount === 0 && this.cachedResult === ref) {
          this.log.info('idle timeout, closing server');
          this.cachedResult = null;
          void ref.match(
            (instance) => instance.server.close(),
            () => {},
          );
        }
        this.idleTimer = null;
      }, IDLE_CLOSE_DELAY_MS);
    }
  }

  async shutdown(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.cachedResult) {
      const ref = this.cachedResult;
      this.cachedResult = null;
      this.refCount = 0;
      await ref.match(
        (instance) => instance.server.close(),
        () => {},
      );
    }
  }
}
