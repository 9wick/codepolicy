import { getAppContainer } from "./container-BlKlgD7g.mjs";
import "./schema-definitions-D_6JvUJp.mjs";
import { OpenCodeServerManager } from "./opencode-server-manager-DVyXCeD1.mjs";
import { defineCommand } from "citty";
import { Result, ResultAsync, err, ok } from "neverthrow";
import { inject, injectable } from "@needle-di/core";
import Ajv from "ajv";
import _decorate from "@oxc-project/runtime/helpers/decorate";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

//#region src/infrastructure/llm/anthropic-model-lister.ts
const SCRIPT = `
import { query } from '@anthropic-ai/claude-agent-sdk';
const q = query({
  prompt: '',
  options: { model: 'sonnet', permissionMode: 'bypassPermissions', maxTurns: 0 },
});
for await (const msg of q) {
  if (msg.type === 'system') {
    const models = await q.supportedModels();
    process.stdout.write(JSON.stringify(models));
    q.close();
    break;
  }
  if (msg.type === 'result') { q.close(); break; }
}
process.exit(0);
`;
const TIMEOUT_MS = 15e3;
function spawnAndCollect(parentEnv) {
	return new Promise((resolve) => {
		const env = { ...parentEnv };
		delete env["CLAUDECODE"];
		const child = spawn("bun", ["-e", SCRIPT], {
			env,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		});
		let stdout = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		const timer = setTimeout(() => {
			child.kill();
			resolve(err(new Error("Timeout waiting for Claude Code model list")));
		}, TIMEOUT_MS);
		child.on("close", () => {
			clearTimeout(timer);
			if (stdout.length > 0) resolve(ok(stdout));
			else resolve(err(new Error("Claude Code returned no model data")));
		});
		child.on("error", (e) => {
			clearTimeout(timer);
			resolve(err(new Error(`Failed to list Anthropic models: ${e.message}`)));
		});
	});
}
const safeJsonParse$1 = Result.fromThrowable((text) => JSON.parse(text), () => new Error("Failed to parse model list JSON"));
function parseModels(raw) {
	return safeJsonParse$1(raw).andThen((parsed) => {
		if (!Array.isArray(parsed)) return err(new Error("Expected array"));
		return ok(parsed.map((m) => ({
			id: typeof m["value"] === "string" ? m["value"] : "",
			displayName: typeof m["displayName"] === "string" ? m["displayName"] : "",
			description: typeof m["description"] === "string" ? m["description"] : ""
		})));
	});
}
function listAnthropicModels(env) {
	return new ResultAsync(spawnAndCollect(env)).andThen(parseModels);
}

//#endregion
//#region src/infrastructure/llm/codex-model-lister.ts
const ajv = new Ajv({ strict: false });
const validateJsonRpc = ajv.compile({
	type: "object",
	required: ["id"],
	properties: { id: { type: "number" } }
});
const safeJsonParse = Result.fromThrowable((line) => JSON.parse(line), () => new Error("Invalid JSON"));
function parseJsonRpc(line) {
	return safeJsonParse(line).andThen((value) => validateJsonRpc(value) ? ok(value) : err(new Error("Invalid JSON-RPC response")));
}
function sendJsonRpc(stdin, id, method, params) {
	stdin.write(`${JSON.stringify({
		jsonrpc: "2.0",
		id,
		method,
		params
	})}\n`);
}
function runCodexAppServer() {
	return new Promise((resolve) => {
		const proc = spawn("codex", ["app-server"], { stdio: [
			"pipe",
			"pipe",
			"ignore"
		] });
		const timer = setTimeout(() => {
			proc.kill();
			resolve(err(new Error("codex app-server timed out")));
		}, 15e3);
		const rl = createInterface({ input: proc.stdout });
		let phase = "init";
		rl.on("line", (line) => {
			const parsed = parseJsonRpc(line);
			if (parsed.isErr()) return;
			const msg = parsed.value;
			if (msg.error) {
				clearTimeout(timer);
				proc.kill();
				resolve(err(new Error(`codex app-server error: ${msg.error.message}`)));
				return;
			}
			if (phase === "init") {
				phase = "list";
				sendJsonRpc(proc.stdin, 2, "model/list", {
					limit: 100,
					cursor: null,
					include_hidden: false
				});
				return;
			}
			clearTimeout(timer);
			proc.kill();
			const models = (msg.result?.data ?? []).map((m) => ({
				id: m.id,
				displayName: m.displayName,
				description: m.description
			}));
			resolve(ok(models));
		});
		proc.on("error", (e) => {
			clearTimeout(timer);
			resolve(err(new Error(`Failed to spawn codex: ${e.message}`)));
		});
		sendJsonRpc(proc.stdin, 1, "initialize", { clientInfo: {
			name: "codepolicy",
			version: "0.0.1"
		} });
	});
}
function listCodexModels() {
	return new ResultAsync(runCodexAppServer());
}

