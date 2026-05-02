import type { Options } from '@anthropic-ai/claude-agent-sdk';

export const DEFAULT_MAX_TURNS = 1;
export const HAIKU_MAX_TURNS = 4;

export const DEFAULT_OPTIONS: Pick<Options, 'permissionMode' | 'allowedTools' | 'disallowedTools'> =
  {
    permissionMode: 'default',
    allowedTools: [],
    disallowedTools: ['ToolSearch'],
  };
