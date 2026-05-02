import type { Static, TObject, TSchema } from '@sinclair/typebox';
import type { ResultAsync } from 'neverthrow';

import type { LlmScore, RuleScope, TokenUsage } from '../shared/types';

// --- Rule Meta ---

export type RuleMeta = {
  scope: RuleScope | RuleScope[];
  threshold: number;
  // false で結果キャッシュを無効化する。multi-step rule で内部状態が prompt に含まれない場合などに使う。
  cacheable?: boolean;
  // この rule が prompt に fileTree を含めるとき true。
  // cache key の fileTreeHash 部分の有無を制御し、fileTree 非依存の rule で
  // ファイル追加が cache を不要に invalidate するのを防ぐ。
  usesFileTree?: boolean;
};

// --- LLM Helper ---

export type LlmEvaluateOptions<Schema extends TSchema> = {
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

export type LlmHelper = {
  evaluate: <S extends TSchema>(options: LlmEvaluateOptions<S>) => ResultAsync<Static<S>, Error>;
  getUsage: () => TokenUsage;
};

// --- Rule Context ---

export type ScopeContext = {
  source: string;
  filePath: string;
  scopeType: RuleScope;
  name: string;
  signature?: string;
  fileTree?: string;
  startLine: number;
  endLine: number;
};

export type RuleContext = ScopeContext & {
  llm: LlmHelper;
};

// --- Rule Definition ---

export type RuleEvaluateFn = (ctx: RuleContext) => ResultAsync<LlmScore, Error>;

export type RuleCreateFn = (
  workingDir: string,
  options?: Record<string, unknown>,
) => ResultAsync<RuleEvaluateFn, Error>;

export type RuleDefinition = {
  meta: RuleMeta;
  optionsSchema?: TObject;
  create: RuleCreateFn;
};

export type RuleModule = {
  id: string;
  definition: RuleDefinition;
};