//#endregion
//#region src/infrastructure/llm/opencode-model-lister.ts
function extractModels(res) {
	if (!res.data) return err(new Error("OpenCode provider.list returned no data"));
	const connectedSet = new Set(res.data.connected);
	const models = res.data.all.filter((provider) => connectedSet.has(provider.id)).flatMap((provider) => Object.values(provider.models).map((model) => ({
		id: `${provider.id}/${model.id}`,
		providerID: provider.id,
		modelID: model.id,
		displayName: model.name
	})));
	return ok(models);
}
let OpenCodeModelLister = class OpenCodeModelLister$1 {
	serverManager = inject(OpenCodeServerManager);
	listModels() {
		return this.serverManager.acquire().map(({ client }) => client).andThen((client) => ResultAsync.fromPromise(client.provider.list(), (e) => new Error(`OpenCode provider.list failed: ${e instanceof Error ? e.message : String(e)}`))).andThen(extractModels).map((models) => {
			this.serverManager.release();
			return models;
		}).mapErr((error) => {
			this.serverManager.release();
			return error;
		});
	}
};
OpenCodeModelLister = _decorate([injectable()], OpenCodeModelLister);

//#endregion
//#region src/cli/commands/model-list.command.ts
function printTable(rows) {
	if (rows.length === 0) return;
	const pW = Math.max(8, ...rows.map((r) => r.provider.length));
	const iW = Math.max(5, ...rows.map((r) => r.id.length));
	const header = `${"PROVIDER".padEnd(pW)}  ${"MODEL".padEnd(iW)}  DESCRIPTION`;
	console.log(header);
	console.log("-".repeat(header.length));
	for (const r of rows) console.log(`${r.provider.padEnd(pW)}  ${r.id.padEnd(iW)}  ${r.description}`);
}
var model_list_command_default = defineCommand({
	meta: {
		name: "list",
		description: "List available LLM models"
	},
	args: { provider: {
		type: "string",
		description: "Filter by provider (anthropic, codex, or opencode)"
	} },
	async run({ args }) {
		const providers = args.provider ? [args.provider] : [
			"codex",
			"anthropic",
			"opencode"
		];
		const rows = [];
		for (const provider of providers) if (provider === "codex") {
			const result = await listCodexModels();
			result.match((models) => {
				for (const m of models) rows.push({
					provider: "codex",
					id: m.id,
					description: m.description
				});
			}, (e) => console.error(`[codex] Error: ${e.message}`));
		} else if (provider === "anthropic") {
			const result = await listAnthropicModels(process.env);
			result.match((models) => {
				for (const m of models) rows.push({
					provider: "anthropic",
					id: m.id,
					description: m.description
				});
			}, (e) => console.error(`[anthropic] Error: ${e.message}`));
		} else if (provider === "opencode") {
			const result = await getAppContainer().get(OpenCodeModelLister).listModels();
			result.match((models) => {
				for (const m of models) rows.push({
					provider: "opencode",
					id: m.id,
					description: m.displayName
				});
			}, (e) => console.error(`[opencode] Error: ${e.message}`));
		} else console.error(`Unknown provider: ${provider}`);
		printTable(rows);
	}
});

//#endregion
export { model_list_command_default as default };