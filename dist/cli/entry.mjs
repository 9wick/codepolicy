import { CODEPOLICY_VERSION, ConfigLoader, CreateLogger, EvalCacheService, LogContextStore, LogLevelToken, WorkingDir, codepolicyError, destroyAppContainer, formatErrorCauseChain, getAppContainer } from "../container-BlKlgD7g.mjs";
import "../schema-definitions-D_6JvUJp.mjs";
import { ExternalRuleLoader, extractLevel, extractOptions, extractThreshold, loadRuleModules, resolveConfigDir } from "../config-path-CpxVprhA.mjs";
import { extractSignature, getNameFromDeclaration, shouldSkipEntry } from "../builtin-rules-Dvoe--3J.mjs";
import { RuleResolver } from "../rule-resolver.service-CIeusHQa.mjs";
import { createLlmHelper, parseModelReasoningEffort } from "../model-reasoning-effort-_QI0La-q.mjs";
import "../opencode-server-manager-DVyXCeD1.mjs";
import { defineCommand, runMain } from "citty";
import { Result, ResultAsync, errAsync, ok, okAsync } from "neverthrow";
import { inject, injectable } from "@needle-di/core";
import pLimit from "p-limit";
import fs, { readFile } from "node:fs/promises";
import path from "node:path";
import _decorate from "@oxc-project/runtime/helpers/decorate";
import simpleGit from "simple-git";
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

//#region src/infrastructure/git/diff-parser.lib.ts
const DIFF_HEADER_REGEX = /^diff --git a\/.+ b\/(.+)$/;
const HUNK_HEADER_REGEX = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const BINARY_FILE_REGEX = /^Binary files /;
const DELETED_FILE_REGEX = /^\+\+\+ \/dev\/null$/;
const TS_EXTENSION_REGEX = /\.tsx?$/;
function splitIntoFileSections(rawDiff) {
	const sections = [];
	const lines = rawDiff.split("\n");
	let current = [];
	for (const line of lines) {
		if (DIFF_HEADER_REGEX.test(line) && current.length > 0) {
			sections.push(current.join("\n"));
			current = [];
		}
		current.push(line);
	}
	if (current.length > 0) sections.push(current.join("\n"));
	return sections;
}
function extractFilePath(headerLine) {
	const match = headerLine?.match(DIFF_HEADER_REGEX);
	if (match?.[1] === void 0) return null;
	return match[1];
}
function parseFileSection(section) {
	const lines = section.split("\n");
	const filePath = extractFilePath(lines[0]);
	if (filePath === null) return null;
	if (!TS_EXTENSION_REGEX.test(filePath)) return null;
	if (lines.some((line) => BINARY_FILE_REGEX.test(line))) return null;
	if (lines.some((line) => DELETED_FILE_REGEX.test(line))) return null;
	const lineRanges = parseHunks(lines);
	if (lineRanges.length === 0) return null;
	return {
		filePath,
		lineRanges
	};
}
function flushRange(state) {
	if (state.rangeStart !== null) {
		state.ranges.push({
			start: state.rangeStart,
			end: state.currentLine - 1
		});
		state.rangeStart = null;
	}
}
function processHunkHeader(state, match) {
	flushRange(state);
	const lineStr = match[1];
	if (lineStr === void 0) return;
	state.currentLine = Number.parseInt(lineStr, 10);
	state.inHunk = true;
}
function processHunkLine(state, line) {
	if (line.startsWith("+")) {
		if (state.rangeStart === null) state.rangeStart = state.currentLine;
		state.currentLine++;
	} else if (line.startsWith("-")) flushRange(state);
	else {
		flushRange(state);
		state.currentLine++;
	}
}
function parseHunks(lines) {
	const state = {
		ranges: [],
		currentLine: 0,
		inHunk: false,
		rangeStart: null
	};
	for (const line of lines) {
		const hunkMatch = line.match(HUNK_HEADER_REGEX);
		if (hunkMatch) processHunkHeader(state, hunkMatch);
		else if (state.inHunk) processHunkLine(state, line);
	}
	flushRange(state);
	return state.ranges;
}

//#endregion
//#region src/infrastructure/git/diff.parser.ts
let DiffParser = class DiffParser$1 {
	parse(rawDiff) {
		if (rawDiff.trim() === "") return ok([]);
		return Result.fromThrowable(() => {
			const files = [];
			const fileSections = splitIntoFileSections(rawDiff);
			for (const section of fileSections) {
				const parsed = parseFileSection(section);
				if (parsed) files.push(parsed);
			}
			return files;
		}, (cause) => codepolicyError("GIT_DIFF_ERROR", "Failed to parse diff output", cause))();
	}
};
DiffParser = _decorate([injectable()], DiffParser);

//#endregion
//#region src/infrastructure/git/simple-git.adapter.ts
let SimpleGitClient = class SimpleGitClient$1 {
	diff(base = "HEAD") {
		return simpleGit().diff([base]);
	}
	verifyRef(ref) {
		return simpleGit().raw([
			"rev-parse",
			"--verify",
			ref
		]);
	}
};
SimpleGitClient = _decorate([injectable()], SimpleGitClient);

