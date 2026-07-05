import path from 'node:path';

import { Type } from '@sinclair/typebox';
import { ok, okAsync } from 'neverthrow';

import type { RuleVerdict } from '../../shared/types';
import type { RuleDefinition } from '../rule-types';

const inferenceSchema = Type.Object(
  {
    responsibility: Type.String({ minLength: 1 }),
    abstractionLevel: Type.Union([
      Type.Literal('low-level-utility'),
      Type.Literal('business-logic'),
      Type.Literal('orchestration'),
    ]),
  },
  { additionalProperties: false },
);

const canonicalSchema = Type.Object(
  {
    canonicalPath: Type.String({ minLength: 1 }),
    certainty: Type.Union([Type.Literal('certain'), Type.Literal('uncertain')]),
    reason: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

// パス表記の揺れ（先頭 './' の有無など）を吸収してから比較する。
function normalizePath(filePath: string): string {
  return path.normalize(filePath).replace(/^\.\//, '');
}

const optionsSchema = Type.Object({
  dirs: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
});

function parseDirs(options?: Record<string, unknown>): string[] | undefined {
  const raw = options?.['dirs'];
  return Array.isArray(raw) ? raw.map(String) : undefined;
}

function filterFileTree(fileTree: string, dirs?: string[]): string {
  if (!dirs || dirs.length === 0) return fileTree;
  return fileTree
    .split('\n')
    .filter((line) => dirs.some((d) => line.startsWith(d)))
    .join('\n');
}

function buildStep1Prompt(): string {
  return `以下の関数の実装を読んで、2点を分析してください。

1. **responsibility**: この関数の核心的な責務を1-2文で要約してください。
2. **abstractionLevel**: 以下から1つ選んでください。
   - \`low-level-utility\`: データ変換、パーサー、AST操作など、特定のドメインに依存しない低レベル処理
   - \`business-logic\`: ドメイン固有のルールや判定を実装する処理
   - \`orchestration\`: 複数のサービスや処理を組み合わせて一連のワークフローを統合する処理`;
}

function buildStep2Prompt(
  step1: { responsibility: string; abstractionLevel: string },
  fileTree: string,
): string {
  return `以下の関数分析に基づき、この関数の「正規の居場所」をファイルツリーから1つだけ特定してください。

## 「正規の居場所」とは
この責務のコードを探すとき、開発者が最初に見に行くべきファイル。
その責務の Single Source of Truth となるべき場所。

## 判断基準
- 関数の責務の本質と、ファイルが担う責務領域との一致度で判断すること。
- ファイル名のキーワードが関数名と表面的に一致するだけでは根拠にならない。
- 抽象レベルの整合性を重視すること: low-level-utility は .lib.ts や utils/ に、orchestration は .service.ts のメインサービスに配置されるべき。
- certainty は「canonicalPath が正規の居場所だと確信できるか」。確信できる場合のみ certain とし、迷いがあるなら uncertain とすること。

## 重要な制約
- canonicalPath はファイルツリー内の既存ファイルから選ぶこと。
- reason に判断根拠を簡潔に書くこと。

## 関数の分析結果
- 責務: ${step1.responsibility}
- 抽象レベル: ${step1.abstractionLevel}

## ファイルツリー

\`\`\`
${fileTree}
\`\`\``;
}

function mapStep2ToVerdict(
  step2: { canonicalPath: string; certainty: 'certain' | 'uncertain'; reason: string },
  currentFilePath: string,
): RuleVerdict {
  const isMatch = normalizePath(step2.canonicalPath) === normalizePath(currentFilePath);
  if (isMatch) {
    return {
      verdict: 'pass',
      reasoning: `正規の居場所 ${step2.canonicalPath} と一致。理由: ${step2.reason}`,
      citations: [],
    };
  }

  return {
    verdict: step2.certainty === 'certain' ? 'violation' : 'borderline',
    reasoning: `正規の居場所: ${step2.canonicalPath}。現在のファイル: ${currentFilePath}。理由: ${step2.reason}`,
    citations: [],
  };
}

const definition: RuleDefinition = {
  meta: {
    scope: 'exported-function',
    usesFileTree: true,
  },
  optionsSchema,
  create: (_workingDir, options?) => {
    const dirs = parseDirs(options);
    return okAsync((ctx) => {
      const fileTree = filterFileTree(ctx.fileTree ?? '', dirs);
      return ctx.llm
        .evaluate({
          prompt: buildStep1Prompt(),
          include: { source: true, signature: true, name: true },
          responseFormat: inferenceSchema,
        })
        .andThen((step1) =>
          ctx.llm.evaluate({
            prompt: buildStep2Prompt(step1, fileTree),
            responseFormat: canonicalSchema,
          }),
        )
        .andThen((step2) => ok(mapStep2ToVerdict(step2, ctx.filePath)));
    });
  },
};

export default definition;
