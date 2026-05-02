import { defineCommand } from 'citty';

import { getAppContainer } from '../../shared/container';
import { ConfigLoader } from '../../application/config/config-loader.service';
import { WorkingDir } from '../../application/config/config-loader.service';
import { resolveConfigDir } from '../../application/config/config-path';
import { ExternalRuleLoader } from '../../rules/external-rule-loader.service';
import { loadRuleModules } from '../../rules/load-rule-modules';
import { RuleResolver } from '../../rules/rule-resolver.service';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List active rules',
  },
  args: {
    config: {
      type: 'string',
      alias: 'c',
      description: 'Path to config file',
    },
  },
  async run({ args }) {
    const container = getAppContainer();
    const configLoader = container.get(ConfigLoader);
    const ruleResolver = container.get(RuleResolver);
    const externalRuleLoader = container.get(ExternalRuleLoader);
    const workingDir = container.get(WorkingDir);

    const configResult = await configLoader.load(args.config);
    if (configResult.isErr()) {
      console.error(`Error [${configResult.error.code}]: ${configResult.error.message}`);
      process.exitCode = 1;
      return;
    }

    const ruleModulesResult = await loadRuleModules(
      configResult.value,
      externalRuleLoader,
      resolveConfigDir(workingDir, args.config),
    );
    if (ruleModulesResult.isErr()) {
      console.error(`Error [${ruleModulesResult.error.code}]: ${ruleModulesResult.error.message}`);
      process.exitCode = 1;
      return;
    }

    const resolveResult = ruleResolver.resolve(configResult.value, ruleModulesResult.value);
    if (resolveResult.isErr()) {
      console.error(`Error [${resolveResult.error.code}]: ${resolveResult.error.message}`);
      process.exitCode = 1;
      return;
    }

    const resolved = resolveResult.value;
    if (resolved.length === 0) {
      console.log('No active rules.');
      return;
    }

    for (const rule of resolved) {
      const scope = Array.isArray(rule.scope) ? rule.scope.join('|') : rule.scope;
      console.log(`  ${rule.id}  [${rule.level}]  scope=${scope}  threshold=${rule.threshold}`);
    }
  },
});