//#endregion
//#region src/infrastructure/git/git-diff.service.ts
function validateBase(base) {
	if (base.startsWith("-")) return codepolicyError("GIT_INVALID_BASE", `Invalid base ref "${base}": must not start with "-".`);
	return null;
}
let GitDiffService = class GitDiffService$1 {
	constructor(git = inject(SimpleGitClient), diffParser = inject(DiffParser)) {
		this.git = git;
		this.diffParser = diffParser;
	}
	getChangedFiles(base) {
		if (base !== void 0) {
			const validationError = validateBase(base);
			if (validationError) return errAsync(validationError);
			return this.verifyAndDiff(base);
		}
		return this.executeDiff();
	}
	verifyAndDiff(base) {
		const git = this.git;
		return ResultAsync.fromPromise(git.verifyRef(base), (cause) => codepolicyError("GIT_BASE_NOT_FOUND", `Base ref "${base}" not found. If running in CI, ensure the ref is fetched (e.g. git fetch --depth=1 origin ${base}).`, cause)).andThen(() => this.executeDiff(base));
	}
	executeDiff(base) {
		const git = this.git;
		return ResultAsync.fromPromise(git.diff(base), (cause) => {
			const message = cause instanceof Error ? cause.message : String(cause);
			if (message.includes("not a git repository")) return codepolicyError("GIT_NOT_REPO", "Not a git repository", cause);
			return codepolicyError("GIT_DIFF_ERROR", `Failed to get git diff: ${message}`, cause);
		}).andThen((rawDiff) => this.diffParser.parse(rawDiff));
	}
};
GitDiffService = _decorate([injectable()], GitDiffService);

//#endregion
//#region src/application/rule-execution/cache-helpers.ts
function buildCacheInput(scope, rule, fileTree, reasoningEffort) {
	const fileTreeHash = rule.usesFileTree === true && fileTree ? createHash("sha256").update(fileTree).digest("hex").slice(0, 16) : "";
	return {
		ruleId: rule.id,
		ruleVersion: rule.ruleVersion ?? "",
		codepolicyVersion: CODEPOLICY_VERSION,
		model: rule.agent,
		reasoningEffort,
		scopeCode: scope.code,
		scopeSignature: scope.signature,
		scopeType: scope.scopeType,
		scopeName: scope.name,
		filePath: scope.filePath,
		fileTreeHash
	};
}
const ZERO_USAGE = {
	inputTokens: 0,
	outputTokens: 0,
	reasoningTokens: 0,
	cacheReadInputTokens: 0,
	cacheCreationInputTokens: 0
};
function buildResultFromCache(scope, rule, cachedScore, cachedReason, durationMs) {
	return {
		filePath: scope.filePath,
		scopeName: scope.name,
		rule,
		score: cachedScore,
		reason: cachedReason,
		passed: cachedScore >= rule.threshold,
		usage: ZERO_USAGE,
		durationMs
	};
}

//#endregion
//#region src/application/rule-execution/file-tree.lib.ts
const execFileAsync = promisify(execFile);
function generateFileTree(workingDir) {
	return ResultAsync.fromPromise(execFileAsync("git", [
		"ls-tree",
		"-r",
		"--name-only",
		"HEAD"
	], {
		cwd: workingDir,
		maxBuffer: 1024 * 1024
	}), () => new Error("git ls-tree failed")).map(({ stdout }) => stdout.trim()).orElse(() => ok(void 0));
}

//#endregion
//#region src/application/rule-execution/glob-path.ts
function normalizeGlobPath(filePath) {
	return filePath.split(path.sep).join("/");
}

//#endregion
//#region src/application/rule-execution/override-resolver.ts
function matchesOverride(filePath, override) {
	const normalized = normalizeGlobPath(filePath);
	const matchesFiles = override.files.some((pattern) => path.matchesGlob(normalized, pattern));
	if (!matchesFiles) return false;
	if (override.ignores) return !override.ignores.some((pattern) => path.matchesGlob(normalized, pattern));
	return true;
}
function applyOverrides(baseRule, filePath, overrides) {
	let level = baseRule.level;
	let threshold = baseRule.threshold;
	let options = baseRule.options;
	for (const override of overrides) {
		if (!matchesOverride(filePath, override)) continue;
		const ruleConfig = override.rules[baseRule.id];
		if (ruleConfig === void 0) continue;
		level = extractLevel(ruleConfig);
		const overrideThreshold = extractThreshold(ruleConfig);
		if (overrideThreshold !== void 0) threshold = overrideThreshold;
		const overrideOptions = extractOptions(ruleConfig);
		if (overrideOptions !== void 0) options = overrideOptions;
	}
	if (level === "off") return null;
	return {
		...baseRule,
		level,
		threshold,
		options
	};
}

