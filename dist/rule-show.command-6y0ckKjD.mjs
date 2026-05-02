import "./schema-definitions-D_6JvUJp.mjs";
import { builtinRules } from "./builtin-rules-Dvoe--3J.mjs";
import { defineCommand } from "citty";

//#region src/cli/commands/rule-show.command.ts
var rule_show_command_default = defineCommand({
	meta: {
		name: "show",
		description: "Show rule details"
	},
	args: { id: {
		type: "positional",
		description: "Rule ID to show",
		required: true
	} },
	run({ args }) {
		const ruleModule = builtinRules.find((r) => r.id === args.id);
		if (!ruleModule) {
			console.error(`Error [RULE_NOT_FOUND]: Rule "${args.id}" not found.`);
			process.exitCode = 1;
			return;
		}
		const { meta } = ruleModule.definition;
		const scope = Array.isArray(meta.scope) ? meta.scope.join("|") : meta.scope;
		console.log(`Rule: ${ruleModule.id}`);
		console.log(`  scope:     ${scope}`);
		console.log(`  threshold: ${meta.threshold}`);
	}
});

//#endregion
export { rule_show_command_default as default };