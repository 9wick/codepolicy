import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { okAsync } from 'neverthrow';

import type { LlmScore } from '../../shared/types';
import type { RuleDefinition } from '../rule-types';

const findingSchema = Type.Object(
  {
    code: Type.String({
      minLength: 1,
      description: '検出した非標準コード',
    }),
    standard: Type.String({
      minLength: 1,
      description: '標準的な書き方',
    }),
    score: Type.Integer({
      minimum: 0,
      maximum: 100,
      description: 'この非標準パターンのスコア（0が最も悪い）',
    }),
    reason: Type.String({
      minLength: 1,
      description: '判定理由',
    }),
  },
  { additionalProperties: false },
);

const findingsResponseSchema = Type.Object(
  {
    findings: Type.Array(findingSchema, {
      description: '検出された非標準パターンの一覧。なければ空配列。',
    }),
  },
  { additionalProperties: false },
);

type FindingsResponse = Static<typeof findingsResponseSchema>;

function toScore(response: FindingsResponse): LlmScore {
  if (response.findings.length === 0) {
    return { score: 100, reason: '非標準なコードは検出されませんでした' };
  }
  const score = Math.min(...response.findings.map((f) => f.score));
  const reason = response.findings
    .map((f) => `${f.code} → ${f.standard} (${f.score}点: ${f.reason})`)
    .join('\n');
  return { score, reason };
}

const PROMPT = `以下の関数が「標準的なコード」だけで書かれているかを検証してください。

## 前提
- ランタイム: 最新LTS Node.js / モダンブラウザ (ES2024+)
- TypeScript: 5.x 以降
- 最新の標準APIが利用可能であることを前提とする

## 「標準的なコード」の定義
- 読んだ開発者の90%が最初に思いつく書き方である
- その言語/ランタイムの公式ドキュメントで推奨されている方法である
- 特別な前提知識なしに意図が読み取れる

## 検証の対象レベル
- 構文・イディオム: 暗黙の型変換や特殊な演算子の使用
- API選択: 同じ結果を得られるよりメジャーなAPIがあるか
- 制御フロー: 不必要な再帰、過剰に複雑なチェーン、意図が読み取りにくい分岐
- 危険なAPI使用: セキュリティリスクや予期せぬ副作用があるAPI

## 重要なルール
- コメントで正当化されていてもダメ。非標準は非標準。
- 「動く」ことは免罪符にならない。標準的な方法で同じことが達成できるなら、そちらを使うべき。
- hackを正当化する理由は存在しない。

## スコアリング基準
- 0点: 任意コード実行（eval, Functionコンストラクタ）
- 20-40点: 暗黙の型変換、ビット演算hack、オブジェクト形状の動的破壊（delete）
- 50-70点: 非慣用的なAPI選択（Object.assign等）、不必要に複雑な制御フロー
- 80-90点: 軽微な非標準（動作・型安全性に問題はないが、より一般的な書き方がある）
- findingsがない場合は空配列を返してください`;

const definition: RuleDefinition = {
  meta: { scope: 'function', threshold: 70 },
  create: () =>
    okAsync((ctx) =>
      ctx.llm
        .evaluate({
          prompt: PROMPT,
          include: { source: true, filePath: true },
          responseFormat: findingsResponseSchema,
        })
        .map(toScore),
    ),
};

export default definition;
