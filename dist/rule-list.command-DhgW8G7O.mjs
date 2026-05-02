import { ConfigLoader, WorkingDir, getAppContainer } from "./container-BlKlgD7g.mjs";
import "./schema-definitions-D_6JvUJp.mjs";
import { ExternalRuleLoader, loadRuleModules, resolveConfigDir } from "./config-path-CpxVprhA.mjs";
import "./builtin-rules-Dvoe--3J.mjs";
import { RuleResolver } from "./rule-resolver.service-CIeusHQa.mjs";
import { defineCommand } from "citty";

//#region src/cli/commands/rule-list.command.ts
var rule_list_command_default = defineCommand({
	meta: {
		name: "list",
		description: "List active rules"
	},
	args: { config: {
		type: "string",
		alias: "c",
		description: "Path to config file"
	} },
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
		const ruleModulesResult = await loadRuleModules(configResult.value, externalRuleLoader, resolveConfigDir(workingDir, args.config));
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
			console.log("No active rules.");
			return;
		}
		for (const rule of resolved) {
			const scope = Array.isArray(rule.scope) ? rule.scope.join("|") : rule.scope;
			console.log(`  ${rule.id}  [${rule.level}]  scope=${scope}  threshold=${rule.threshold}`);
		}
	}
});

//#endregion
export { rule_list_command_default as default };