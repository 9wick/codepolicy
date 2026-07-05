import { okAsync } from 'neverthrow';

import type { RuleDefinition } from '../rule-types';

const definition: RuleDefinition = {
  meta: {
    scope: 'exported-function',
    usesFileTree: true,
  },
  create: () =>
    okAsync((ctx) =>
      ctx.llm.judge({
        criteria: `以下のエクスポートされた関数が、現在のファイルに適切に配置されているかを検証してください。

## この rule が見たいこと
- 関数の責務とファイル/ディレクトリの命名規則が一致しているか
- プロジェクトのアーキテクチャ構造（ディレクトリ階層）に照らして、この関数が正しいレイヤーにいるか
- 同一ファイル内の他の関数（ファイルパスから推測される責務）と凝集度があるか

## 違反として重く見る例
- 関数の責務とファイル/ディレクトリの命名規則が明らかに食い違っている
- アーキテクチャ上のレイヤー（ディレクトリ階層）と関数の責務が一致しない
- 同一ファイル内の他の関数と責務上の関連性がなく、凝集度が低い

## 違反として扱わないもの
- より良い置き場所が理論上ありうる程度の、軽微な最適化余地
- ファイル名と関数名が表面上一致しないだけで、責務としては妥当な配置

## 判定時の注意
- 「もっと良い場所があるかもしれない」程度では違反にせず、明らかな配置の誤りだけを違反とすること

## PASS すべき境界例
\`\`\`typescript
// file: src/orders/order-utils.ts
export function isOrderCancellable(order: Order): boolean {
  return order.status === 'pending';
}
\`\`\`
ファイル名と関数名が表面上一致しないだけで、注文ドメインのレイヤーとしては妥当な配置のためPASSする

\`\`\`typescript
// file: src/shared/date-format.ts
export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
\`\`\`
より良い置き場所が理論上ありうる程度の軽微な最適化余地に過ぎないためPASSする`,
        include: { source: true, signature: true, name: true, filePath: true, fileTree: true },
      }),
    ),
};

export default definition;
