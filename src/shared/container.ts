import path from 'node:path';

import { Container } from '@needle-di/core';

import { WorkingDir } from '../application/config/config-loader.service';
import { CacheDisabledToken } from '../application/rule-execution/eval-cache.service';
import { CacheStoreToken } from '../infrastructure/cache/cache-store';
import { createFileCacheStore } from '../infrastructure/cache/file-cache-store';

import { LifecycleManager } from './lifecycle-manager';
import {
  CreateLogger,
  LogContextStore,
  LogLevelToken,
  compactFormat,
  isLogEnabled,
  type CreateLoggerFn,
  type LogLevel,
  type LogRecord,
} from './logger';

let appContainer: Container | null = null;

export const getAppContainer = (): Container => {
  if (appContainer) return appContainer;
  appContainer = new Container();

  const workingDir = process.cwd();
  appContainer.bind({ provide: WorkingDir, useValue: workingDir });

  appContainer.bind({
    provide: CacheStoreToken,
    useValue: createFileCacheStore(path.join(workingDir, '.codepolicy', 'cache')),
  });
  appContainer.bind({ provide: CacheDisabledToken, useValue: false });

  const logContextStore = new LogContextStore();
  appContainer.bind({ provide: LogContextStore, useValue: logContextStore });

  const logLevelRef: { level: LogLevel } = { level: 'info' };
  appContainer.bind({ provide: LogLevelToken, useValue: logLevelRef });
  appContainer.bind({
    provide: CreateLogger,
    useValue: ((service: string) => {
      const emit = (message: string, level: LogLevel): void => {
        if (!isLogEnabled(level, logLevelRef.level)) return;
        const ctx = logContextStore.getContext();
        const record: LogRecord = { service, message, rule: ctx?.rule, scope: ctx?.scope };
        process.stderr.write(`${compactFormat(record)}\n`);
      };
      return {
        info: (message: string) => emit(message, 'info'),
        warn: (message: string) => emit(message, 'info'),
        debug: (message: string) => emit(message, 'debug'),
      };
    }) satisfies CreateLoggerFn,
  });

  return appContainer;
};

export const resetAppContainer = (): void => {
  appContainer = null;
};

export const destroyAppContainer = async (): Promise<void> => {
  if (appContainer) {
    await appContainer.get(LifecycleManager).shutdown();
    appContainer = null;
  }
};