//#endregion
//#region src/application/rule-execution/ts-function-finder.lib.ts
const NAMED_FUNCTION_TYPES = new Set([
	"function_declaration",
	"method_definition",
	"arrow_function",
	"function_expression"
]);
function getNameFromVariableParent(node) {
	const parent = node.parent;
	if (parent?.type === "variable_declarator") return parent.childForFieldName("name")?.text ?? null;
	return null;
}
function getCalleeIdentifier(callExpr) {
	const callee = callExpr.children[0];
	if (callee?.type === "identifier") return callee.text;
	return null;
}
function getFirstStringArg(callExpr) {
	const args = callExpr.children.find((c) => c.type === "arguments");
	if (!args) return null;
	const firstChild = args.namedChildren[0];
	if (firstChild?.type === "string") return firstChild.text.slice(1, -1);
	return null;
}
function collectDescribeChain(callExpr) {
	const chain = [];
	let current = callExpr.parent;
	while (current) {
		if (current.type === "call_expression" && getCalleeIdentifier(current) === "describe") {
			const desc = getFirstStringArg(current);
			if (desc) chain.unshift(desc);
		}
		current = current.parent;
	}
	return chain;
}
const TEST_CALLEE_NAMES = new Set(["it", "test"]);
function findEnclosingTestCall(node) {
	const args = node.parent;
	if (args?.type !== "arguments") return null;
	const callExpr = args.parent;
	if (callExpr?.type !== "call_expression") return null;
	const callee = getCalleeIdentifier(callExpr);
	if (!callee || !TEST_CALLEE_NAMES.has(callee)) return null;
	return callExpr;
}
function getNameFromTestCall(node) {
	const callExpr = findEnclosingTestCall(node);
	if (!callExpr) return null;
	const testDesc = getFirstStringArg(callExpr);
	if (!testDesc) return null;
	const chain = collectDescribeChain(callExpr);
	chain.push(testDesc);
	return chain.join(" > ");
}
function isTestCaseNode(node) {
	return findEnclosingTestCall(node) !== null;
}
function isExportedNode(node) {
	let current = node;
	while (current) {
		if (current.type === "export_statement") return true;
		current = current.parent;
	}
	return false;
}
function extractFunctionName(node) {
	if (node.type === "function_declaration" || node.type === "method_definition") return getNameFromDeclaration(node);
	if (node.type === "arrow_function" || node.type === "function_expression") return getNameFromVariableParent(node) ?? getNameFromTestCall(node);
	return null;
}
function extractScopeType(node) {
	return isTestCaseNode(node) ? "test-case" : "function";
}
function findEnclosingNamedFunction(tree, sourceCode, filePath, lineNumber) {
	const targetRow = lineNumber - 1;
	let current = tree.rootNode.descendantForPosition({
		row: targetRow,
		column: 0
	});
	while (current) {
		if (NAMED_FUNCTION_TYPES.has(current.type)) {
			const name = extractFunctionName(current);
			if (name) return {
				filePath,
				scopeType: extractScopeType(current),
				name,
				code: current.text,
				signature: extractSignature(current, sourceCode),
				isExported: isExportedNode(current),
				startLine: current.startPosition.row + 1,
				endLine: current.endPosition.row + 1
			};
		}
		current = current.parent;
	}
	return null;
}

//#endregion
//#region src/application/rule-execution/ts-type-finder.lib.ts
const TYPE_SCOPE_TYPES = new Map([["type_alias_declaration", "type"], ["interface_declaration", "interface"]]);
function findEnclosingNamedTypeScope(tree, filePath, lineNumber) {
	const targetRow = lineNumber - 1;
	let current = tree.rootNode.descendantForPosition({
		row: targetRow,
		column: 0
	});
	while (current) {
		const scopeType = TYPE_SCOPE_TYPES.get(current.type);
		if (scopeType) {
			const name = getNameFromDeclaration(current);
			if (name) return {
				filePath,
				scopeType,
				name,
				code: current.text,
				startLine: current.startPosition.row + 1,
				endLine: current.endPosition.row + 1
			};
		}
		current = current.parent;
	}
	return null;
}

