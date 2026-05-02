import { CreateLogger, LlmResponseParseError, getAppContainer, validateBySchema } from "./container-BlKlgD7g.mjs";
import { OpenCodeServerManager } from "./opencode-server-manager-DVyXCeD1.mjs";
import { ResultAsync, err, errAsync, fromThrowable, ok } from "neverthrow";
import { inject, injectable } from "@needle-di/core";
import { TypeGuard } from "@sinclair/typebox";
import _decorate from "@oxc-project/runtime/helpers/decorate";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { Codex } from "@openai/codex-sdk";

//#region src/infrastructure/llm/anthropic-adapter.lib.ts
const DEFAULT_MAX_TURNS = 1;
const HAIKU_MAX_TURNS = 4;
const DEFAULT_OPTIONS = {
	permissionMode: "default",
	allowedTools: [],
	disallowedTools: ["ToolSearch"]
};

//#endregion
//#region src/infrastructure/llm/anthropic.adapter.ts
function extractStructuredOutputFromToolUse(message) {
	if (message.type !== "assistant") return void 0;
	for (const block of message.message.content) if (block.type === "tool_use" && block.name === "StructuredOutput") return block.input;
	return void 0;
}
function sumModelUsage(modelUsage) {
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheReadInputTokens = 0;
	let cacheCreationInputTokens = 0;
	for (const mu of Object.values(modelUsage)) {
		inputTokens += mu.inputTokens + mu.cacheReadInputTokens + mu.cacheCreationInputTokens;
		outputTokens += mu.outputTokens;
		cacheReadInputTokens += mu.cacheReadInputTokens;
		cacheCreationInputTokens += mu.cacheCreationInputTokens;
	}
	return {
		inputTokens,
		outputTokens,
		reasoningTokens: 0,
		cacheReadInputTokens,
		cacheCreationInputTokens
	};
}
function extractUsageFromResult(lastResultMessage) {
	if (lastResultMessage?.type === "result") return sumModelUsage(lastResultMessage.modelUsage);
	return {
		inputTokens: 0,
		outputTokens: 0,
		reasoningTokens: 0,
		cacheReadInputTokens: 0,
		cacheCreationInputTokens: 0
	};
}
function logSdkMessage(message, log) {
	if (message.type === "assistant") {
		log.debug("assistant");
		for (const block of message.message.content) {
			if (block.type === "text") log.debug(`  text: ${block.text}`);
			if (block.type === "tool_use") log.debug(`  tool_use ${block.name}: ${JSON.stringify(block.input)}`);
		}
	} else if (message.type === "result") {
		log.debug(`result (${message.subtype})`);
		log.debug(`  turns: ${message.num_turns}, duration: ${message.duration_ms}ms`);
		log.debug(`  modelUsage: ${JSON.stringify(message.modelUsage)}`);
	} else log.debug(message.type);
}
function extractFromSuccessResult(message) {
	if (message.type !== "result") return void 0;
	if (message.subtype === "success" && message.structured_output !== void 0) return {
		output: message.structured_output,
		usage: sumModelUsage(message.modelUsage)
	};
	return void 0;
}
async function collectQueryResult(messages, log) {
	let structuredOutputFromToolUse;
	let lastResultMessage;
	for await (const message of messages) {
		logSdkMessage(message, log);
		if (message.type === "result") lastResultMessage = message;
		const directResult = extractFromSuccessResult(message);
		if (directResult) return ok(directResult);
		const toolUseOutput = extractStructuredOutputFromToolUse(message);
		if (toolUseOutput !== void 0) structuredOutputFromToolUse = toolUseOutput;
	}
	if (structuredOutputFromToolUse !== void 0) return ok({
		output: structuredOutputFromToolUse,
		usage: extractUsageFromResult(lastResultMessage)
	});
	return err(new Error("Claude Agent SDK did not return a successful result message"));
}
function extractQueryResult(messages, log) {
	return new ResultAsync(collectQueryResult(messages, log).catch((cause) => err(cause instanceof Error ? cause : new Error(String(cause)))));
}
function isHaikuModel(model) {
	return model.includes("haiku");
}
function toAnthropicOptions(prompt, config, returnSchema, cwd) {
	return {
		...DEFAULT_OPTIONS,
		maxTurns: isHaikuModel(config.model) ? HAIKU_MAX_TURNS : DEFAULT_MAX_TURNS,
		cwd,
		model: config.model,
		systemPrompt: prompt.system,
		outputFormat: {
			type: "json_schema",
			schema: returnSchema
		}
	};
}
let AnthropicProvider = class AnthropicProvider$1 {
	constructor(workingDir, log) {
		this.workingDir = workingDir;
		this.log = log;
	}
	generate({ prompt, config, returnSchema }) {
		return extractQueryResult(query({
			prompt: prompt.user,
			options: toAnthropicOptions(prompt, config, returnSchema, this.workingDir)
		}), this.log).andThen(({ output, usage }) => validateBySchema(output, returnSchema).map((validated) => ({
			output: validated,
			usage
		})));
	}
};
AnthropicProvider = _decorate([injectable()], AnthropicProvider);

