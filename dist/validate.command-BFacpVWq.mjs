import { ConfigLoader, WorkingDir, getAppContainer } from "./container-BlKlgD7g.mjs";
import "./schema-definitions-D_6JvUJp.mjs";
import { ExternalRuleLoader, loadRuleModules, resolveConfigDir } from "./config-path-CpxVprhA.mjs";
import "./builtin-rules-Dvoe--3J.mjs";
import { RuleResolver } from "./rule-resolver.service-CIeusHQa.mjs";
import { defineCommand } from "citty";

//#region src/cli/commands/validate.command.ts
var validate_command_default = defineCommand({
	meta: {
		name: "validate",
		description: "Validate codepolicy config file"
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
			console.error(`Config error [${configResult.error.code}]: ${configResult.error.message}`);
			process.exitCode = 1;
			return;
		}
		const config = configResult.value;
		console.log("Config: OK");
		const ruleModulesResult = await loadRuleModules(config, externalRuleLoader, resolveConfigDir(workingDir, args.config));
		if (ruleModulesResult.isErr()) {
			console.error(`Resolve error [${ruleModulesResult.error.code}]: ${ruleModulesResult.error.message}`);
			process.exitCode = 1;
			return;
		}
		const resolveResult = ruleResolver.resolve(config, ruleModulesResult.value);
		if (resolveResult.isErr()) {
			console.error(`Resolve error [${resolveResult.error.code}]: ${resolveResult.error.message}`);
			process.exitCode = 1;
			return;
		}
		const resolved = resolveResult.value;
		console.log(`Rules: OK (${ruleModulesResult.value.length} rules loaded)`);
		console.log(`Resolved: OK (${resolved.length} active rules)`);
	}
});

//#endregion
export { validate_command_default as default };