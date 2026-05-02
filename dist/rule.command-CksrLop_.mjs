import { defineCommand } from "citty";

//#region src/cli/commands/rule.command.ts
var rule_command_default = defineCommand({
	meta: {
		name: "rule",
		description: "Manage and debug rules"
	},
	subCommands: {
		list: () => import("./rule-list.command-DhgW8G7O.mjs").then((m) => m.default),
		show: () => import("./rule-show.command-6y0ckKjD.mjs").then((m) => m.default),
		run: () => import("./rule-run.command-qFKNaYHv.mjs").then((m) => m.default)
	}
});

//#endregion
export { rule_command_default as default };