//#endregion
//#region src/infrastructure/llm/codex-adapter.lib.ts
const safeJsonParse$1 = fromThrowable((text) => JSON.parse(text), (cause) => new LlmResponseParseError("Failed to parse Codex response as JSON", cause));

//#endregion
//#region src/infrastructure/llm/codex.adapter.ts
function extractCodexUsage(turnUsage) {
	return {
		inputTokens: turnUsage?.input_tokens ?? 0,
		outputTokens: turnUsage?.output_tokens ?? 0,
		reasoningTokens: 0,
		cacheReadInputTokens: 0,
		cacheCreationInputTokens: 0
	};
}
function logCodexResult(response, usage, log) {
	log.debug(`response: ${response.slice(0, 500)}`);
	log.debug(`usage: in=${usage.inputTokens} out=${usage.outputTokens}`);
}
function buildCodexThreadOptions(config) {
	const options = {
		model: config.model,
		sandboxMode: "read-only",
		approvalPolicy: "never",
		skipGitRepoCheck: true
	};
	if (config.reasoningEffort !== void 0) options.modelReasoningEffort = config.reasoningEffort;
	return options;
}
let CodexProvider = class CodexProvider$1 {
	constructor(log) {
		this.log = log;
	}
	generate({ prompt, config, returnSchema }) {
		const codex = new Codex();
		const thread = codex.startThread(buildCodexThreadOptions(config));
		const fullPrompt = `${prompt.system}\n\n${prompt.user}`;
		return ResultAsync.fromPromise(thread.run(fullPrompt, { outputSchema: returnSchema }), (cause) => new Error(`Codex API request failed: ${cause instanceof Error ? cause.message : String(cause)}`)).map((turn) => {
			const usage = extractCodexUsage(turn.usage);
			logCodexResult(turn.finalResponse, usage, this.log);
			return {
				response: turn.finalResponse,
				usage
			};
		}).andThen(({ response, usage }) => safeJsonParse$1(response).map((parsed) => ({
			parsed,
			usage
		}))).andThen(({ parsed, usage }) => validateBySchema(parsed, returnSchema).map((output) => ({
			output,
			usage
		})));
	}
};
CodexProvider = _decorate([injectable()], CodexProvider);

//#endregion
//#region src/infrastructure/llm/opencode-adapter.lib.ts
const safeJsonParse = fromThrowable((text) => JSON.parse(text), (cause) => new LlmResponseParseError("Failed to parse OpenCode response as JSON", cause));