//#endregion
//#region src/application/rule-execution/scope-extractor.service.ts
function createParser() {
	const parser = new Parser();
	parser.setLanguage(TypeScript.typescript);
	return parser;
}
function buildFileScopeUnit(filePath, sourceCode) {
	const lines = sourceCode.split("\n");
	return {
		filePath,
		scopeType: "file",
		name: path.basename(filePath),
		code: sourceCode,
		startLine: 1,
		endLine: lines.length
	};
}
function extractUniqueScopes(rules) {
	return new Set(rules.flatMap((r) => Array.isArray(r.scope) ? r.scope : [r.scope]));
}
function addIfUnseen(seen, key, add) {
	if (!seen.has(key)) {
		seen.add(key);
		add();
	}
}
function expandLineRanges(lineRanges) {
	const lines = [];
	for (const range of lineRanges) for (let i = range.start; i <= range.end; i++) lines.push(i);
	return lines;
}
function isRequestedTypeScope(scopeUnit, needsType, needsInterface) {
	return scopeUnit.scopeType === "type" && needsType || scopeUnit.scopeType === "interface" && needsInterface;
}
function addScopeUnit(results, seen, scopeUnit) {
	const key = `${scopeUnit.scopeType}:${scopeUnit.filePath}:${scopeUnit.startLine}`;
	addIfUnseen(seen, key, () => results.push(scopeUnit));
}
let ScopeExtractor = class ScopeExtractor$1 {
	extract(changedFiles, rules) {
		const scopes = extractUniqueScopes(rules);
		const needsFunction = scopes.has("function") || scopes.has("exported-function") || scopes.has("test-case");
		const needsFile = scopes.has("file");
		const needsType = scopes.has("type");
		const needsInterface = scopes.has("interface");
		return this.extractAll(changedFiles, needsFunction, needsFile, needsType, needsInterface);
	}
	extractAll(changedFiles, needsFunction, needsFile, needsType, needsInterface) {
		const parser = createParser();
		const results = [];
		const seen = new Set();
		let chain = okAsync(void 0);
		for (const file of changedFiles) chain = chain.andThen(() => ResultAsync.fromPromise(readFile(file.filePath, "utf-8"), (error) => codepolicyError("FILE_READ_ERROR", `Failed to read source file: ${error instanceof Error ? error.message : String(error)}`, error)).map((sourceCode) => {
			this.extractFromFile(file, sourceCode, parser, needsFunction, needsFile, needsType, needsInterface, results, seen);
		}));
		return chain.map(() => results);
	}
	extractFromFile(file, sourceCode, parser, needsFunction, needsFile, needsType, needsInterface, results, seen) {
		if (needsFile) addIfUnseen(seen, `file:${file.filePath}`, () => results.push(buildFileScopeUnit(file.filePath, sourceCode)));
		if (!needsFunction && !needsType && !needsInterface) return;
		const tree = parser.parse(sourceCode);
		const diffLines = expandLineRanges(file.lineRanges);
		if (needsFunction) {
			this.extractFunctionRelatedScopes(file, sourceCode, tree, diffLines, needsType, needsInterface, results, seen);
			return;
		}
		this.extractTypeRelatedScopes(file, sourceCode, tree, diffLines, needsType, needsInterface, results, seen);
	}
	extractFunctionRelatedScopes(file, sourceCode, tree, diffLines, needsType, needsInterface, results, seen) {
		for (const line of diffLines) {
			const functionScope = findEnclosingNamedFunction(tree, sourceCode, file.filePath, line);
			const typeScope = needsType || needsInterface ? findEnclosingNamedTypeScope(tree, file.filePath, line) : null;
			if (functionScope) addScopeUnit(results, seen, functionScope);
			if (typeScope && isRequestedTypeScope(typeScope, needsType, needsInterface)) addScopeUnit(results, seen, typeScope);
			if (!functionScope && !typeScope) addIfUnseen(seen, `file:${file.filePath}`, () => results.push(buildFileScopeUnit(file.filePath, sourceCode)));
		}
	}
	extractTypeRelatedScopes(file, sourceCode, tree, diffLines, needsType, needsInterface, results, seen) {
		for (const line of diffLines) {
			const typeScope = findEnclosingNamedTypeScope(tree, file.filePath, line);
			if (typeScope && isRequestedTypeScope(typeScope, needsType, needsInterface)) {
				addScopeUnit(results, seen, typeScope);
				continue;
			}
			addIfUnseen(seen, `file:${file.filePath}`, () => results.push(buildFileScopeUnit(file.filePath, sourceCode)));
		}
	}
};
ScopeExtractor = _decorate([injectable()], ScopeExtractor);

//#endregion
//#region src/application/rule-execution/target-files.lib.ts
function shouldIgnoreFile(filePath, ignorePatterns) {
	const normalizedPath = normalizeGlobPath(filePath);
	return ignorePatterns.some((pattern) => path.matchesGlob(normalizedPath, pattern));
}
function buildFileChainFromEntries(entries, rootDir, currentDir, ignorePatterns) {
	let chain = okAsync([]);
	for (const entry of entries) {
		if (shouldSkipEntry(entry.name)) continue;
		const absolutePath = path.join(currentDir, entry.name);
		const relativePath = path.relative(rootDir, absolutePath);
		if (shouldIgnoreFile(relativePath, ignorePatterns)) continue;
		if (entry.isDirectory()) {
			chain = chain.andThen((files) => collectTypeScriptFiles(rootDir, absolutePath, ignorePatterns).map((subFiles) => [...files, ...subFiles]));
			continue;
		}
		if (entry.isFile() && /\.tsx?$/.test(entry.name)) chain = chain.map((files) => [...files, relativePath]);
	}
	return chain;
}
function collectTypeScriptFiles(rootDir, currentDir, ignorePatterns) {
	return ResultAsync.fromPromise(fs.readdir(currentDir, { withFileTypes: true }), (cause) => codepolicyError("FILE_READ_ERROR", `Failed to read directory: ${cause instanceof Error ? cause.message : String(cause)}`, cause)).andThen((entries) => buildFileChainFromEntries(entries, rootDir, currentDir, ignorePatterns));
}
function createChangedFileForAll(rootDir, filePath) {
	return ResultAsync.fromPromise(fs.readFile(path.join(rootDir, filePath), "utf-8"), (cause) => codepolicyError("FILE_READ_ERROR", `Failed to read file: ${cause instanceof Error ? cause.message : String(cause)}`, cause)).map((sourceCode) => {
		const totalLines = sourceCode.split("\n").length;
		return {
			filePath,
			lineRanges: [{
				start: 1,
				end: totalLines
			}]
		};
	});
}
function loadAllFiles(workingDir, ignorePatterns) {
	return collectTypeScriptFiles(workingDir, workingDir, ignorePatterns).andThen((filePaths) => ResultAsync.combine(filePaths.map((filePath) => createChangedFileForAll(workingDir, filePath))));
}

