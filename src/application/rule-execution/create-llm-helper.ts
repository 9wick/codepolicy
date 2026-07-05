import type { Static, TSchema } from '@sinclair/typebox';
import { TypeGuard } from '@sinclair/typebox';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';

import type { LlmPrompt } from '../../infrastructure/llm/llm-provider';
import { resolveProvider } from '../../infrastructure/llm/resolve-provider';
import { judgeProposalSchema, judgeVerificationSchema } from '../../shared/schema-definitions';
import type {
  LlmHelper,
  LlmEvaluateOptions,
  LlmJudgeOptions,
  ScopeContext,
} from '../../rules/rule-types';
import type { ModelReasoningEffort, RuleVerdict, TokenUsage } from '../../shared/types';

const SYSTEM_PROMPT = `あなたはコードレビュアーです。与えられたコードを指定された観点でチェックし、JSON形式で結果を出力してください。

必達条件:
- 1ターンで完了すること。分析や説明のテキストを出力せず、即座にStructuredOutputツールを呼び出して結果を返すこと。
- ファイル読み取りなどのツール呼び出しは一切行わないこと。判断に必要な情報はすべてプロンプト内に含まれている。
- 出力は必ず与えられたJSONスキーマと、ユーザープロンプト内の「出力形式」に従うこと。`;

function formatFieldRule(fieldName: string, fieldSchema: TSchema, required: boolean): string {
  const labels: string[] = [required ? '必須' : '任意'];
  if (typeof fieldSchema.type === 'string') {
    labels.push(`type: ${fieldSchema.type}`);
  }
  if (typeof fieldSchema.description === 'string') {
    return `- ${fieldName} (${labels.join(', ')}): ${fieldSchema.description}`;
  }
  return `- ${fieldName} (${labels.join(', ')})`;
}

function extractRequiredFieldNames(schema: TSchema): Set<string> {
  const requiredSet = new Set<string>();
  if (Array.isArray(schema.required)) {
    for (const item of schema.required) {
      if (typeof item === 'string') {
        requiredSet.add(item);
      }
    }
  }
  return requiredSet;
}

function buildOutputFormatSection(schema: TSchema): string | null {
  if (schema.type !== 'object') {
    return null;
  }
  const properties: unknown = schema.properties;
  if (!TypeGuard.IsProperties(properties)) {
    return null;
  }

  const lines: string[] = ['## 出力形式'];
  if (typeof schema.description === 'string') {
    lines.push(schema.description);
  }

  const requiredSet = extractRequiredFieldNames(schema);
  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    lines.push(formatFieldRule(fieldName, fieldSchema, requiredSet.has(fieldName)));
  }

  if (schema.additionalProperties === false) {
    lines.push('- 追加プロパティは出力しない。');
  }

  return lines.join('\n');
}

type IncludeFlags = NonNullable<LlmEvaluateOptions<TSchema>['include']>;

function codeBlockSection(
  enabled: boolean | undefined,
  content: string | undefined,
  heading: string,
  language: string,
): string | null {
  if (enabled !== true || !content) return null;
  return `\n## ${heading}\n\n\`\`\`${language}\n${content}\n\`\`\``;
}

// Order: rule prompt -> output format -> context (file/scope/signature/fileTree/source).
// rule prompt が先頭にあると、同 rule で複数 scope を評価する際に
// `[rule prompt][output format]` 部分が prompt cache prefix として共有される
// (実プロジェクトでは「同 rule × 多 scope」の方が「同 scope × 多 rule」より圧倒的に多い)。
function buildIncludedContextSections(ctx: ScopeContext, include: IncludeFlags): string[] {
  const sections: (string | null)[] = [
    include.filePath === true ? `ファイル: ${ctx.filePath}` : null,
    include.scopeType === true ? `スコープ: ${ctx.scopeType}` : null,
    include.name === true ? `名前: ${ctx.name}` : null,
    codeBlockSection(include.signature, ctx.signature, '関数シグネチャ', 'typescript'),
    codeBlockSection(include.fileTree, ctx.fileTree, 'ファイルツリー', ''),
    codeBlockSection(include.source, ctx.source, '対象コード', 'typescript'),
  ];
  const result: string[] = [];
  for (const section of sections) {
    if (section !== null) result.push(section);
  }
  return result;
}