//#endregion
//#region src/infrastructure/llm/opencode-model-validator.lib.ts
function validateModelExists(client, model) {
	return ResultAsync.fromPromise(client.provider.list(), (cause) => new Error(`OpenCode API request failed: ${cause instanceof Error ? cause.message : String(cause)}`)).andThen((res) => {
		if (!res.data) return err(new Error("Failed to fetch OpenCode provider list"));
		const provider = res.data.all.find((p) => p.id === model.providerID);
		if (!provider) {
			const available = res.data.all.map((p) => p.id).join(", ");
			return err(new Error(`OpenCode provider "${model.providerID}" not found. Available: ${available}`));
		}
		if (provider.models[model.modelID] === void 0) {
			const available = Object.keys(provider.models).slice(0, 10).join(", ");
			return err(new Error(`Model "${model.modelID}" not found in provider "${model.providerID}". Available: ${available}`));
		}
		return ok(void 0);
	});
}
const validatedModelsByClient = new WeakMap();
function validateModelExistsMemoized(client, model) {
	const key = `${model.providerID}/${model.modelID}`;
	const existingMap = validatedModelsByClient.get(client);
	const cache = existingMap ?? new Map();
	if (!existingMap) validatedModelsByClient.set(client, cache);
	const cached = cache.get(key);
	if (cached) return cached;
	const validation = validateModelExists(client, model);
	cache.set(key, validation);
	return validation;
}

//#endregion
//#region src/infrastructure/llm/opencode.adapter.ts
function parseModel(model) {
	const slashIndex = model.indexOf("/");
	if (slashIndex === -1) return err(new Error(`Invalid OpenCode model format: "${model}". Expected "provider/model" (e.g. "anthropic/claude-sonnet-4-5").`));
	return ok({
		providerID: model.slice(0, slashIndex),
		modelID: model.slice(slashIndex + 1)
	});
}
function extractUsageFromParts(parts) {
	let inputTokens = 0;
	let outputTokens = 0;
	let reasoningTokens = 0;
	let cacheReadInputTokens = 0;
	let cacheCreationInputTokens = 0;
	for (const part of parts) if (part.type === "step-finish") {
		inputTokens += part.tokens.input;
		outputTokens += part.tokens.output;
		reasoningTokens += part.tokens.reasoning;
		cacheReadInputTokens += part.tokens.cache.read;
		cacheCreationInputTokens += part.tokens.cache.write;
	}
	return {
		inputTokens,
		outputTokens,
		reasoningTokens,
		cacheReadInputTokens,
		cacheCreationInputTokens
	};
}
function extractStructuredOutput(parts) {
	for (const part of parts) if (part.type === "tool" && part.tool === "StructuredOutput" && part.state.status === "completed") return ok(part.state.input);
	const text = parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("");
	if (!text) return err(new Error("OpenCode response contained no text or structured output"));
	return safeJsonParse(text).mapErr((e) => new Error(`${e.message} (text: ${text.slice(0, 200)})`));
}
function createSession(client) {
	return ResultAsync.fromPromise(client.session.create(), (cause) => new Error(`OpenCode API request failed: ${cause instanceof Error ? cause.message : String(cause)}`)).andThen((res) => res.data ? ok(res.data.id) : err(new Error("Failed to create OpenCode session")));
}
function formatStepFinish(part) {
	const { tokens } = part;
	const extras = [];
	if (tokens.reasoning > 0) extras.push(`reasoning=${tokens.reasoning}`);
	if (tokens.cache.read > 0 || tokens.cache.write > 0) extras.push(`cache read=${tokens.cache.read} write=${tokens.cache.write}`);
	const suffix = extras.length > 0 ? ` | ${extras.join(" | ")}` : "";
	return `step-finish: tokens in=${tokens.input} out=${tokens.output}${suffix}`;
}
function logOpenCodePart(part, log) {
	if (part.type === "text") log.debug(`text: ${part.text}`);
	else if (part.type === "tool") log.debug(`tool ${part.tool} (${part.state.status}): ${JSON.stringify(part.state.input)}`);
	else if (part.type === "step-finish") log.debug(formatStepFinish(part));
	else log.debug(part.type);
}
function logOpenCodeParts(parts, log) {
	log.debug(`response (${parts.length} parts)`);
	for (const part of parts) logOpenCodePart(part, log);
}
function sendPrompt(client, sessionID, prompt, model, returnSchema, log) {
	return ResultAsync.fromPromise(client.session.prompt({
		sessionID,
		model,
		agent: "codepolicy",
		system: prompt.system,
		tools: {},
		parts: [{
			type: "text",
			text: prompt.user
		}],
		format: {
			type: "json_schema",
			schema: returnSchema
		}
	}), (cause) => new Error(`OpenCode API request failed: ${cause instanceof Error ? cause.message : String(cause)}`)).andThen((res) => {
		if (!res.data?.parts) return err(new Error(`OpenCode prompt returned no response (data keys: ${res.data ? Object.keys(res.data).join(", ") : "none"})`));
		logOpenCodeParts(res.data.parts, log);
		const usage = extractUsageFromParts(res.data.parts);
		return extractStructuredOutput(res.data.parts).map((output) => ({
			output,
			usage
		}));
	});
}
let OpenCodeProvider = class OpenCodeProvider$1 {
	constructor(serverManager = inject(OpenCodeServerManager), log = inject(CreateLogger)("OpenCodeProvider")) {
		this.serverManager = serverManager;
		this.log = log;
	}
	generate({ prompt, config, returnSchema }) {
		const modelResult = parseModel(config.model);
		if (modelResult.isErr()) return errAsync(modelResult.error);
		const model = modelResult.value;
		return this.serverManager.acquire().map(({ client }) => client).andThen((client) => validateModelExistsMemoized(client, model).map(() => client)).andThen((client) => createSession(client).map((sessionID) => ({
			client,
			sessionID
		}))).andThen(({ client, sessionID }) => sendPrompt(client, sessionID, prompt, model, returnSchema, this.log)).andThen(({ output, usage }) => validateBySchema(output, returnSchema).map((validated) => ({
			output: validated,
			usage
		}))).map((result) => {
			this.serverManager.release();
			return result;
		}).mapErr((error) => {
			this.serverManager.release();
			return error;
		});
	}
};
OpenCodeProvider = _decorate([injectable()], OpenCodeProvider);