//#endregion
//#region src/application/rule-execution/lint-pipeline.service.ts
function resolveSettings(options, config) {
	return {
		ruleId: options.ruleId ?? null,
		agent: options.agent ?? null,
		concurrency: options.concurrency ?? config.concurrency ?? 10,
		reasoningEffort: options.reasoningEffort ?? null,
		base: options.base ?? config.base ?? null,
		cacheDisabled: options.noCache === true
	};
}
function matchesScope(scope, ruleScope) {
	if (Array.isArray(ruleScope)) return ruleScope.some((singleScope) => matchesScope(scope, singleScope));
	if (ruleScope === "exported-function") return scope.scopeType === "function" && scope.isExported === true;
	return scope.scopeType === ruleScope;
}
function buildPairs(scopes, rules, overrides) {
	const pairs = [];
	for (const scope of scopes) for (const rule of rules) {
		if (!matchesScope(scope, rule.scope)) continue;
		const effectiveRule = applyOverrides(rule, scope.filePath, overrides);
		if (effectiveRule !== null && effectiveRule.level !== "off") pairs.push([scope, effectiveRule]);
	}
	return pairs;
}
function filterByRuleId(rules, ruleId) {
	if (ruleId === null) return rules;
	return rules.filter((r) => r.id === ruleId);
}
function applyAgentOverride(rules, agent) {
	if (agent === null) return rules;
	return rules.map((rule) => ({
		...rule,
		agent
	}));
}
let LintPipeline = class LintPipeline$1 {
	constructor(configLoader = inject(ConfigLoader), ruleResolver = inject(RuleResolver), externalRuleLoader = inject(ExternalRuleLoader), gitDiffService = inject(GitDiffService), scopeExtractor = inject(ScopeExtractor), workingDir = inject(WorkingDir), logContextStore = inject(LogContextStore), log = inject(CreateLogger)("LintPipeline"), evalCache = inject(EvalCacheService)) {
		this.configLoader = configLoader;
		this.ruleResolver = ruleResolver;
		this.externalRuleLoader = externalRuleLoader;
		this.gitDiffService = gitDiffService;
		this.scopeExtractor = scopeExtractor;
		this.workingDir = workingDir;
		this.logContextStore = logContextStore;
		this.log = log;
		this.evalCache = evalCache;
	}
	run(options) {
		this.log.info("Loading config...");
		return this.loadConfigAndRules(options).andThen(({ config, resolvedRules }) => {
			const settings = resolveSettings(options, config);
			const filtered = filterByRuleId(resolvedRules, settings.ruleId);
			const effectiveRules = applyAgentOverride(filtered, settings.agent);
			this.logSettingsSummary(effectiveRules, settings);
			if (effectiveRules.length === 0) return ok({
				results: [],
				errors: []
			});
			return this.extractAndEvaluate(config, effectiveRules, settings);
		});
	}
	logSettingsSummary(rules, settings) {
		this.log.info(`Resolved ${rules.length} rule(s): ${rules.map((r) => r.id).join(", ")}`);
		if (settings.agent !== null) this.log.info(`Applying model override: ${settings.agent}`);
		if (settings.concurrency !== 10) this.log.info(`Concurrency: ${settings.concurrency}`);
		if (settings.reasoningEffort !== null) this.log.info(`Applying reasoning effort override: ${settings.reasoningEffort}`);
		if (settings.base !== null) this.log.info(`Using base ref: ${settings.base}`);
	}
	loadConfigAndRules(options) {
		return this.configLoader.load(options.configPath).andThen((config) => this.resolveLoadedRules(config, options));
	}
	resolveLoadedRules(config, options) {
		const configDir = resolveConfigDir(this.workingDir, options.configPath);
		return loadRuleModules(config, this.externalRuleLoader, configDir).andThen((ruleModules) => this.ruleResolver.resolve(config, ruleModules).map((resolvedRules) => ({
			config,
			resolvedRules: filterByRuleId(resolvedRules, options.ruleId ?? null)
		})));
	}
	extractAndEvaluate(config, resolvedRules, settings) {
		return this.getTargetFiles(config, settings.base).andThen((changedFiles) => {
			this.log.info(`Files: ${changedFiles.length} target (filter: ${config.filter})`);
			this.log.debug(`Target files: ${changedFiles.map((f) => f.filePath).join(", ")}`);
			if (changedFiles.length === 0) return ok([]);
			return this.scopeExtractor.extract(changedFiles, resolvedRules);
		}).andThen((scopes) => {
			this.logScopeSummary(scopes);
			return this.buildAndEvaluate(scopes, resolvedRules, config.overrides ?? [], settings);
		});
	}
	getTargetFiles(config, base) {
		if (config.filter === "all") {
			if (base !== null) this.log.info("filter=all: --base is ignored when scanning all files.");
			return loadAllFiles(this.workingDir, config.ignore ?? []);
		}
		return this.gitDiffService.getChangedFiles(base ?? void 0);
	}
	logScopeTypeBreakdown(label, scopes) {
		const counts = new Map();
		for (const s of scopes) counts.set(s.scopeType, (counts.get(s.scopeType) ?? 0) + 1);
		const breakdown = [...counts.entries()].map(([type, count]) => `${type}: ${count}`).join(", ");
		this.log.info(`${label}: ${scopes.length} (${breakdown})`);
	}
	logScopeSummary(scopes) {
		this.logScopeTypeBreakdown("Extracted", scopes);
		this.log.debug(`Scopes: ${scopes.map((s) => `${s.filePath}:${s.name}`).join(", ")}`);
	}
	logChecksSummary(pairs) {
		this.logScopeTypeBreakdown("Checks", pairs.map(([scope]) => scope));
	}
	createEvaluators(resolvedRules) {
		const evaluatorMap = new Map();
		let chain = okAsync(void 0);
		for (const rule of resolvedRules) {
			const create = rule.create;
			chain = chain.andThen(() => create(this.workingDir, rule.options).map((evaluator) => {
				evaluatorMap.set(rule.id, evaluator);
			}).mapErr((e) => codepolicyError("RULE_INIT_ERROR", `Rule init failed for ${rule.id}: ${e.message}`, e)));
		}
		return chain.map(() => evaluatorMap);
	}
	buildAndEvaluate(scopes, resolvedRules, overrides, settings) {
		const pairs = buildPairs(scopes, resolvedRules, overrides);
		this.logChecksSummary(pairs);
		if (pairs.length === 0) return okAsync({
			results: [],
			errors: []
		});
		return this.createEvaluators(resolvedRules).andThen((evaluatorMap) => generateFileTree(this.workingDir).map((fileTree) => [fileTree, evaluatorMap])).andThen(([fileTree, evaluatorMap]) => this.evaluateWithPool(pairs, fileTree, evaluatorMap, settings));
	}
	evaluateWithPool(pairs, fileTree, evaluatorMap, settings) {
		const limit = pLimit(settings.concurrency);
		const settledPromises = pairs.map(([scope, rule]) => limit(async () => {
			const outcome = await this.evaluateOne(scope, rule, fileTree, evaluatorMap, settings);
			return {
				scope,
				rule,
				outcome
			};
		}));
		return ResultAsync.fromSafePromise(Promise.all(settledPromises)).map((settled) => {
			const results = [];
			const errors = [];
			for (const { scope, rule, outcome } of settled) if (outcome.isOk()) results.push(outcome.value);
			else {
				this.log.warn(`Skipped: ${outcome.error.message}`);
				errors.push({
					filePath: scope.filePath,
					scopeName: scope.name,
					rule,
					error: outcome.error
				});
			}
			return {
				results,
				errors
			};
		});
	}
	toScopeContext(scope, fileTree) {
		return {
			source: scope.code,
			filePath: scope.filePath,
			scopeType: scope.scopeType,
			name: scope.name,
			signature: scope.signature,
			fileTree,
			startLine: scope.startLine,
			endLine: scope.endLine
		};
	}
	logEvaluationResult(rule, usage, durationMs, score) {
		const status = score >= rule.threshold ? "PASS" : "FAIL";
		const seconds = (durationMs / 1e3).toFixed(1);
		this.log.info(`${status} (score: ${score}, threshold: ${rule.threshold}) [${seconds}sec | token in:${usage.inputTokens.toLocaleString()} out:${usage.outputTokens.toLocaleString()}]`);
		const details = [];
		if (usage.cacheReadInputTokens > 0 || usage.cacheCreationInputTokens > 0) details.push(`cache: read=${usage.cacheReadInputTokens.toLocaleString()} create=${usage.cacheCreationInputTokens.toLocaleString()}`);
		if (usage.reasoningTokens > 0) details.push(`reasoning: ${usage.reasoningTokens.toLocaleString()}`);
		if (details.length > 0) this.log.debug(`  ${details.join(" | ")}`);
	}
	runEvaluator(scope, rule, fileTree, evaluator, settings, cacheInput) {
		const scopeCtx = this.toScopeContext(scope, fileTree);
		const helper = createLlmHelper(scopeCtx, rule.agent, this.workingDir, settings.reasoningEffort ?? void 0);
		const ctx = {
			...scopeCtx,
			llm: helper
		};
		const startMs = performance.now();
		this.log.info("Evaluating...");
		return evaluator(ctx).mapErr((cause) => codepolicyError("LLM_API_ERROR", "Rule execution failed.", cause)).andThen((llmScore) => {
			const durationMs = Math.round(performance.now() - startMs);
			const usage = helper.getUsage();
			this.logEvaluationResult(rule, usage, durationMs, llmScore.score);
			const result = {
				filePath: scope.filePath,
				scopeName: scope.name,
				rule,
				score: llmScore.score,
				reason: llmScore.reason,
				passed: llmScore.score >= rule.threshold,
				usage,
				durationMs
			};
			if (cacheInput === null) return okAsync(result);
			return this.evalCache.save(cacheInput, {
				score: llmScore.score,
				reason: llmScore.reason
			}).map(() => result).orElse((cause) => {
				this.log.warn(`Failed to save cache: ${cause.message}`);
				return okAsync(result);
			});
		});
	}
	handleCacheLookup(scope, rule, fileTree, evaluator, settings, cacheInput, lookupStart) {
		return (outcome) => {
			if (outcome.kind === "hit") {
				const durationMs = Math.round(performance.now() - lookupStart);
				const passLabel = outcome.entry.score >= rule.threshold ? "PASS" : "FAIL";
				this.log.info(`${passLabel} (score: ${outcome.entry.score}, threshold: ${rule.threshold}) [cache hit | ${(durationMs / 1e3).toFixed(1)}sec]`);
				return okAsync(buildResultFromCache(scope, rule, outcome.entry.score, outcome.entry.reason, durationMs));
			}
			if (outcome.kind === "corrupted") this.log.warn(`Cache entry corrupted, re-evaluating: ${outcome.cause.message}`);
			return this.runEvaluator(scope, rule, fileTree, evaluator, settings, cacheInput);
		};
	}
	evaluateOne(scope, rule, fileTree, evaluatorMap, settings) {
		return this.logContextStore.run({
			rule: rule.id,
			scope: `${scope.filePath}:${scope.name}`
		}, () => {
			const evaluator = evaluatorMap.get(rule.id);
			if (!evaluator) return errAsync(codepolicyError("RULE_INIT_ERROR", `Evaluator not found for rule: ${rule.id}`));
			const cacheable = rule.cacheable !== false && !settings.cacheDisabled;
			if (!cacheable) return this.runEvaluator(scope, rule, fileTree, evaluator, settings, null);
			const cacheInput = buildCacheInput(scope, rule, fileTree, settings.reasoningEffort ?? void 0);
			const lookupStart = performance.now();
			return this.evalCache.lookup(cacheInput).andThen(this.handleCacheLookup(scope, rule, fileTree, evaluator, settings, cacheInput, lookupStart));
		});
	}
};
LintPipeline = _decorate([injectable()], LintPipeline);

