import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { ResultAsync, okAsync } from 'neverthrow';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

import {
  computeFingerprint,
  findSimilarScopes,
  type ScopeFingerprint,
} from '../../application/rule-execution/ast-fingerprint';
import { shouldSkipEntry } from '../../application/rule-execution/fs-walk';
import type { RuleVerdict } from '../../shared/types';
import type { RuleContext, RuleDefinition } from '../rule-types';

// --- Comparison result schema ---
// フィールド順 = 推論順（reasoning → result）。判定理由を先に言語化させてから結論を出させる。
const comparisonResultSchema = Type.Object(
  {
    reasoning: Type.String({ minLength: 1, description: '判定根拠' }),
    result: Type.Union([
      Type.Literal('duplicate'),
      Type.Literal('not-duplicate'),
      Type.Literal('uncertain'),
    ]),
  },
  { additionalProperties: false },
);

type ComparisonResult = Static<typeof comparisonResultSchema>;

// --- Options ---

const optionsSchema = Type.Object({
  dirs: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
  similarityThreshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.7 })),
});

// --- AST scope extraction ---

const FUNCTION_TYPES = new Set([
  'function_declaration',
  'method_definition',
  'arrow_function',
  'function_expression',
]);

const TYPE_TYPES = new Map<string, 'type' | 'interface'>([
  ['type_alias_declaration', 'type'],
  ['interface_declaration', 'interface'],
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

function extractScopesFromTree(rootNode: Parser.SyntaxNode, filePath: string): ScopeFingerprint[] {
  const results: ScopeFingerprint[] = [];

  function walk(node: Parser.SyntaxNode): void {
    if (FUNCTION_TYPES.has(node.type)) {
      const name = extractName(node);
      if (name) {
        results.push({
          scope: {
            filePath,
            scopeType: 'function',
            name,
            code: node.text,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
          },
          fingerprint: computeFingerprint(node),
        });
      }
    }

    const typeKind = TYPE_TYPES.get(node.type);
    if (typeKind) {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        results.push({
          scope: {
            filePath,
            scopeType: typeKind,
            name,
            code: node.text,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
          },
          fingerprint: computeFingerprint(node),
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

// --- LLM prompt ---

function buildComparisonPrompt(
  sourceA: string,
  sourceB: string,
  nameA: string,
  nameB: string,
  filePathA: string,
  filePathB: string,
): string {
  return `以下の2つのコードについて、一方をもう一方で置き換えるか、両方を1つの関数に統合すべきかを判定してください。

## 判定基準
- 変数名やフォーマットの違いは無視し、関数の目的と意図を比較する
- 一方を他方の呼び出しで置き換えられるなら重複
- 両方を1つの関数に統合すべきなら重複
- 以下は重複ではない:
  - 同じデザインパターン（再帰走査、イテレーション、型ガード等）を使っているだけで、パターン内のビジネスロジックが異なる場合
  - 同じデータ構造を扱うが、目的が異なる処理（構築 vs 検証 vs 変換など）

## コード A: ${nameA} (${filePathA})
${sourceA}

## コード B: ${nameB} (${filePathB})
${sourceB}`;
}

function mapComparisonToVerdict(comparison: ComparisonResult, citation: string): RuleVerdict {
  if (comparison.result === 'duplicate') {
    return { verdict: 'violation', reasoning: comparison.reasoning, citations: [citation] };
  }
  if (comparison.result === 'uncertain') {
    return { verdict: 'borderline', reasoning: comparison.reasoning, citations: [citation] };
  }
  return { verdict: 'pass', reasoning: comparison.reasoning, citations: [] };
}

// --- Fingerprint collection ---

function parseAndCollect(
  filePaths: string[],
  parser: Parser,
  workingDir: string,
): ResultAsync<ScopeFingerprint[], Error> {
  const allFingerprints: ScopeFingerprint[] = [];

  return filePaths.reduce<ResultAsync<ScopeFingerprint[], Error>>(
    (acc, filePath) =>
      acc.andThen((fps) =>
        ResultAsync.fromPromise(readFile(filePath, 'utf-8'), (e) =>
          e instanceof Error ? e : new Error(String(e)),
        ).map((source) => {
          const tree = parser.parse(source);
          const relativePath = path.relative(workingDir, filePath);
          fps.push(...extractScopesFromTree(tree.rootNode, relativePath));
          return fps;
        }),
      ),
    okAsync(allFingerprints),
  );
}

function collectAllFingerprints(
  scanDirs: string[],
  parser: Parser,
  workingDir: string,
): ResultAsync<ScopeFingerprint[], Error> {
  return ResultAsync.fromPromise(Promise.all(scanDirs.map(collectTsFiles)), (e) =>
    e instanceof Error ? e : new Error(String(e)),
  ).andThen((fileLists) => parseAndCollect(fileLists.flat(), parser, workingDir));
}

// --- Rule definition ---

const NO_FINGERPRINT_VERDICT: RuleVerdict = {
  verdict: 'pass',
  reasoning: '指紋未検出',
  citations: [],
};
const NO_SIMILAR_CODE_VERDICT: RuleVerdict = {
  verdict: 'pass',
  reasoning: '類似コード未検出',
  citations: [],
};

const definition: RuleDefinition = {
  meta: { scope: 'function' },
  optionsSchema,
  create: (workingDir, options?) => {
    const rawDirs = options?.['dirs'];
    const dirs = Array.isArray(rawDirs) ? rawDirs.map(String) : undefined;
    const rawThreshold = options?.['similarityThreshold'];
    const threshold = typeof rawThreshold === 'number' ? rawThreshold : 0.7;
    const scanDirs = dirs ? dirs.map((d) => path.resolve(workingDir, d)) : [workingDir];

    const parser = new Parser();
    // @ts-expect-error tree-sitter-typescript type mismatch with tree-sitter's Language type
    parser.setLanguage(TypeScript.typescript);

    return collectAllFingerprints(scanDirs, parser, workingDir).map(
      (allFingerprints) =>
        (ctx: RuleContext): ResultAsync<RuleVerdict, Error> => {
          const targetFp = allFingerprints.find(
            (fp) => fp.scope.filePath === ctx.filePath && fp.scope.startLine === ctx.startLine,
          );
          if (!targetFp) {
            return okAsync(NO_FINGERPRINT_VERDICT);
          }

          const candidates = findSimilarScopes(targetFp, allFingerprints, threshold);
          const top = candidates[0];
          if (!top) {
            return okAsync(NO_SIMILAR_CODE_VERDICT);
          }

          const citation = `${top.scope.filePath}:${top.scope.name}`;
          return ctx.llm
            .evaluate({
              prompt: buildComparisonPrompt(
                ctx.source,
                top.scope.code,
                ctx.name,
                top.scope.name,
                ctx.filePath,
                top.scope.filePath,
              ),
              responseFormat: comparisonResultSchema,
            })
            .map((comparison) => mapComparisonToVerdict(comparison, citation));
        },
    );
  },
};

export default definition;
