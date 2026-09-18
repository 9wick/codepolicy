import type { ArgDef } from 'citty';

export const cacheOption = {
  type: 'boolean',
  description: 'Use evaluation result cache',
  negativeDescription: 'Disable evaluation result cache (do not look up or save cache entries)',
  default: true,
} satisfies ArgDef;
