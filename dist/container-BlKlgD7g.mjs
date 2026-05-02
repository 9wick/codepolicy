import { codepolicyConfigFileSchema } from "./schema-definitions-D_6JvUJp.mjs";
import { Result, ResultAsync, err, errAsync, ok, okAsync } from "neverthrow";
import { Container, InjectionToken, inject, injectable } from "@needle-di/core";
import fs from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import yaml from "js-yaml";
import { Type } from "@sinclair/typebox";
import _decorate from "@oxc-project/runtime/helpers/decorate";
import { createHash, randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

//#region src/shared/errors.ts
const codepolicyError = (code, message, cause) => ({
	code,
	message,
	cause
});
function formatErrorCauseChain(error) {
	const lines = [`Error [${error.code}]: ${error.message}`];
	let cause = error.cause;
	while (cause instanceof Error) {
		lines.push(`  Caused by: ${cause.message}`);
		cause = cause.cause;
	}
	return lines;
}

//#endregion
//#region src/shared/schema.ts
const ajv$1 = new Ajv({
	allErrors: false,
	strict: false,
	useDefaults: true
});
function compileValidator(schema) {
	return ajv$1.compile(schema);
}
const validateCodepolicyConfig = compileValidator(codepolicyConfigFileSchema);
function isTopLevelObjectTypeError(error) {
	return error.keyword === "type" && error.instancePath === "" && error.params.type === "object";
}
function formatPath(error) {
	if (error.keyword === "required" && typeof error.params.missingProperty === "string") return error.params.missingProperty;
	const instancePath = error.instancePath.replace(/^\//, "").replaceAll("/", ".");
	return instancePath === "" ? "" : instancePath;
}
function formatPathValidationError(error, path$1, objectLabel) {
	if (error.keyword === "anyOf" && path$1.startsWith("rules.")) return `Invalid ${path$1}: must be a level string or { level, threshold? }.`;
	if (path$1 === "") return `${objectLabel} is invalid: ${error.message ?? "validation failed."}`;
	return `Invalid ${path$1}: ${error.message ?? "validation failed."}`;
}
function formatValidationError(error, objectLabel, objectErrorMessage) {
	if (!error) return `${objectLabel} is invalid.`;
	if (isTopLevelObjectTypeError(error)) return objectErrorMessage;
	return formatPathValidationError(error, formatPath(error), objectLabel);
}
function stripSchemaProperty(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
	Reflect.deleteProperty(value, "$schema");
	return value;
}
function parseYamlWithSchema(content, validator, options) {
	const parseResult = Result.fromThrowable(() => yaml.load(content), (cause) => codepolicyError(options.parseErrorCode, options.parseErrorMessage, cause))();
	if (parseResult.isErr()) return err(parseResult.error);
	const parsed = parseResult.value;
	if (!validator(parsed)) return err(codepolicyError(options.parseErrorCode, formatValidationError(validator.errors?.[0], options.objectLabel, options.objectErrorMessage)));
	return ok(stripSchemaProperty(parsed));
}

//#endregion
//#region src/application/config/config-loader.service.ts
const WorkingDir = new InjectionToken("WorkingDir");
let ConfigLoader = class ConfigLoader$1 {
	constructor(workingDir = inject(WorkingDir)) {
		this.workingDir = workingDir;
	}
	load(configPath) {
		const resolvedPath = configPath ?? path.join(this.workingDir, ".codepolicy.yml");
		return ResultAsync.fromPromise(fs.readFile(resolvedPath, "utf-8"), (cause) => codepolicyError("CONFIG_NOT_FOUND", `Config file not found: ${resolvedPath}`, cause)).andThen((content) => parseYamlWithSchema(content, validateCodepolicyConfig, {
			parseErrorCode: "CONFIG_PARSE_ERROR",
			parseErrorMessage: "Failed to parse config YAML.",
			objectErrorMessage: "Config must be a YAML object.",
			objectLabel: "Config"
		}));
	}
};
ConfigLoader = _decorate([injectable()], ConfigLoader);

//#endregion
//#region src/shared/logger.ts
const LOG_LEVEL_PRIORITY = {
	info: 0,
	debug: 1
};
function isLogEnabled(messageLevel, currentLevel) {
	return LOG_LEVEL_PRIORITY[messageLevel] <= LOG_LEVEL_PRIORITY[currentLevel];
}
const LogLevelToken = new InjectionToken("LogLevelToken");
const CreateLogger = new InjectionToken("CreateLogger");
let LogContextStore = class LogContextStore$1 {
	storage = new AsyncLocalStorage();
	run(ctx, fn) {
		return this.storage.run(ctx, fn);
	}
	getContext() {
		return this.storage.getStore();
	}
};
LogContextStore = _decorate([injectable()], LogContextStore);
function compactFormat(record) {
	const parts = ["[codepolicy]", `[${record.service}]`];
	if (record.rule) {
		parts.push(record.rule);
		if (record.scope) parts.push(`> ${record.scope}`);
		parts.push("|");
	}
	parts.push(record.message);
	return parts.join(" ");
}

//#endregion
//#region src/shared/version.ts
const CODEPOLICY_VERSION = "0.0.1";

//#endregion
//#region src/infrastructure/cache/cache-store.ts
function makeCacheKey(raw) {
	return { raw };
}
const CacheStoreToken = new InjectionToken("CacheStore");
const CacheDisabledToken$1 = new InjectionToken("CacheDisabled");

//#endregion
//#region src/application/rule-execution/eval-cache.service.ts
var _EvalCacheService;
const CacheDisabledToken = new InjectionToken("CacheDisabled");
function buildKeyMaterial(input) {
	return [
		`r:${input.ruleId}`,
		`rv:${input.ruleVersion}`,
		`sv:${input.codepolicyVersion}`,
		`m:${input.model}`,
		`re:${input.reasoningEffort ?? ""}`,
		`st:${input.scopeType}`,
		`sn:${input.scopeName}`,
		`fp:${input.filePath}`,
		`fth:${input.fileTreeHash}`,
		`sg:${input.scopeSignature ?? ""}`,
		`sc:${input.scopeCode}`
	].join("\n");
}
let EvalCacheService = _EvalCacheService = class EvalCacheService$1 {
	constructor(store = inject(CacheStoreToken), disabled = inject(CacheDisabledToken), inFlight = new Map()) {
		this.store = store;
		this.disabled = disabled;
		this.inFlight = inFlight;
	}
	static toCacheKey(input) {
		const hash = createHash("sha256").update(buildKeyMaterial(input)).digest("hex");
		return makeCacheKey(hash);
	}
	lookup(input) {
		if (this.disabled) return okAsync({ kind: "miss" });
		const key = _EvalCacheService.toCacheKey(input);
		const existing = this.inFlight.get(key.raw);
		if (existing) return existing;
		const promise = this.store.lookup(key);
		this.inFlight.set(key.raw, promise);
		promise.match(() => {
			this.inFlight.delete(key.raw);
		}, () => {
			this.inFlight.delete(key.raw);
		});
		return promise;
	}
	save(input, score) {
		if (this.disabled) return okAsync(void 0);
		const key = _EvalCacheService.toCacheKey(input);
		const entry = {
			score: score.score,
			reason: score.reason,
			savedAt: new Date().toISOString(),
			codepolicyVersion: CODEPOLICY_VERSION
		};
		return this.store.save(key, entry);
	}
};
EvalCacheService = _EvalCacheService = _decorate([injectable()], EvalCacheService);

//#endregion
//#region src/infrastructure/llm/llm-provider.ts
var LlmResponseParseError = class extends Error {
	constructor(message, parseCause) {
		super(message);
		this.parseCause = parseCause;
		this.name = "LlmResponseParseError";
	}
};
const ajv = new Ajv({
	allErrors: false,
	strict: false
});
function formatSchemaPath(error) {
	if (error.keyword === "required" && typeof error.params.missingProperty === "string") return error.params.missingProperty;
	return error.instancePath.replace(/^\//, "").replaceAll("/", ".");
}
function formatSchemaError(error) {
	if (!error) return "validation failed.";
	const path$1 = formatSchemaPath(error);
	if (path$1 === "") return error.message ?? "validation failed.";
	return `${path$1}: ${error.message ?? "validation failed."}`;
}
function validateBySchema(value, schema) {
	const validator = ajv.compile(schema);
	if (!validator(value)) return err(new LlmResponseParseError(`LLM response does not match return schema: ${formatSchemaError(validator.errors?.[0])}.`));
	return ok(value);
}

//#endregion
//#region src/infrastructure/cache/file-cache-store.ts
const cachedEntrySchema = Type.Object({
	score: Type.Number(),
	reason: Type.String(),
	savedAt: Type.String(),
	codepolicyVersion: Type.String()
}, { additionalProperties: false });
function toFilePath(rootDir, key) {
	return path.join(rootDir, `${key.raw}.json`);
}
function isNotFoundError(cause) {
	if (cause === null || typeof cause !== "object") return false;
	return Reflect.get(cause, "code") === "ENOENT";
}
function readRawFile(filePath) {
	return ResultAsync.fromPromise(fs.readFile(filePath, "utf-8"), (cause) => cause).orElse((cause) => isNotFoundError(cause) ? okAsync(null) : errAsync(codepolicyError("CACHE_READ_ERROR", `Failed to read cache entry at ${filePath}: ${cause instanceof Error ? cause.message : String(cause)}`, cause)));
}
const parseJson = Result.fromThrowable((raw) => JSON.parse(raw), (cause) => cause instanceof Error ? cause : new Error(String(cause)));
function classifyRaw(raw) {
	if (raw === null) return { kind: "miss" };
	const parsed = parseJson(raw);
	if (parsed.isErr()) return {
		kind: "corrupted",
		cause: parsed.error
	};
	const validated = validateBySchema(parsed.value, cachedEntrySchema);
	if (validated.isErr()) return {
		kind: "corrupted",
		cause: validated.error
	};
	const entry = {
		score: validated.value.score,
		reason: validated.value.reason,
		savedAt: validated.value.savedAt,
		codepolicyVersion: validated.value.codepolicyVersion
	};
	return {
		kind: "hit",
		entry
	};
}
function ensureDir(dir) {
	return ResultAsync.fromPromise(fs.mkdir(dir, { recursive: true }), (cause) => codepolicyError("CACHE_WRITE_ERROR", `Failed to create cache directory ${dir}: ${cause instanceof Error ? cause.message : String(cause)}`, cause)).map(() => void 0);
}
function writeAtomic(finalPath, payload, rootDir) {
	const tempPath = path.join(rootDir, `.tmp-${randomBytes(8).toString("hex")}`);
	return ResultAsync.fromPromise(fs.writeFile(tempPath, payload, "utf-8"), (cause) => codepolicyError("CACHE_WRITE_ERROR", `Failed to write temp cache entry at ${tempPath}: ${cause instanceof Error ? cause.message : String(cause)}`, cause)).andThen(() => ResultAsync.fromPromise(fs.rename(tempPath, finalPath), (cause) => codepolicyError("CACHE_WRITE_ERROR", `Failed to rename cache entry to ${finalPath}: ${cause instanceof Error ? cause.message : String(cause)}`, cause)));
}
function createFileCacheStore(rootDir) {
	return {
		lookup(key) {
			return readRawFile(toFilePath(rootDir, key)).map(classifyRaw);
		},
		save(key, entry) {
			const payload = JSON.stringify(entry);
			const finalPath = toFilePath(rootDir, key);
			return ensureDir(rootDir).andThen(() => writeAtomic(finalPath, payload, rootDir));
		}
	};
}

//#endregion
//#region src/shared/lifecycle-manager.ts
let LifecycleManager = class LifecycleManager$1 {
	disposables = [];
	register(disposable) {
		this.disposables.push(disposable);
	}
	async shutdown() {
		for (const disposable of this.disposables) await disposable.shutdown();
		this.disposables = [];
	}
};
LifecycleManager = _decorate([injectable()], LifecycleManager);

//#endregion
//#region src/shared/container.ts
let appContainer = null;
const getAppContainer = () => {
	if (appContainer) return appContainer;
	appContainer = new Container();
	const workingDir = process.cwd();
	appContainer.bind({
		provide: WorkingDir,
		useValue: workingDir
	});
	appContainer.bind({
		provide: CacheStoreToken,
		useValue: createFileCacheStore(path.join(workingDir, ".codepolicy", "cache"))
	});
	appContainer.bind({
		provide: CacheDisabledToken,
		useValue: false
	});
	const logContextStore = new LogContextStore();
	appContainer.bind({
		provide: LogContextStore,
		useValue: logContextStore
	});
	const logLevelRef = { level: "info" };
	appContainer.bind({
		provide: LogLevelToken,
		useValue: logLevelRef
	});
	appContainer.bind({
		provide: CreateLogger,
		useValue: (service) => {
			const emit = (message, level) => {
				if (!isLogEnabled(level, logLevelRef.level)) return;
				const ctx = logContextStore.getContext();
				const record = {
					service,
					message,
					rule: ctx?.rule,
					scope: ctx?.scope
				};
				process.stderr.write(`${compactFormat(record)}\n`);
			};
			return {
				info: (message) => emit(message, "info"),
				warn: (message) => emit(message, "info"),
				debug: (message) => emit(message, "debug")
			};
		}
	});
	return appContainer;
};
const destroyAppContainer = async () => {
	if (appContainer) {
		await appContainer.get(LifecycleManager).shutdown();
		appContainer = null;
	}
};

//#endregion
export { CODEPOLICY_VERSION, ConfigLoader, CreateLogger, EvalCacheService, LifecycleManager, LlmResponseParseError, LogContextStore, LogLevelToken, WorkingDir, codepolicyError, destroyAppContainer, formatErrorCauseChain, getAppContainer, validateBySchema };