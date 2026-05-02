import { codepolicyError } from "./container-BlKlgD7g.mjs";
import { builtinRules } from "./builtin-rules-Dvoe--3J.mjs";
import { ResultAsync, err, errAsync, ok, okAsync } from "neverthrow";
import { injectable } from "@needle-di/core";
import path from "node:path";
import _decorate from "@oxc-project/runtime/helpers/decorate";
import { pathToFileURL } from "node:url";
import { P, isMatching } from "ts-pattern";

//#region src/rules/external-rule-loader.lib.ts
const ruleDefinitionPattern = {
	meta: {
		scope: P.union(P.string, P.array(P.string)),
		threshold: P.number
	},
	create: P.when((value) => typeof value === "function")
};
function isRuleDefinition(value) {
	return isMatching(ruleDefinitionPattern, value);
}
function isRuleModule(value) {
	return isMatching({
		id: P.string,
		definition: P.when(isRuleDefinition)
	}, value);
}
function extractDefaultRuleModule(loadedModule) {
	if (!isMatching({ default: P.when(isRuleModule) }, loadedModule)) return void 0;
	const ruleModule = loadedModule.default;
	return ruleModule;
}
function dynamicImport(url, errorMessage) {
	return new ResultAsync(import(url).then((mod) => ok(mod), (cause) => err(codepolicyError("RULE_NOT_FOUND", errorMessage, cause))));
}

//#endregion
//#region src/rules/external-rule-loader.service.ts
let ExternalRuleLoader = class ExternalRuleLoader$1 {
	load(rulePaths, configDir) {
		return ResultAsync.combine(rulePaths.map((rulePath) => this.loadOne(rulePath, configDir)));
	}
	loadOne(rulePath, configDir) {
		const resolvedPath = path.resolve(configDir, rulePath);
		const importUrl = pathToFileURL(resolvedPath).href;
		return dynamicImport(importUrl, `Failed to load external rule module: ${rulePath}`).andThen((loadedModule) => {
			const ruleModule = extractDefaultRuleModule(loadedModule);
			if (!ruleModule) return errAsync(codepolicyError("CONFIG_PARSE_ERROR", `External rule module must default-export { id, definition }: ${rulePath}`));
			return okAsync(ruleModule);
		});
	}
};
ExternalRuleLoader = _decorate([injectable()], ExternalRuleLoader);

//#endregion
//#region src/rules/load-rule-modules.ts
function findDuplicateRuleIds(rules) {
	const counts = new Map();
	for (const rule of rules) counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
	return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
}
function loadRuleModules(config, externalRuleLoader, configDir) {
	return externalRuleLoader.load(config.rulePaths ?? [], configDir).andThen((externalRules) => {
		const combinedRules = [...builtinRules, ...externalRules];
		const duplicateIds = findDuplicateRuleIds(combinedRules);
		if (duplicateIds.length > 0) return errAsync(codepolicyError("CONFIG_PARSE_ERROR", `Duplicate rule ids found across builtin and external rules: ${duplicateIds.join(", ")}`));
		return okAsync(combinedRules);
	});
}

//#endregion
//#region src/rules/rule-config-utils.ts
function extractLevel(ruleConfig) {
	return typeof ruleConfig === "string" ? ruleConfig : ruleConfig.level;
}
function extractThreshold(ruleConfig) {
	return typeof ruleConfig === "object" ? ruleConfig.threshold : void 0;
}
function extractOptions(ruleConfig) {
	if (typeof ruleConfig === "string") return void 0;
	const copy = { ...ruleConfig };
	delete copy.level;
	delete copy.threshold;
	return Object.keys(copy).length > 0 ? copy : void 0;
}

//#endregion
//#region src/application/config/config-path.ts
function resolveConfigPath(workingDir, configPath) {
	return path.resolve(workingDir, configPath ?? ".codepolicy.yml");
}
function resolveConfigDir(workingDir, configPath) {
	return path.dirname(resolveConfigPath(workingDir, configPath));
}

//#endregion
export { ExternalRuleLoader, extractLevel, extractOptions, extractThreshold, loadRuleModules, resolveConfigDir };