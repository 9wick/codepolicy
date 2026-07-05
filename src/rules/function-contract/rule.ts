import { Type } from '@sinclair/typebox';
import { okAsync } from 'neverthrow';

import type { RuleDefinition } from '../rule-types';

const inferenceSchema = Type.Object(
  { inference: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

function stripTypeDoc(typedoc: string): string {
  return typedoc
    .replace(/\/\*\*|\*\//g, '')
    .replace(/^\s*\*\s?/gm, '')
    .replace(/@\w+\s*/g, '')
    .trim();
}

const definition: RuleDefinition = {
  meta: { scope: 'function', usesFileTree: true },
  create: () =>
    okAsync((ctx) =>
      ctx.llm
        .evaluate({
          prompt: `以下の関数の実装を読んで、この関数の公開契約を TypeDoc コメントとして簡潔にまとめてください。
関数名、引数、戻り値、主な副作用を読み取り、利用者が期待する振る舞いが伝わる説明にしてください。

出力形式: TypeDoc コメントのみ（\`/** ... */\` 形式）。補足説明や懸念点は不要です。`,
          include: { source: true, signature: true, fileTree: true, filePath: true, name: true },
          responseFormat: inferenceSchema,
        })
        .andThen((step1) =>
          ctx.llm.judge({
            criteria: `以下は関数の実装コードから推測された振る舞いと、実際の実装コードです。
関数の「名前・引数・戻り値」だけを見た呼び出し元が抱く期待に対して、実装が裏切っていないかをレビューしてください。

## 推測された振る舞い
${stripTypeDoc(step1.inference)}

チェック観点:
- 名前から期待される責務と実装が大きくずれていないか
- 副作用の有無と命名が矛盾していないか（例: getXxx が書き込みや通知送信をしないか）
- 引数や戻り値の扱いが公開契約として自然か

副作用の定義:
- データベースの読み取り・検索はgetXxxにおける副作用に含めない（標準的なパターン）
- 副作用とは: 書き込み、削除、通知送信、外部API呼び出し（変更系）、ログ出力など、呼び出し元が予期しない外部への影響を指す`,
            include: { source: true },
          }),
        ),
    ),
};

export default definition;
