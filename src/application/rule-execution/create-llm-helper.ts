import type { Static, TSchema } from '@sinclair/typebox';
import { TypeGuard } from '@sinclair/typebox';
import { ResultAsync, errAsync } from 'neverthrow';

import type { LlmPrompt } from '../../infrastructure/llm/llm-provider';
import { resolveProvider } from '../../infrastructure/llm/resolve-provider';
import type { LlmHelper, LlmEvaluateOptions, ScopeContext } from '../../rules/rule-types';
import type { ModelReasoningEffort, TokenUsage } from '../../shared/types';

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

  return {
    evaluate: <S extends TSchema>(
      options: LlmEvaluateOptions<S>,
    ): ResultAsync<Static<S>, Error> => {
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
          accumulatedUsage.inputTokens += usage.inputTokens;
          accumulatedUsage.outputTokens += usage.outputTokens;
          accumulatedUsage.reasoningTokens += usage.reasoningTokens;
          accumulatedUsage.cacheReadInputTokens += usage.cacheReadInputTokens;
          accumulatedUsage.cacheCreationInputTokens += usage.cacheCreationInputTokens;
          return output;
        })
        .mapErr(wrapLlmError);
    },

    getUsage: () => ({ ...accumulatedUsage }),
  };
}
