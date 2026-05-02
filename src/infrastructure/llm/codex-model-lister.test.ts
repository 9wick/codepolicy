import { type ChildProcess, spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listCodexModels } from './codex-model-lister';

vi.mock('node:child_process');

function createMockProcess(responses: Record<number, object>): ChildProcess {
  const stdout = new Readable({ read() {} });
  const stdin = new Writable({
    write(chunk, _encoding, cb) {
      const msg = JSON.parse(chunk.toString().trim()) as { id: number };
      const response = responses[msg.id];
      if (response) {
        process.nextTick(() => stdout.push(`${JSON.stringify(response)}\n`));
      }
      cb();
    },
  });

  return {
    stdout,
    stdin,
    kill: vi.fn(),
    on: vi.fn(),
  } as unknown as ChildProcess;
}

describe('listCodexModels', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initialize → model/list で正常にモデル一覧を取得する', async () => {
    const mockProc = createMockProcess({
      1: { id: 1, result: { userAgent: 'test' } },
      2: {
        id: 2,
        result: {
          data: [
            { id: 'gpt-5.4', displayName: 'GPT 5.4', description: 'Test model' },
            { id: 'o3-mini', displayName: 'O3 Mini', description: 'Small model' },
          ],
        },
      },
    });
    vi.mocked(spawn).mockReturnValue(mockProc);

    const result = await listCodexModels();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      { id: 'gpt-5.4', displayName: 'GPT 5.4', description: 'Test model' },
      { id: 'o3-mini', displayName: 'O3 Mini', description: 'Small model' },
    ]);
  });

  it('JSON-RPCエラー時にerrを返す', async () => {
    const mockProc = createMockProcess({
      1: { id: 1, error: { code: -32600, message: 'Bad request' } },
    });
    vi.mocked(spawn).mockReturnValue(mockProc);

    const result = await listCodexModels();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('Bad request');
  });

  it('spawn失敗時にerrを返す', async () => {
    const mockProc = createMockProcess({});
    vi.mocked(spawn).mockReturnValue(mockProc);

    const errorHandler = vi.fn();
    vi.mocked(mockProc.on).mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'error') {
          errorHandler.mockImplementation(handler);
        }
        return mockProc;
      },
    );

    const promise = listCodexModels();
    errorHandler(new Error('ENOENT'));
    const result = await promise;

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('Failed to spawn codex');
  });
});
