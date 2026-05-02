import { Type } from "@sinclair/typebox";

//#region src/shared/schema-definitions.ts
const ruleLevelSchema = Type.Union([
	Type.Literal("error"),
	Type.Literal("warn"),
	Type.Literal("off")
]);
const configFilterSchema = Type.Union([Type.Literal("diff"), Type.Literal("all")], { default: "diff" });
const ruleScopeSchema = Type.Union([
	Type.Literal("function"),
	Type.Literal("exported-function"),
	Type.Literal("test-case"),
	Type.Literal("file"),
	Type.Literal("type"),
	Type.Literal("interface")
]);
const ruleConfigSchema = Type.Union([ruleLevelSchema, Type.Object({
	level: ruleLevelSchema,
	threshold: Type.Optional(Type.Number())
})]);
const overrideEntrySchema = Type.Object({
	files: Type.Array(Type.String(), { minItems: 1 }),
	ignores: Type.Optional(Type.Array(Type.String())),
	rules: Type.Record(Type.String(), ruleConfigSchema)
});
const codepolicyConfigFileSchema = Type.Object({
	$schema: Type.Optional(Type.String()),
	filter: Type.Optional(configFilterSchema),
	base: Type.Optional(Type.String({ description: "Git ref to diff against (e.g. \"origin/main\"). Only used when filter is \"diff\". Overridden by CLI --base." })),
	rulePaths: Type.Optional(Type.Array(Type.String(), {
		minItems: 1,
		description: "Paths to project-specific rule modules."
	})),
	agent: Type.String({ description: "Default LLM agent for all rules (e.g. \"github-copilot/gpt-4.1\"). Overridden by CLI --agent." }),
	concurrency: Type.Optional(Type.Integer({
		minimum: 1,
		description: "Number of parallel LLM evaluations (default: 10). LLM calls are I/O-bound; values up to 30-50 are usually safe if the provider rate limit allows. Overridden by CLI --concurrency."
	})),
	rules: Type.Record(Type.String(), ruleConfigSchema),
	ignore: Type.Optional(Type.Array(Type.String())),
	overrides: Type.Optional(Type.Array(overrideEntrySchema))
}, {
	$id: "https://codepolicy.dev/schemas/codepolicy-config.schema.json",
	additionalProperties: false,
	title: "Codepolicy Config"
});
const llmScoreSchema = Type.Object({
	score: Type.Integer({
		minimum: 0,
		maximum: 100,
		description: "判定スコア。0から100の整数で返す（0-1スケールや小数は不可）。値が高いほど観点に適合。"
	}),
	reason: Type.String({
		minLength: 1,
		description: "判定理由。主要な根拠を簡潔に説明する。"
	})
}, {
	additionalProperties: false,
	description: "セマンティックlintの判定結果。"
});

//#endregion
export { codepolicyConfigFileSchema, llmScoreSchema };