import { okAsync } from 'neverthrow';

import { llmScoreSchema } from '../../shared/schema-definitions';
import type { RuleDefinition } from '../rule-types';

const definition: RuleDefinition = {
  meta: { scope: ['type', 'interface'], threshold: 70 },
  create: () =>
    okAsync((ctx) =>
      ctx.llm.evaluate({
        prompt: `以下の type / interface 定義が「no invalid state type」の原則に違反していないかを検証してください。

## この rule が見たいこと
- この型が、不正な状態や未検証状態をそのまま表現できてしまわないか
- 型の利用者が、値を作れた時点で「妥当な状態だ」と誤解してしまう設計になっていないか
- 未確定状態を表す型が、そのまま completed / validated / normalized 済みの型として主要処理に入っていないか

## 違反として重く見る観点
- 必須な属性が optional/nullish になっていないか
- 複数フィールド間の整合制約を型で表現できていないか
- 生の primitive だけで意味の違う値を混同できないか
- 中間状態や未検証状態を、完成済みの型として表現していないか

## 違反例
- 必須なのに \`foo?: string\` や \`foo: string | null\` で欠損を許す
- \`status\` と \`shippedAt\` のように相互制約があるのに、単一interfaceで矛盾した組み合わせを許す
- \`UserId\`, \`EmailAddress\`, \`Money\` など意味が異なる値を、ただの \`string\` / \`number\` で混同できる
- \`DraftUser\` や \`UnvalidatedOrder\` のような中間状態を、完成済みの \`User\` / \`Order\` と同じ型で表す

## 高評価の条件
- 型を生成できる時点で、妥当な状態だけを表現できる
- 必要なら判別共用体やネストした型で整合制約を表している
- 意味の違う値は、少なくとも型レベルで区別する意図がある
- 未確定状態を表す型が存在する場合でも、それは入力途中・検証前・正規化前の型として閉じ込められている

## 判定時の注意
- 未確定状態を表す型自体は必ずしも違反ではない
- ただし、その型が completed / validated / normalized 済みのものとして扱われるなら違反として重く見ること
- application/domain の主要処理に入る時点では、型は正規化済みであるべきという観点で判定すること
- 単に primitive を使っているだけで自動的に違反にしないこと。意味の取り違えが現実的に起きるかを重視すること
- 構文ではなく、「この型が不正状態を表現可能か」を判定すること`,
        include: { source: true, filePath: true, name: true, scopeType: true },
        responseFormat: llmScoreSchema,
      }),
    ),
};

export default definition;