//#endregion
//#region src/infrastructure/llm/resolve-provider.ts
const ANTHROPIC_PREFIXES = ["claude-"];
const OPENAI_PREFIXES = [
	"gpt-",
	"o1-",
	"o3-",
	"codex-"
];
function resolveProvider(model, workingDir) {
	const container = getAppContainer();
	const createLogger = container.get(CreateLogger);
	if (model.includes("/")) return ok(container.get(OpenCodeProvider));
	if (ANTHROPIC_PREFIXES.some((p) => model.startsWith(p))) return ok(new AnthropicProvider(workingDir, createLogger("AnthropicProvider")));
	if (OPENAI_PREFIXES.some((p) => model.startsWith(p))) return ok(new CodexProvider(createLogger("CodexProvider")));
	return err(new Error(`Unsupported model: "${model}". Use "provider/model" format for OpenCode (e.g. "anthropic/claude-sonnet-4-5"), or a supported prefix: ${[...ANTHROPIC_PREFIXES, ...OPENAI_PREFIXES].join(", ")}`));
}

//#endregion
//#region src/application/rule-execution/create-llm-helper.ts
const SYSTEM_PROMPT = `あなたはコードレビュアーです。与えられたコードを指定された観点でチェックし、JSON形式で結果を出力してください。

必達条件:
- 1ターンで完了すること。分析や説明のテキストを出力せず、即座にStructuredOutputツールを呼び出して結果を返すこと。
- ファイル読み取りなどのツール呼び出しは一切行わないこと。判断に必要な情報はすべてプロンプト内に含まれている。
- 出力は必ず与えられたJSONスキーマと、ユーザープロンプト内の「出力形式」に従うこと。`;
function formatFieldRule(fieldName, fieldSchema, required) {
	const labels = [required ? "必須" : "任意"];
	if (typeof fieldSchema.type === "string") labels.push(`type: ${fieldSchema.type}`);
	if (typeof fieldSchema.description === "string") return `- ${fieldName} (${labels.join(", ")}): ${fieldSchema.description}`;
	return `- ${fieldName} (${labels.join(", ")})`;
}
function extractRequiredFieldNames(schema) {
	const requiredSet = new Set();
	if (Array.isArray(schema.required)) {
		for (const item of schema.required) if (typeof item === "string") requiredSet.add(item);
	}
	return requiredSet;
}
function buildOutputFormatSection(schema) {
	if (schema.type !== "object") return null;
	const properties = schema.properties;
	if (!TypeGuard.IsProperties(properties)) return null;
	const lines = ["## 出力形式"];
	if (typeof schema.description === "string") lines.push(schema.description);
	const requiredSet = extractRequiredFieldNames(schema);
	for (const [fieldName, fieldSchema] of Object.entries(properties)) lines.push(formatFieldRule(fieldName, fieldSchema, requiredSet.has(fieldName)));
	if (schema.additionalProperties === false) lines.push("- 追加プロパティは出力しない。");
	return lines.join("\n");
}
function codeBlockSection(enabled, content, heading, language) {
	if (enabled !== true || !content) return null;
	return `\n## ${heading}\n\n\`\`\`${language}\n${content}\n\`\`\``;
}
function buildIncludedContextSections(ctx, include) {
	const sections = [
		include.filePath === true ? `ファイル: ${ctx.filePath}` : null,
		include.scopeType === true ? `スコープ: ${ctx.scopeType}` : null,
		include.name === true ? `名前: ${ctx.name}` : null,
		codeBlockSection(include.signature, ctx.signature, "関数シグネチャ", "typescript"),
		codeBlockSection(include.fileTree, ctx.fileTree, "ファイルツリー", ""),
		codeBlockSection(include.source, ctx.source, "対象コード", "typescript")
	];
	const result = [];
	for (const section of sections) if (section !== null) result.push(section);
	return result;
}
function toArrayIfPresent(value) {
	return value ? [value] : [];
}
function buildUserPrompt(ctx, options) {
	const include = options.include ?? {};
	const parts = [
		`## チェック観点\n${options.prompt}`,
		...toArrayIfPresent(buildOutputFormatSection(options.responseFormat)),
		...buildIncludedContextSections(ctx, include)
	];
	return parts.join("\n");
}
function wrapLlmError(cause) {
	const wrapped = new Error(`LLM API request failed: ${cause.message}`);
	wrapped.cause = cause;
	return wrapped;
}
function createLlmHelper(ctx, model, workingDir, reasoningEffort) {
	const accumulatedUsage = {
		inputTokens: 0,
		outputTokens: 0,
		reasoningTokens: 0,
		cacheReadInputTokens: 0,
		cacheCreationInputTokens: 0
	};
	return {
		evaluate: (options) => {
			const providerResult = resolveProvider(model, workingDir);
			if (providerResult.isErr()) return errAsync(providerResult.error);
			const prompt = {
				system: SYSTEM_PROMPT,
				user: buildUserPrompt(ctx, options)
			};
			return providerResult.value.generate({
				prompt,
				config: {
					model,
					reasoningEffort
				},
				returnSchema: options.responseFormat
			}).map(({ output, usage }) => {
				accumulatedUsage.inputTokens += usage.inputTokens;
				accumulatedUsage.outputTokens += usage.outputTokens;
				accumulatedUsage.reasoningTokens += usage.reasoningTokens;
				accumulatedUsage.cacheReadInputTokens += usage.cacheReadInputTokens;
				accumulatedUsage.cacheCreationInputTokens += usage.cacheCreationInputTokens;
				return output;
			}).mapErr(wrapLlmError);
		},
		getUsage: () => ({ ...accumulatedUsage })
	};
}

//#endregion
//#region src/infrastructure/llm/model-reasoning-effort.ts
function parseModelReasoningEffort(effort) {
	if (effort === void 0) return ok(void 0);
	if (effort === "minimal" || effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh") return ok(effort);
	return err(new Error(`Unsupported reasoning effort: "${effort}". Supported values: minimal, low, medium, high, xhigh`));
}

//#endregion
export { createLlmHelper, parseModelReasoningEffort };