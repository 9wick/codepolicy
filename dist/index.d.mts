import { ResultAsync } from "neverthrow";
import * as _sinclair_typebox0 from "@sinclair/typebox";
import { Static, TObject, TSchema } from "@sinclair/typebox";

//#region src/shared/schema-definitions.d.ts
declare const ruleScopeSchema: _sinclair_typebox0.TUnion<[_sinclair_typebox0.TLiteral<"function">, _sinclair_typebox0.TLiteral<"exported-function">, _sinclair_typebox0.TLiteral<"test-case">, _sinclair_typebox0.TLiteral<"file">, _sinclair_typebox0.TLiteral<"type">, _sinclair_typebox0.TLiteral<"interface">]>;
declare const llmScoreSchema: _sinclair_typebox0.TObject<{
  score: _sinclair_typebox0.TInteger;
  reason: _sinclair_typebox0.TString;
}>;
//#endregion
//#region src/shared/types.d.ts
type RuleScope = Static<typeof ruleScopeSchema>;
type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
};
type LlmScore = Static<typeof llmScoreSchema>;
//#endregion
//#region src/rules/rule-types.d.ts
type RuleMeta = {
  scope: RuleScope | RuleScope[];
  threshold: number;
  cacheable?: boolean;
  usesFileTree?: boolean;
};
type LlmEvaluateOptions<Schema extends TSchema> = {
  prompt: string;
  include?: {
    filePath?: boolean;
    source?: boolean;
    scopeType?: boolean;
    name?: boolean;
    signature?: boolean;
    fileTree?: boolean;
  };
  responseFormat: Schema;
};
type LlmHelper = {
  evaluate: <S extends TSchema>(options: LlmEvaluateOptions<S>) => ResultAsync<Static<S>, Error>;
  getUsage: () => TokenUsage;
};
type ScopeContext = {
  source: string;
  filePath: string;
  scopeType: RuleScope;
  name: string;
  signature?: string;
  fileTree?: string;
  startLine: number;
  endLine: number;
};
type RuleContext = ScopeContext & {
  llm: LlmHelper;
};
type RuleEvaluateFn = (ctx: RuleContext) => ResultAsync<LlmScore, Error>;
type RuleCreateFn = (workingDir: string, options?: Record<string, unknown>) => ResultAsync<RuleEvaluateFn, Error>;
type RuleDefinition = {
  meta: RuleMeta;
  optionsSchema?: TObject;
  create: RuleCreateFn;
};
type RuleModule = {
  id: string;
  definition: RuleDefinition;
};
//#endregion
export { type LlmEvaluateOptions, type LlmHelper, type RuleContext, type RuleCreateFn, type RuleDefinition, type RuleEvaluateFn, type RuleMeta, type RuleModule, type ScopeContext };