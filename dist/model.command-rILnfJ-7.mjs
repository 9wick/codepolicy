import { defineCommand } from "citty";

//#region src/cli/commands/model.command.ts
var model_command_default = defineCommand({
	meta: {
		name: "model",
		description: "Manage LLM models"
	},
	subCommands: { list: () => import("./model-list.command-BrtNH5Ki.mjs").then((m) => m.default) }
});

//#endregion
export { model_command_default as default };