//#endregion
//#region src/application/output/reporter.service.ts
function groupViolations(violations) {
	const groups = new Map();
	for (const v of violations) {
		const key = `${v.filePath}:${v.scopeName}`;
		const existing = groups.get(key);
		if (existing) existing.violations.push(v);
		else groups.set(key, {
			filePath: v.filePath,
			scopeName: v.scopeName,
			violations: [v]
		});
	}
	return [...groups.values()];
}
function formatUsage(usage, durationMs) {
	const seconds = (durationMs / 1e3).toFixed(1);
	return `[${seconds}sec | token in:${usage.inputTokens.toLocaleString()} out:${usage.outputTokens.toLocaleString()}]`;
}
function sumUsage(results) {
	let inputTokens = 0;
	let outputTokens = 0;
	let reasoningTokens = 0;
	let cacheReadInputTokens = 0;
	let cacheCreationInputTokens = 0;
	let durationMs = 0;
	for (const r of results) {
		inputTokens += r.usage.inputTokens;
		outputTokens += r.usage.outputTokens;
		reasoningTokens += r.usage.reasoningTokens;
		cacheReadInputTokens += r.usage.cacheReadInputTokens;
		cacheCreationInputTokens += r.usage.cacheCreationInputTokens;
		durationMs += r.durationMs;
	}
	return {
		usage: {
			inputTokens,
			outputTokens,
			reasoningTokens,
			cacheReadInputTokens,
			cacheCreationInputTokens
		},
		durationMs
	};
}
function formatViolation(v) {
	const levelLabel = v.rule.level;
	const usageSuffix = formatUsage(v.usage, v.durationMs);
	return `    [${v.rule.id}] score: ${v.score} (threshold: ${v.rule.threshold}) ${levelLabel}  ${usageSuffix}\n    ${v.reason}`;
}
function formatGroup(group) {
	const header = `  ${group.filePath} > ${group.scopeName}`;
	const details = group.violations.map(formatViolation).join("\n\n");
	return `${header}\n${details}`;
}
function countScopes(results) {
	const keys = new Set();
	for (const r of results) keys.add(`${r.filePath}:${r.scopeName}`);
	return keys.size;
}
function countRules(results) {
	const ids = new Set();
	for (const r of results) ids.add(r.rule.id);
	return ids.size;
}
function formatErrorEntry(entry) {
	const lines = formatErrorCauseChain(entry.error);
	return `  ${entry.filePath} > ${entry.scopeName}\n    [${entry.rule.id}] ${lines.join("\n    ")}`;
}
let Reporter = class Reporter$1 {
	format(output) {
		const { results, errors } = output;
		const violations = results.filter((r) => !r.passed);
		const totals = sumUsage(results);
		const totalSuffix = formatUsage(totals.usage, totals.durationMs);
		const sections = [];
		if (violations.length === 0 && errors.length === 0) {
			const scopes = countScopes(results);
			const rules = countRules(results);
			return `\u2713 codepolicy: all checks passed (${scopes} scopes \u00d7 ${rules} rules) ${totalSuffix}`;
		}
		if (violations.length > 0) {
			const groups = groupViolations(violations);
			const body = groups.map(formatGroup).join("\n\n");
			sections.push(`\u2717 codepolicy: ${violations.length} violations found ${totalSuffix}\n\n${body}`);
		}
		if (errors.length > 0) {
			const errorBody = errors.map(formatErrorEntry).join("\n\n");
			sections.push(`\u2717 codepolicy: ${errors.length} error(s) during evaluation\n\n${errorBody}`);
		}
		return sections.join("\n\n");
	}
	getExitCode(output) {
		const { results, errors } = output;
		if (errors.length > 0) return 1;
		const hasError = results.some((r) => !r.passed && r.rule.level === "error");
		return hasError ? 1 : 0;
	}
};
Reporter = _decorate([injectable()], Reporter);

