import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Static, TSchema } from '@sinclair/typebox';
import { okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import type { LlmEvaluateOptions, RuleContext } from 'codepolicy';

async function loadPromptGeneralReaderModule(): Promise<{
  default: RuleContext['llm'] extends never
    ? never
    : {
        definition: { create: (ctx: RuleContext) => ReturnType<RuleContext['llm']['evaluate']> };
      };
  extractPromptTexts: (source: string) => string[];
}> {
  const configPath = path.resolve(import.meta.dirname, 'prompt-general-reader.config.ts');
  const moduleUrl = pathToFileURL(configPath).href;
  return import(moduleUrl);
}

describe('prompt-general-reader', () => {
  it('extracts prompt template literals from a rule file', async () => {
    const { extractPromptTexts } = await loadPromptGeneralReaderModule();
    const prompts = extractPromptTexts(`
const definition = {
  create: (ctx) =>
    ctx.llm.evaluate({
      prompt: \`first prompt\`,
    }).andThen(() =>
      ctx.llm.evaluate({
        prompt: \`second prompt\`,
      }),
    ),
};
`);

    expect(prompts).toEqual(['first prompt', 'second prompt']);
  });

  it('extracts prompt text beyond escaped backticks inside the template literal', async () => {
    const { extractPromptTexts } = await loadPromptGeneralReaderModule();
    const prompts = extractPromptTexts(`
const definition = {
  create: (ctx) =>
    ctx.llm.evaluate({
      prompt: \`line 1
- \\\`undefined\\\` を受けたまま処理を進める
- parser helper / AST traversal / lookup helper
\`,
    }),
};
`);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('parser helper / AST traversal / lookup helper');
  });

  it('passes extracted prompt text to the LLM evaluation and maps repo-context findings', async () => {
    const { default: promptGeneralReaderRule } = await loadPromptGeneralReaderModule();
    const receivedPrompts: string[] = [];
    const ctx: RuleContext = {
      source: `
import { llmScoreSchema } from '../shared/schema-definitions';

const definition = {
  create: (ctx) =>
    ctx.llm.evaluate({
      prompt: \`この rule の説明が一般読者に理解可能かを確認する\`,
    }),
};
`,
      filePath: 'src/rules/strict-function-boundary/rule.ts',
      scopeType: 'file',
      name: 'rule.ts',
      startLine: 1,
      endLine: 10,
      llm: {
        evaluate: <S extends TSchema>(options: LlmEvaluateOptions<S>) => {
          receivedPrompts.push(options.prompt);
          return okAsync({
            pass: false,
            reason: 'contains project-specific assumptions',
            unnaturalSignals: [{ phrase: '内部の補助分類', why: 'repo 固有前提' }],
          } as Static<S>);
        },
        getUsage: () => ({
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        }),
      },
    };

    const result = await promptGeneralReaderRule.definition.create(ctx);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      score: 0,
      reason: 'contains project-specific assumptions Signals: 内部の補助分類 (repo 固有前提)',
    });
    expect(receivedPrompts[0]).toContain('任意の product codebase');
    expect(receivedPrompts[0]).toContain('概念の判定であって単語の blacklist ではない');
    expect(receivedPrompts[0]).toContain('pass の条件');
  });

  it('asks the LLM to judge project-specific concepts rather than blacklist words', async () => {
    const { default: promptGeneralReaderRule } = await loadPromptGeneralReaderModule();
    const receivedPrompts: string[] = [];
    const ctx: RuleContext = {
      source: `
const definition = {
  create: (ctx) =>
    ctx.llm.evaluate({
      prompt: \`入力を正規化してから主要処理に渡すべきことを説明している\`,
    }),
};
`,
      filePath: 'src/rules/strict-function-boundary/rule.ts',
      scopeType: 'file',
      name: 'rule.ts',
      startLine: 1,
      endLine: 7,
      llm: {
        evaluate: <S extends TSchema>(options: LlmEvaluateOptions<S>) => {
          receivedPrompts.push(options.prompt);
          return okAsync({
            pass: true,
            reason: 'concept is general enough',
            unnaturalSignals: [],
          } as Static<S>);
        },
        getUsage: () => ({
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        }),
      },
    };

    const result = await promptGeneralReaderRule.definition.create(ctx);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({ score: 100 });
    expect(receivedPrompts[0]).toContain('fail の条件');
    expect(receivedPrompts[0]).toContain('判定時の注意');
  });

  it('returns score 100 when LLM passes the prompt', async () => {
    const { default: promptGeneralReaderRule } = await loadPromptGeneralReaderModule();

    const ctx: RuleContext = {
      source: `
const definition = {
  create: (ctx) =>
    ctx.llm.evaluate({
      prompt: \`parser helper / AST traversal / lookup helper / execution option\`,
    }),
};
`,
      filePath: 'src/rules/strict-function-boundary/rule.ts',
      scopeType: 'file',
      name: 'rule.ts',
      startLine: 1,
      endLine: 7,
      llm: {
        evaluate: <S extends TSchema>(_options: LlmEvaluateOptions<S>) =>
          okAsync({
            pass: true,
            reason: 'TypeScript / ecosystem level knowledge is enough',
            unnaturalSignals: [
              {
                phrase: 'TypeDoc コメント',
                why: 'TypeScript ecosystem の知識があれば理解できる',
              },
            ],
          } as Static<S>),
        getUsage: () => ({
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        }),
      },
    };

    const result = await promptGeneralReaderRule.definition.create(ctx);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      score: 100,
      reason: expect.stringContaining('TypeDoc コメント'),
    });
  });

  it('should allow TypeDoc as TypeScript-specific but not codepolicy-specific wording', async () => {
    const { default: promptGeneralReaderRule } = await loadPromptGeneralReaderModule();

    const ctx: RuleContext = {
      source: `
const definition = {
  create: (ctx) =>
    ctx.llm.evaluate({
      prompt: \`この関数の TypeDoc コメントを書いてください\`,
    }),
};
`,
      filePath: 'src/rules/function-contract/rule.ts',
      scopeType: 'file',
      name: 'rule.ts',
      startLine: 1,
      endLine: 7,
      llm: {
        evaluate: <S extends TSchema>(_options: LlmEvaluateOptions<S>) =>
          okAsync({
            pass: true,
            reason: 'TypeScript users generally understand TypeDoc',
            unnaturalSignals: [],
          } as Static<S>),
        getUsage: () => ({
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        }),
      },
    };

    const result = await promptGeneralReaderRule.definition.create(ctx);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({ score: 100 });
  });

  it('skips files without rule prompts', async () => {
    const { default: promptGeneralReaderRule } = await loadPromptGeneralReaderModule();
    const ctx: RuleContext = {
      source: 'export const answer = 42;',
      filePath: 'src/foo.ts',
      scopeType: 'file',
      name: 'foo.ts',
      startLine: 1,
      endLine: 1,
      llm: {
        evaluate: () => okAsync({ score: 0, reason: 'should not be called' }),
        getUsage: () => ({
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        }),
      },
    };

    const result = await promptGeneralReaderRule.definition.create(ctx);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      score: 100,
      reason: 'No rule prompt found in this file.',
    });
  });
});
