import { Type } from '@sinclair/typebox';
import { ok, okAsync } from 'neverthrow';

import type { LlmScore } from '../../shared/types';
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
    confidence: Type.Integer({ minimum: 0, maximum: 100 }),
    reason: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

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

const definition: RuleDefinition = {
  meta: {
    scope: 'exported-function',
    threshold: 70,
    usesFileTree: true,
  },
  optionsSchema,
  create: (_workingDir, options?) => {
    const dirs = parseDirs(options);
    return okAsync((ctx) => {
      const fileTree = filterFileTree(ctx.fileTree ?? '', dirs);
      return ctx.llm
        .evaluate({
          prompt: `以下の関数の実装を読んで、2点を分析してください。

1. **responsibility**: この関数の核心的な責務を1-2文で要約してください。
2. **abstractionLevel**: 以下から1つ選んでください。
   - \`low-level-utility\`: データ変換、パーサー、AST操作など、特定のドメインに依存しない低レベル処理
   - \`business-logic\`: ドメイン固有のルールや判定を実装する処理
   - \`orchestration\`: 複数のサービスや処理を組み合わせて一連のワークフローを統合する処理`,
          include: { source: true, signature: true, name: true },
          responseFormat: inferenceSchema,
        })
        .andThen((step1) =>
          ctx.llm.evaluate({
            prompt: `以下の関数分析に基づき、この関数の「正規の居場所」をファイルツリーから1つだけ特定してください。

## 「正規の居場所」とは
この責務のコードを探すとき、開発者が最初に見に行くべきファイル。
その責務の Single Source of Truth となるべき場所。

## 判断基準
- 関数の責務の本質と、ファイルが担う責務領域との一致度で判断すること。
- ファイル名のキーワードが関数名と表面的に一致するだけでは根拠にならない。
- 抽象レベルの整合性を重視すること: low-level-utility は .lib.ts や utils/ に、orchestration は .service.ts のメインサービスに配置されるべき。
- confidence は「このファイルが正規の居場所であることの確信度」。迷いがあるなら低くすること。

## 重要な制約
- canonicalPath はファイルツリー内の既存ファイルから選ぶこと。
- reason に判断根拠を簡潔に書くこと。

## 関数の分析結果
- 責務: ${step1.responsibility}
- 抽象レベル: ${step1.abstractionLevel}

## ファイルツリー

\`\`\`
${fileTree}
\`\`\``,
            responseFormat: canonicalSchema,
          }),
        )
        .andThen((step2) => {
          const isMatch = step2.canonicalPath === ctx.filePath;
          return ok<LlmScore>({
            score: isMatch ? 100 : 100 - step2.confidence,
            reason: isMatch
              ? `正規の居場所 ${step2.canonicalPath} と一致 (confidence: ${step2.confidence})。理由: ${step2.reason}`
              : `正規の居場所: ${step2.canonicalPath} (confidence: ${step2.confidence})。現在のファイル: ${ctx.filePath}。理由: ${step2.reason}`,
          });
        });
    });
  },
};

export default definition;