function toArrayIfPresent(value: string | null): string[] {
  return value ? [value] : [];
}

export function buildUserPrompt<S extends TSchema>(
  ctx: ScopeContext,
  options: LlmEvaluateOptions<S>,
): string {
  const include = options.include ?? {};
  const parts = [
    `## チェック観点\n${options.prompt}`,
    ...toArrayIfPresent(buildOutputFormatSection(options.responseFormat)),
    ...buildIncludedContextSections(ctx, include),
  ];
  return parts.join('\n');
}

function wrapLlmError(cause: Error): Error {
  const wrapped = new Error(`LLM API request failed: ${cause.message}`);
  wrapped.cause = cause;
  return wrapped;
}

// Stage 0 の照合はホワイトスペースの差異（改行/連続スペース）を無視して部分文字列一致させる。
// LLM が引用時に整形し直すことがあるため、厳密一致だと正当な引用まで棄却してしまう。
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// citations が対象ソース（+ extraCitationSources）に実在するかを機械的に照合し、
// 対象コードに実在しない捏造citationを除去する。
function filterValidCitations(citations: string[], citationSources: string[]): string[] {
  const normalizedSource = normalizeWs(citationSources.join('\n'));
  return citations.filter((citation) => {
    const normalizedCitation = normalizeWs(citation);
    return normalizedCitation.length > 0 && normalizedSource.includes(normalizedCitation);
  });
}

const HALLUCINATION_DOWNGRADE_REASONING =
  '一次判定は違反と主張したが、引用された根拠が対象コード中に見つからなかったため、判定を却下しpassとして扱う。';

type Stage0Outcome =
  | { done: true; verdict: RuleVerdict }
  | { done: false; citations: string[]; matchedCriterion: string | null };

// proposer が 'violation' と主張したのに実在する citation が1つも残らなければ、
// 捏造根拠に基づく誤判定とみなして verifier を呼ばずに pass へ降格する。
function runMechanicalCheck(
  proposal: Static<typeof judgeProposalSchema>,
  citationSources: string[],
): Stage0Outcome {
  const validCitations = filterValidCitations(proposal.citations, citationSources);

  if (proposal.verdict === 'violation') {
    if (validCitations.length === 0) {
      return {
        done: true,
        verdict: { verdict: 'pass', reasoning: HALLUCINATION_DOWNGRADE_REASONING, citations: [] },
      };
    }
    return { done: false, citations: validCitations, matchedCriterion: proposal.matchedCriterion };
  }

  // borderline は既に不確実性を申告済みのため、そのまま確定させる（verifier を通さない）。
  return {
    done: true,
    verdict: {
      verdict: proposal.verdict,
      reasoning: proposal.reasoning,
      citations: validCitations,
    },
  };
}

// verifier には proposer の reasoning を渡さない（敵対的フレーミングで独立に再判定させるため）。
// 対象コードやファイルパス等のコンテキストは proposer と同じ include 機構で末尾に付与されるため、
// ここには埋め込まない（配置系 rule は filePath/fileTree がないと違反を立証できない）。
function buildVerifierPrompt(
  criteria: string,
  citations: string[],
  matchedCriterion: string | null,
): string {
  const citationList =
    citations.length > 0 ? citations.map((citation) => `- ${citation}`).join('\n') : '(なし)';

  return [
    'あなたは一次判定の結果を独立に再検証する担当者です。一次判定者の判断理由は与えられていません。',
    '一次判定が「違反」と主張した以下の根拠について、判定基準に照らして本当に違反と言えるか、根拠が基準に該当しない・対象コードの文脈上問題ない・誤読や過剰解釈であるなど、積極的に棄却できる理由がないか検討してください。判定に必要な情報（対象コード・ファイルパス等）はこのプロンプト内にすべて含まれています。',
    '',
    '## 判定基準',
    criteria,
    '',
    '## 一次判定が提示した根拠',
    citationList,
    '',
    '## 一次判定が該当したとした基準',
    matchedCriterion ?? '(なし)',
  ].join('\n');
}