//#endregion
//#region src/cli/entry.ts
const main = defineCommand({
	meta: {
		name: "codepolicy",
		version: "0.0.1",
		description: "LLM-powered semantic lint tool for CI pipelines"
	},
	args: {
		config: {
			type: "string",
			alias: "c",
			description: "Path to config file"
		},
		filter: {
			type: "string",
			description: "Filter mode: diff or all"
		},
		rule: {
			type: "string",
			description: "Run specific rule only"
		},
		agent: {
			type: "string",
			description: "Override model for all rules"
		},
		concurrency: {
			type: "string",
			description: "Number of parallel LLM evaluations (default: 10)"
		},
		base: {
			type: "string",
			description: "Git ref to diff against (e.g. origin/main). Only used with filter=diff."
		},
		"reasoning-effort": {
			type: "string",
			description: "Reasoning effort for Codex models (minimal|low|medium|high|xhigh)"
		},
		verbose: {
			type: "boolean",
			description: "Show verbose output including SDK message logs",
			default: false
		},
		"no-cache": {
			type: "boolean",
			description: "Disable evaluation result cache (do not look up or save cache entries)",
			default: false
		}
	},
	subCommands: {
		rule: () => import("../rule.command-CksrLop_.mjs").then((m) => m.default),
		validate: () => import("../validate.command-BFacpVWq.mjs").then((m) => m.default),
		model: () => import("../model.command-rILnfJ-7.mjs").then((m) => m.default)
	},
	async run({ rawArgs, args }) {
		const subCommandNames = [
			"rule",
			"validate",
			"model"
		];
		if (rawArgs.some((arg) => subCommandNames.includes(arg))) return;
		const container = getAppContainer();
		container.get(LogLevelToken).level = args.verbose ? "debug" : "info";
		const pipeline = container.get(LintPipeline);
		const reporter = container.get(Reporter);
		const reasoningEffortResult = parseModelReasoningEffort(args["reasoning-effort"]);
		if (reasoningEffortResult.isErr()) {
			console.error(`Error [INVALID_ARGUMENT]: ${reasoningEffortResult.error.message}`);
			process.exitCode = 1;
			return;
		}
		const result = await pipeline.run({
			configPath: args.config,
			ruleId: args.rule,
			agent: args.agent,
			concurrency: args.concurrency ? Number(args.concurrency) : void 0,
			reasoningEffort: reasoningEffortResult.value,
			base: args.base,
			noCache: args["no-cache"]
		});
		result.match((lintOutput) => {
			const output = reporter.format(lintOutput);
			console.log(output);
			process.exitCode = reporter.getExitCode(lintOutput);
		}, (error) => {
			for (const line of formatErrorCauseChain(error)) console.error(line);
			process.exitCode = 1;
		});
	}
});
ResultAsync.fromPromise(runMain(main), (e) => e instanceof Error ? e : new Error(String(e))).mapErr((error) => {
	console.error(error.message);
	process.exitCode = 1;
}).match(() => destroyAppContainer(), () => destroyAppContainer());

//#endregion