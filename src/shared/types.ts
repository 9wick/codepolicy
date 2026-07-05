import type { Static } from '@sinclair/typebox';

import type { RuleCreateFn } from '../rules/rule-types';

import type { CodepolicyError } from './errors';
import {
  borderlineHandlingSchema,
  configFilterSchema,
  overrideEntrySchema,
  ruleConfigSchema,
  ruleLevelSchema,
  ruleScopeSchema,
  verdictLabelSchema,
  codepolicyConfigFileSchema,
} from './schema-definitions';

// --- Config ---

export type RuleLevel = Static<typeof ruleLevelSchema>;
export type RuleConfig = Static<typeof ruleConfigSchema>;
export type OverrideEntry = Static<typeof overrideEntrySchema>;

type CodepolicyConfigFile = Static<typeof codepolicyConfigFileSchema>;
export type CodepolicyConfig = Omit<CodepolicyConfigFile, '$schema' | 'filter'> & {
  filter: Static<typeof configFilterSchema>;
};

// --- Rule ---

export type RuleScope = Static<typeof ruleScopeSchema>;

// --- Resolved Rule (config + rule merged) ---

export type ResolvedRule = {
  id: string;
  scope: RuleScope | RuleScope[];
  agent: string;
  borderline: BorderlineHandling;
  level: RuleLevel;
  create: RuleCreateFn;
  options?: Record<string, unknown>;
  cacheable?: boolean;
  usesFileTree?: boolean;
  // 結果キャッシュの key 計算で rule の同一性を識別するためのバージョンハッシュ。
  // rule の prompt や責務が変われば自動 invalidate される。resolver が常に設定する。
  ruleVersion?: string;
};

// --- Git Diff ---

export type ChangedLineRange = {
  start: number; // 1-based line number
  end: number; // 1-based line number (inclusive)
};

export type ChangedFile = {
  filePath: string;
  lineRanges: ChangedLineRange[];
};

// --- Scope Unit ---

export type ScopeUnit = {
  filePath: string;
  scopeType: RuleScope;
  name: string;
  code: string;
  signature?: string;
  isExported?: boolean;
  startLine: number;
  endLine: number;
};

// --- Token Usage ---

export type TokenUsage = {
  inputTokens: number; // total = raw + cacheRead + cacheCreation
  outputTokens: number;
  reasoningTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
};

// --- LLM ---

export type VerdictLabel = Static<typeof verdictLabelSchema>;
export type BorderlineHandling = Static<typeof borderlineHandlingSchema>;

// rule → pipeline の契約（LlmScore を置換）
export type RuleVerdict = {
  verdict: VerdictLabel;
  reasoning: string;
  citations: string[]; // コード内で導出した場合は []
};

export type ModelReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export type LlmConfig = {
  model: string;
  reasoningEffort?: ModelReasoningEffort;
};

// --- Lint Result ---

export type LintResult = {
  filePath: string;
  scopeName: string;
  rule: ResolvedRule;
  verdict: VerdictLabel;
  reasoning: string;
  citations: string[];
  usage: TokenUsage;
  durationMs: number;
};

export type LintErrorEntry = {
  filePath: string;
  scopeName: string;
  rule: ResolvedRule;
  error: CodepolicyError;
};

export type LintOutput = {
  results: LintResult[];
  errors: LintErrorEntry[];
};