function mapVerification(
  verification: Static<typeof judgeVerificationSchema>,
  citations: string[],
): RuleVerdict {
  if (verification.result === 'confirmed') {
    return { verdict: 'violation', reasoning: verification.reasoning, citations };
  }
  if (verification.result === 'dismissed') {
    return { verdict: 'pass', reasoning: verification.reasoning, citations: [] };
  }
  return { verdict: 'borderline', reasoning: verification.reasoning, citations };
}

function accumulateUsage(accumulated: TokenUsage, usage: TokenUsage): void {
  accumulated.inputTokens += usage.inputTokens;
  accumulated.outputTokens += usage.outputTokens;
  accumulated.reasoningTokens += usage.reasoningTokens;
  accumulated.cacheReadInputTokens += usage.cacheReadInputTokens;
  accumulated.cacheCreationInputTokens += usage.cacheCreationInputTokens;
}

function createEvaluate(
  ctx: ScopeContext,
  model: string,
  workingDir: string,
  reasoningEffort: ModelReasoningEffort | undefined,
  accumulatedUsage: TokenUsage,
): LlmHelper['evaluate'] {
  return function evaluate<S extends TSchema>(
    options: LlmEvaluateOptions<S>,
  ): ResultAsync<Static<S>, Error> {
    const providerResult = resolveProvider(model, workingDir);
    if (providerResult.isErr()) {
      return errAsync(providerResult.error);
    }

    const prompt: LlmPrompt = {
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(ctx, options),
    };

    return providerResult.value
      .generate({
        prompt,
        config: { model, reasoningEffort },
        returnSchema: options.responseFormat,
      })
      .map(({ output, usage }) => {
        accumulateUsage(accumulatedUsage, usage);
        return output;
      })
      .mapErr(wrapLlmError);
  };
}

function createJudge(ctx: ScopeContext, evaluate: LlmHelper['evaluate']): LlmHelper['judge'] {
  return function judge(options: LlmJudgeOptions): ResultAsync<RuleVerdict, Error> {
    const citationSources = [ctx.source, ...(options.extraCitationSources ?? [])];

    return evaluate({
      prompt: options.criteria,
      include: options.include,
      responseFormat: judgeProposalSchema,
    }).andThen((proposal) => {
      const stage0 = runMechanicalCheck(proposal, citationSources);
      if (stage0.done) return okAsync(stage0.verdict);

      // proposer と同じコンテキスト（対象コード・ファイルパス・fileTree 等）を verifier にも与える。
      // 特に配置系 rule は source だけでは違反を立証も棄却もできない。
      return evaluate({
        prompt: buildVerifierPrompt(options.criteria, stage0.citations, stage0.matchedCriterion),
        include: options.include,
        responseFormat: judgeVerificationSchema,
      }).map((verification) => mapVerification(verification, stage0.citations));
    });
  };
}

export function createLlmHelper(
  ctx: ScopeContext,
  model: string,
  workingDir: string,
  reasoningEffort?: ModelReasoningEffort,
): LlmHelper {
  const accumulatedUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };

  const evaluate = createEvaluate(ctx, model, workingDir, reasoningEffort, accumulatedUsage);
  const judge = createJudge(ctx, evaluate);

  return {
    evaluate,
    judge,
    getUsage: () => ({ ...accumulatedUsage }),
  };
}
