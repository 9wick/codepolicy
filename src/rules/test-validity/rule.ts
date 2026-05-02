import { Type } from '@sinclair/typebox';
import { okAsync } from 'neverthrow';

import { llmScoreSchema } from '../../shared/schema-definitions';
import type { RuleDefinition } from '../rule-types';

const inferenceSchema = Type.Object(
  { inference: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(filePath);
}

const definition: RuleDefinition = {
  meta: { scope: 'test-case', threshold: 70 },
  create: () =>
    okAsync((ctx) => {
      if (!isTestFile(ctx.filePath)) {
        return okAsync({ score: 100, reason: 'Not a test file, skipping.' });
      }

      return ctx.llm
        .evaluate({
          prompt: `以下のテスト名から、このテストで検証すべき具体的なアサーション（期待動作）を推論してください。
テストの実装コードは見ずに、テスト名とファイルパスのコンテキストのみから推測してください。

出力形式: テストが検証すべき内容を箇条書きで記述してください。補足説明は不要です。`,
          include: { name: true, filePath: true },
          responseFormat: inferenceSchema,
        })
        .andThen((step1) =>
          ctx.llm.evaluate({
            prompt: `以下は、テスト名から推論された「期待される検証内容」と、実際のテストコードです。
2つの観点で評価してください。

## 推論された期待検証内容
${step1.inference}

## 評価観点

### 1. 必要十分性
テスト名の主張を、アサーションが証明しているか。
- テスト名の主張が偽である実装（例: エラーを返さない実装）を、このテストが検出できるか
- テスト名と無関係なアサーションしかない場合は不十分

### 2. 変更耐性
アサーションが振る舞い（入出力・戻り値・状態変化）を検証しているか。
- 良い例: 戻り値の検証、例外の検証、observable な状態変化の検証
- 悪い例: 内部変数の直接参照、プライベートメソッドの呼び出し回数、実装固有のマジックナンバー

## 評価しないこと
- パターン数や境界値の網羅性（1つの代表的なケースで主張を証明できていれば十分）
- テストスイート全体のカバレッジ設計`,
            include: { source: true },
            responseFormat: llmScoreSchema,
          }),
        );
    }),
};

export default definition;
