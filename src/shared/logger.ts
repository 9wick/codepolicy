import { AsyncLocalStorage } from 'node:async_hooks';

import { InjectionToken, injectable } from '@needle-di/core';

export type LogContext = {
  readonly rule?: string;
  readonly scope?: string;
};

export type LogRecord = {
  readonly service: string;
  readonly message: string;
  readonly rule?: string;
  readonly scope?: string;
};

export type Logger = {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly debug: (message: string) => void;
};

export type LogLevel = 'info' | 'debug';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = { info: 0, debug: 1 };

export function isLogEnabled(messageLevel: LogLevel, currentLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[messageLevel] <= LOG_LEVEL_PRIORITY[currentLevel];
}

export const LogLevelToken = new InjectionToken<{ level: LogLevel }>('LogLevelToken');

export type CreateLoggerFn = (service: string) => Logger;
export const CreateLogger = new InjectionToken<CreateLoggerFn>('CreateLogger');

@injectable()
export class LogContextStore {
  private storage = new AsyncLocalStorage<LogContext>();

  run<T>(ctx: LogContext, fn: () => T): T {
    return this.storage.run(ctx, fn);
  }

  getContext(): LogContext | undefined {
    return this.storage.getStore();
  }
}

export function compactFormat(record: LogRecord): string {
  const parts = ['[codepolicy]', `[${record.service}]`];
  if (record.rule) {
    parts.push(record.rule);
    if (record.scope) {
      parts.push(`> ${record.scope}`);
    }
    parts.push('|');
  }
  parts.push(record.message);
  return parts.join(' ');
}
