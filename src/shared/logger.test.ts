import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CreateLogger,
  LogContextStore,
  LogLevelToken,
  compactFormat,
  isLogEnabled,
} from './logger';
import { getAppContainer, resetAppContainer } from './container';

describe('compactFormat', () => {
  it('コンテキストなし: service と message のみ出力する', () => {
    const result = compactFormat({ service: 'LintPipeline', message: 'Loading config...' });
    expect(result).toBe('[codepolicy] [LintPipeline] Loading config...');
  });

  it('rule のみ: rule と区切り "|" を含める', () => {
    const result = compactFormat({
      service: 'LintPipeline',
      message: 'Found 3 target file(s)',
      rule: 'no-implicit-fallback',
    });
    expect(result).toBe(
      '[codepolicy] [LintPipeline] no-implicit-fallback | Found 3 target file(s)',
    );
  });

  it('rule + scope: "rule > scope |" 形式で出力する', () => {
    const result = compactFormat({
      service: 'OpenCodeProvider',
      message: 'response (2 parts)',
      rule: 'no-implicit-fallback',
      scope: 'utils.ts:handleError',
    });
    expect(result).toBe(
      '[codepolicy] [OpenCodeProvider] no-implicit-fallback > utils.ts:handleError | response (2 parts)',
    );
  });

  it('scope のみ (rule なし): scope を無視してコンテキストなしと同じ出力にする', () => {
    const result = compactFormat({
      service: 'LintPipeline',
      message: 'test',
      scope: 'utils.ts:handleError',
    });
    expect(result).toBe('[codepolicy] [LintPipeline] test');
  });
});

describe('LogContextStore', () => {
  it('run 外では getContext が undefined を返す', () => {
    const store = new LogContextStore();
    expect(store.getContext()).toBeUndefined();
  });

  it('run 内では設定したコンテキストが取得できる', () => {
    const store = new LogContextStore();
    const ctx = { rule: 'rule-a', scope: 'file.ts:fn' };
    store.run(ctx, () => {
      expect(store.getContext()).toEqual(ctx);
    });
  });

  it('run 完了後はコンテキストがクリアされる', () => {
    const store = new LogContextStore();
    store.run({ rule: 'rule-a' }, () => {});
    expect(store.getContext()).toBeUndefined();
  });

  it('ネストした run では内側のコンテキストが優先される', () => {
    const store = new LogContextStore();
    const outer = { rule: 'outer-rule', scope: 'outer-scope' };
    const inner = { rule: 'inner-rule', scope: 'inner-scope' };

    store.run(outer, () => {
      expect(store.getContext()).toEqual(outer);
      store.run(inner, () => {
        expect(store.getContext()).toEqual(inner);
      });
      expect(store.getContext()).toEqual(outer);
    });
  });

  it('async 処理でもコンテキストが伝播する', async () => {
    const store = new LogContextStore();
    const ctx = { rule: 'async-rule', scope: 'async-scope' };

    await new Promise<void>((resolve) => {
      store.run(ctx, () => {
        Promise.resolve()
          .then(() => {
            expect(store.getContext()).toEqual(ctx);
            resolve();
          })
          .catch(() => {});
      });
    });
  });

  it('並行する run は互いのコンテキストに影響しない', async () => {
    const store = new LogContextStore();
    const ctxA = { rule: 'rule-a', scope: 'scope-a' };
    const ctxB = { rule: 'rule-b', scope: 'scope-b' };

    const results: string[] = [];

    await Promise.all([
      new Promise<void>((resolve) => {
        store.run(ctxA, () => {
          setTimeout(() => {
            results.push(`A:${store.getContext()?.rule ?? 'none'}`);
            resolve();
          }, 10);
        });
      }),
      new Promise<void>((resolve) => {
        store.run(ctxB, () => {
          setTimeout(() => {
            results.push(`B:${store.getContext()?.rule ?? 'none'}`);
            resolve();
          }, 5);
        });
      }),
    ]);

    expect(results).toContain('A:rule-a');
    expect(results).toContain('B:rule-b');
  });
});

describe('isLogEnabled', () => {
  it('info メッセージは info レベルで有効', () => {
    expect(isLogEnabled('info', 'info')).toBe(true);
  });

  it('debug メッセージは info レベルで無効', () => {
    expect(isLogEnabled('debug', 'info')).toBe(false);
  });

  it('info メッセージは debug レベルで有効', () => {
    expect(isLogEnabled('info', 'debug')).toBe(true);
  });

  it('debug メッセージは debug レベルで有効', () => {
    expect(isLogEnabled('debug', 'debug')).toBe(true);
  });
});

describe('CreateLogger with LogLevel', () => {
  afterEach(() => {
    resetAppContainer();
    vi.restoreAllMocks();
  });

  it('level: info 時に logger.debug は出力しない', () => {
    const container = getAppContainer();
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    container.get(LogLevelToken).level = 'info';

    const logger = container.get(CreateLogger)('TestService');
    logger.debug('should not appear');

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('level: debug 時に logger.debug が出力する', () => {
    const container = getAppContainer();
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    container.get(LogLevelToken).level = 'debug';

    const logger = container.get(CreateLogger)('TestService');
    logger.debug('debug message');

    expect(stderrSpy).toHaveBeenCalledOnce();
    expect(stderrSpy.mock.calls[0]?.[0]).toContain('debug message');
  });

  it('logger.info は常に出力する', () => {
    const container = getAppContainer();
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const logger = container.get(CreateLogger)('TestService');
    logger.info('info message');

    expect(stderrSpy).toHaveBeenCalledOnce();
    expect(stderrSpy.mock.calls[0]?.[0]).toContain('info message');
  });

  it('level: info 時に logger.info は出力する', () => {
    const container = getAppContainer();
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    container.get(LogLevelToken).level = 'info';

    const logger = container.get(CreateLogger)('TestService');
    logger.info('info in info mode');

    expect(stderrSpy).toHaveBeenCalledOnce();
    expect(stderrSpy.mock.calls[0]?.[0]).toContain('info in info mode');
  });
});
