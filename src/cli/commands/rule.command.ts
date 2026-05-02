import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'rule',
    description: 'Manage and debug rules',
  },
  subCommands: {
    list: () => import('./rule-list.command').then((m) => m.default),
    show: () => import('./rule-show.command').then((m) => m.default),
    run: () => import('./rule-run.command').then((m) => m.default),
  },
});
