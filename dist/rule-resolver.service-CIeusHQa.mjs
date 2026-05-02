import { codepolicyError } from "./container-BlKlgD7g.mjs";
import { extractLevel, extractOptions, extractThreshold } from "./config-path-CpxVprhA.mjs";
import { err, ok } from "neverthrow";
import { injectable } from "@needle-di/core";
import _decorate from "@oxc-project/runtime/helpers/decorate";
import { createHash } from "node:crypto";
import { Value } from "@sinclair/typebox/value";

//#region src/rules/rule-resolver.service.ts
function computeRuleVersion(mod, options) {
	const material = [
		mod.definition.create.toString(),
		mod.definition.optionsSchema ? JSON.stringify(mod.definition.optionsSchema) : "",
		options ? JSON.stringify(options) : ""
	].join("\n");
	return createHash("sha256").update(material).digest("hex");
}
function validateOptions(ruleId, options, optionsSchema) {
	if (!optionsSchema) {
		if (options) return err(codepolicyError("CONFIG_PARSE_ERROR", `Rule "${ruleId}" does not accept options: ${Object.keys(options).join(", ")}`));
		return ok(void 0);
	}
	const effective = options ?? {};
	if (!Value.Check(optionsSchema, effective)) {
		const errors = [...Value.Errors(optionsSchema, effective)];
		const messages = errors.map((e) => `${e.path}: ${e.message}`).join("; ");
		return err(codepolicyError("CONFIG_PARSE_ERROR", `Invalid options for rule "${ruleId}": ${messages}`));
	}
	return ok(effective);
}
function buildRuleMap(rules) {
	const ruleMap = new Map();
	for (const rule of rules) ruleMap.set(rule.id, rule);
	return ruleMap;
}
function checkMissingRules(ruleMap, config) {
	const configRuleIds = Object.keys(config.rules);
	const missingIds = configRuleIds.filter((id) => !ruleMap.has(id));
	if (missingIds.length > 0) return err(codepolicyError("RULE_NOT_FOUND", `Rule files not found for configured rules: ${missingIds.join(", ")}`));
	const overrideRuleIds = (config.overrides ?? []).flatMap((o) => Object.keys(o.rules));
	const missingOverrideIds = overrideRuleIds.filter((id) => !ruleMap.has(id));
	if (missingOverrideIds.length > 0) return err(codepolicyError("RULE_NOT_FOUND", `Rule files not found for override rules: ${[...new Set(missingOverrideIds)].join(", ")}`));
	return ok(void 0);
}
function resolveRule(id, config, ruleMap) {
	const ruleConfig = config.rules[id];
	if (ruleConfig === void 0) return ok(void 0);
	const mod = ruleMap.get(id);
	if (!mod) return ok(void 0);
	const rawOptions = extractOptions(ruleConfig);
	return validateOptions(id, rawOptions, mod.definition.optionsSchema).map((options) => ({
		id: mod.id,
		scope: mod.definition.meta.scope,
		agent: config.agent,
		threshold: extractThreshold(ruleConfig) ?? mod.definition.meta.threshold,
		level: extractLevel(ruleConfig),
		create: mod.definition.create,
		options,
		cacheable: mod.definition.meta.cacheable,
		usesFileTree: mod.definition.meta.usesFileTree,
		ruleVersion: computeRuleVersion(mod, options)
	}));
}
let RuleResolver = class RuleResolver$1 {
	resolve(config, rules) {
		const ruleMap = buildRuleMap(rules);
		const checkResult = checkMissingRules(ruleMap, config);
		if (checkResult.isErr()) return err(checkResult.error);
		const resolved = [];
		for (const id of Object.keys(config.rules)) {
			const result = resolveRule(id, config, ruleMap);
			if (result.isErr()) return err(result.error);
			if (result.value) resolved.push(result.value);
		}
		return ok(resolved);
	}
};
RuleResolver = _decorate([injectable()], RuleResolver);

//#endregion
export { RuleResolver };