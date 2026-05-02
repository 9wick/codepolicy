import { ConfigLoader, LogContextStore, LogLevelToken, WorkingDir, codepolicyError, formatErrorCauseChain, getAppContainer } from "./container-BlKlgD7g.mjs";
import "./schema-definitions-D_6JvUJp.mjs";
import { ExternalRuleLoader, extractOptions, loadRuleModules, resolveConfigDir } from "./config-path-CpxVprhA.mjs";
import "./builtin-rules-Dvoe--3J.mjs";
import { createLlmHelper, parseModelReasoningEffort } from "./model-reasoning-effort-_QI0La-q.mjs";
import "./opencode-server-manager-DVyXCeD1.mjs";
import { defineCommand } from "citty";
import { ResultAsync } from "neverthrow";
import { readFile } from "node:fs/promises";
import path from "node:path";

//#region src/cli/commands/rule-run.command.ts
function extractLevel(ruleConfig) {
	return typeof ruleConfig === "string" ? ruleConfig : ruleConfig.level;
}
function extractThreshold(ruleConfig) {
	return typeof ruleConfig === "object" ? ruleConfig.threshold : void 0;
}
async function unwrap(result) {
	return (await result).match((val) => val, (e) => {
		console.error(`Error [${e.code}]: ${e.message}`);
		process.exitCode = 1;
		return null;
	});
}
function readSourceFile(filePath) {
	return ResultAsync.fromPromise(readFile(filePath, "utf-8"), () => codepolicyError("FILE_READ_ERROR", `Failed to read file: ${filePath}`));
}
function printLlmError(error) {
	const chain = formatErrorCauseChain(codepolicyError("LLM_API_ERROR", error.message, error.cause));
	for (const line of chain) console.error(line);
}
function printError(code, message) {
	console.error(`Error [${code}]: ${message}`);
}
function pickScope(scope) {
	if (Array.isArray(scope)) {
		const first = scope[0];
		if (!first) return "function";
		return first;
	}
	return scope;
}
async function loadRuleModuleForRun(configLoader, externalRuleLoader, workingDir, configPath, ruleId) {
	const config = await unwrap(configLoader.load(configPath));
	if (!config) return null;
	const ruleModules = await unwrap(loadRuleModules(config, externalRuleLoader, resolveConfigDir(workingDir, configPath)));
	if (!ruleModules) return null;
	const ruleModule = ruleModules.find((rule) => rule.id === ruleId);
	if (!ruleModule) {
		printError("RULE_NOT_FOUND", `Rule "${ruleId}" not found.`);
		process.exitCode = 1;
		return null;
	}
	const ruleConfig = config.rules[ruleId];
	if (!ruleConfig) {
		printError("RULE_NOT_FOUND", `Rule "${ruleId}" is not configured.`);
		process.exitCode = 1;
		return null;
	}
	return {
		ruleModule,
		ruleConfig,
		configAgent: config.agent
	};
}
function buildScopeContext(sourceCode, filePath, ruleModule) {
	return {
		source: sourceCode,
		filePath,
		scopeType: pickScope(ruleModule.definition.meta.scope),
		name: path.basename(filePath),
		startLine: 1,
		endLine: sourceCode.split("\n").length
	};
}
function printResult(ruleId, score, threshold, reason) {
	const passed = score >= threshold;
	console.log(`Rule: ${ruleId}`);
	console.log(`Score: ${score} (threshold: ${threshold})`);
	console.log(`Result: ${passed ? "PASS" : "FAIL"}`);
	console.log(`Reason: ${reason}`);
}
async function evaluateRule(a) {
	const sourceCode = await unwrap(readSourceFile(a.filePath));
	if (!sourceCode) return;
	const scopeCtx = buildScopeContext(sourceCode, a.filePath, a.ruleModule);
	const helper = createLlmHelper(scopeCtx, a.agentOverride ?? a.configAgent, process.cwd(), a.reasoningEffort);
	const ctx = {
		...scopeCtx,
		llm: helper
	};
	const initResult = await a.ruleModule.definition.create(a.workingDir, extractOptions(a.ruleConfig));
	if (initResult.isErr()) {
		printLlmError(initResult.error);
		process.exitCode = 1;
		return;
	}
	const result = await a.logContextStore.run({
		rule: a.ruleModule.id,
		scope: path.basename(a.filePath)
	}, () => initResult.value(ctx));
	if (result.isErr()) {
		printLlmError(result.error);
		process.exitCode = 1;
		return;
	}
	const threshold = extractThreshold(a.ruleConfig) ?? a.ruleModule.definition.meta.threshold;
	printResult(a.ruleModule.id, result.value.score, threshold, result.value.reason);
}
var rule_run_command_default = defineCommand({
	meta: {
		name: "run",
		description: "Run a specific rule against a file"
	},
	args: {
		id: {
			type: "positional",
			description: "Rule ID to run",
			required: true
		},
		file: {
			type: "positional",
			description: "File path to check",
			required: true
		},
		config: {
			type: "string",
			alias: "c",
			description: "Path to config file"
		},
		verbose: {
			type: "boolean",
			description: "Show verbose output",
			default: false
		},
		agent: {
			type: "string",
			description: "Override model"
		},
		"reasoning-effort": {
			type: "string",
			description: "Reasoning effort for Codex models (minimal|low|medium|high|xhigh)"
		}
	},
	async run({ args }) {
		const container = getAppContainer();
		container.get(LogLevelToken).level = args.verbose ? "debug" : "info";
		const workingDir = container.get(WorkingDir);
		const loaded = await loadRuleModuleForRun(container.get(ConfigLoader), container.get(ExternalRuleLoader), workingDir, args.config, args.id);
		if (!loaded) return;
		const level = extractLevel(loaded.ruleConfig);
		if (level === "off") {
			console.log(`Rule "${args.id}" is disabled (level: off).`);
			return;
		}
		const reasoningEffortResult = parseModelReasoningEffort(args["reasoning-effort"]);
		if (reasoningEffortResult.isErr()) {
			printError("INVALID_ARGUMENT", reasoningEffortResult.error.message);
			process.exitCode = 1;
			return;
		}
		await evaluateRule({
			ruleModule: loaded.ruleModule,
			ruleConfig: loaded.ruleConfig,
			filePath: args.file,
			agentOverride: args.agent,
			configAgent: loaded.configAgent,
			reasoningEffort: reasoningEffortResult.value,
			workingDir,
			logContextStore: container.get(LogContextStore)
		});
	}
});

//#endregion
export { rule_run_command_default as default };