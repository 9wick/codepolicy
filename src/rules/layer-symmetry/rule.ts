import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { Type } from '@sinclair/typebox';
import { ResultAsync, okAsync } from 'neverthrow';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

import { extractSignature } from '../../application/rule-execution/ast-extract';
import { shouldSkipEntry } from '../../application/rule-execution/fs-walk';
import { llmScoreSchema } from '../../shared/schema-definitions';
import type { LlmScore } from '../../shared/types';
import type { RuleContext, RuleDefinition } from '../rule-types';

// --- Types ---

type CollectedFunction = {
  filePath: string;
  name: string;
  signature: string;
  source: string;
  startLine: number;
  endLine: number;
};

// --- Options ---

const optionsSchema = Type.Object({
  dirs: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
});

// --- AST extraction ---

const FUNCTION_TYPES = new Set([
  'function_declaration',
  'method_definition',
  'arrow_function',
  'function_expression',
]);

function extractName(node: Parser.SyntaxNode): string | undefined {
  if (node.type === 'arrow_function' || node.type === 'function_expression') {
    if (node.parent?.type === 'variable_declarator') {
      return node.parent.childForFieldName('name')?.text;
    }
    return undefined;
  }
  return node.childForFieldName('name')?.text;
}

function extractFunctionsFromTree(
  rootNode: Parser.SyntaxNode,
  filePath: string,
  sourceCode: string,
): CollectedFunction[] {
  const results: CollectedFunction[] = [];

  function walk(node: Parser.SyntaxNode): void {
    if (FUNCTION_TYPES.has(node.type)) {
      const name = extractName(node);
      if (name) {
        results.push({
          filePath,
          name,
          signature: extractSignature(node, sourceCode),
          source: node.text,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        });
      }
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  walk(rootNode);
  return results;
}

// --- File collection ---

function isTsFile(name: string): boolean {
  return name.endsWith('.ts') || name.endsWith('.tsx');
}

async function collectTsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectTsFiles(fullPath)));
    } else if (isTsFile(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

// --- LLM schemas ---

const step1Schema = Type.Object(
  {
    similarFunctions: Type.Array(Type.String(), {
      description: '同一ロールと判断した関数の識別子リスト。"filePath:functionName" 形式。',
    }),
  },
  { additionalProperties: false },
);

// --- LLM prompts ---

function buildStep1Prompt(
  targetName: string,
  targetFilePath: string,
  targetSignature: string,
  functionList: string,
  dirTree: string,
): string {
  return `以下のプロジェクト構造と関数一覧から、対象関数と「同じロール・同じレイヤー」に属する関数を特定してください。

## 判定基準
- ファイルパスのパターン（同じディレクトリ構造、同じサフィックス等）
- 関数名の命名パターン（同じプレフィックス/サフィックス、同じ動詞+名詞パターン等）
- シグネチャの類似性（引数/戻り値の型パターン）
- 同じ種類の処理を行う関数群（CRUD操作、バリデーション、変換処理等）

## ディレクトリ構造
\`\`\`
${dirTree}
\`\`\`

## 対象関数
- 名前: ${targetName}
- ファイル: ${targetFilePath}
- シグネチャ: ${targetSignature}

## 関数一覧
${functionList}

## 出力
- similarFunctions: 対象関数と同ロールの関数を "filePath:functionName" 形式で列挙
  - 対象関数自身は含めないこと
  - 同ロールの関数がない場合は空配列を返すこと`;
}

function buildStep2Prompt(
  targetName: string,
  targetFilePath: string,
  targetSource: string,
  similarFunctionsSource: string,
): string {
  return `対象関数と同ロール関数群の記述スタイルの一貫性を評価してください。

## 評価観点
- エラーハンドリングのパターン（try/catch, Result型, null return, throw等）
- 戻り値の型と構造の一貫性
- 引数の取り方（型、順序、命名規則）
- 内部構造の抽象度（直接実装 vs 委譲パターン）
- 命名規則の一貫性

## スコア基準
- 90-100: 同ロール関数と完全に一貫したスタイル
- 70-89: 概ね一貫しているが、些細な不一致がある
- 40-69: 明らかなスタイルの不一致がある
- 0-39: 同ロール関数と大きくスタイルが異なる

## 対象関数: ${targetName} (${targetFilePath})
\`\`\`typescript
${targetSource}
\`\`\`

## 同ロール関数群
${similarFunctionsSource}`;
}

// --- Collection pipeline ---

function parseAndCollectFunctions(
  filePaths: string[],
  parser: Parser,
  workingDir: string,
): ResultAsync<CollectedFunction[], Error> {
  const allFunctions: CollectedFunction[] = [];

  return filePaths.reduce<ResultAsync<CollectedFunction[], Error>>(
    (acc, filePath) =>
      acc.andThen((fns) =>
        ResultAsync.fromPromise(readFile(filePath, 'utf-8'), (e) =>
          e instanceof Error ? e : new Error(String(e)),
        ).map((source) => {
          const tree = parser.parse(source);
          const relativePath = path.relative(workingDir, filePath);
          fns.push(...extractFunctionsFromTree(tree.rootNode, relativePath, source));
          return fns;
        }),
      ),
    okAsync(allFunctions),
  );
}

function collectAllFunctions(
  scanDirs: string[],
  parser: Parser,
  workingDir: string,
): ResultAsync<CollectedFunction[], Error> {
  return ResultAsync.fromPromise(Promise.all(scanDirs.map(collectTsFiles)), (e) =>
    e instanceof Error ? e : new Error(String(e)),
  ).andThen((fileLists) => parseAndCollectFunctions(fileLists.flat(), parser, workingDir));
}

// --- Evaluation helpers ---

function resolveSimilarFunctions(
  step1Result: { similarFunctions: string[] },
  otherFunctions: CollectedFunction[],
): CollectedFunction[] | undefined {
  if (step1Result.similarFunctions.length === 0) return undefined;

  const similarSet = new Set(step1Result.similarFunctions);
  const matched = otherFunctions.filter((fn) => similarSet.has(`${fn.filePath}:${fn.name}`));
  return matched.length > 0 ? matched : undefined;
}

function formatSimilarSources(fns: CollectedFunction[]): string {
  return fns
    .map((fn) => `### ${fn.name} (${fn.filePath})\n\`\`\`typescript\n${fn.source}\n\`\`\``)
    .join('\n\n');
}

function evaluateSymmetry(
  ctx: RuleContext,
  otherFunctions: CollectedFunction[],
  dirTree: string,
): ResultAsync<LlmScore, Error> {
  const functionList = otherFunctions
    .map((fn) => `- ${fn.filePath}:${fn.name} — ${fn.signature}`)
    .join('\n');

  const targetSignature = ctx.signature ?? ctx.name;

  return ctx.llm
    .evaluate({
      prompt: buildStep1Prompt(ctx.name, ctx.filePath, targetSignature, functionList, dirTree),
      responseFormat: step1Schema,
    })
    .andThen((step1Result) => {
      const similarFns = resolveSimilarFunctions(step1Result, otherFunctions);
      if (!similarFns) {
        return okAsync({ score: 100, reason: '同ロール関数が見つからなかったため判定スキップ' });
      }

      return ctx.llm.evaluate({
        prompt: buildStep2Prompt(
          ctx.name,
          ctx.filePath,
          ctx.source,
          formatSimilarSources(similarFns),
        ),
        responseFormat: llmScoreSchema,
      });
    });
}

// --- Rule definition ---

const definition: RuleDefinition = {
  meta: { scope: 'function', threshold: 70 },
  optionsSchema,
  create: (workingDir, options?) => {
    const rawDirs = options?.['dirs'];
    const dirs = Array.isArray(rawDirs) ? rawDirs.map(String) : undefined;
    const scanDirs = dirs ? dirs.map((d) => path.resolve(workingDir, d)) : [workingDir];

    const parser = new Parser();
    // @ts-expect-error tree-sitter-typescript type mismatch with tree-sitter's Language type
    parser.setLanguage(TypeScript.typescript);

    return collectAllFunctions(scanDirs, parser, workingDir).map(
      (collectedFunctions) =>
        (ctx: RuleContext): ResultAsync<LlmScore, Error> => {
          const otherFunctions = collectedFunctions.filter(
            (fn) => !(fn.filePath === ctx.filePath && fn.startLine === ctx.startLine),
          );

          if (otherFunctions.length === 0) {
            return okAsync({ score: 100, reason: '比較対象の関数なし' });
          }

          const filePaths = [...new Set(collectedFunctions.map((fn) => fn.filePath))];
          const dirTree = filePaths.sort().join('\n');

          return evaluateSymmetry(ctx, otherFunctions, dirTree);
        },
    );
  },
};

export default definition;
