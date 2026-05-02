import { defineCommand } from 'citty';

import { builtinRules } from '../../rules/builtin-rules';

export default defineCommand({
  meta: {
    name: 'show',
    description: 'Show rule details',
  },
  args: {
    id: {
      type: 'positional',
      description: 'Rule ID to show',
      required: true,
    },
  },
  run({ args }) {
    const ruleModule = builtinRules.find((r) => r.id === args.id);
    if (!ruleModule) {
      console.error(`Error [RULE_NOT_FOUND]: Rule "${args.id}" not found.`);
      process.exitCode = 1;
      return;
    }

    const { meta } = ruleModule.definition;
    const scope = Array.isArray(meta.scope) ? meta.scope.join('|') : meta.scope;
    console.log(`Rule: ${ruleModule.id}`);
    console.log(`  scope:     ${scope}`);
    console.log(`  threshold: ${meta.threshold}`);
  },
});
