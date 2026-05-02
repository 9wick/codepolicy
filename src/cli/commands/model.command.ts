import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'model',
    description: 'Manage LLM models',
  },
  subCommands: {
    list: () => import('./model-list.command').then((m) => m.default),
  },
});
