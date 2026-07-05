import { okAsync } from 'neverthrow';

import type { RuleDefinition } from '../rule-types';

const CRITERIA = `以下の関数が「標準的なコード」だけで書かれているかを検証してください。

## 前提
- ランタイム: 最新LTS Node.js / モダンブラウザ (ES2024+)
- TypeScript: 5.x 以降
- 最新の標準APIが利用可能であることを前提とする

## この rule が見たいこと
- 構文・イディオム: 暗黙の型変換や特殊な演算子の使用
- API選択: 同じ結果を得られるよりメジャーなAPIがあるか
- 制御フロー: 不必要な再帰、過剰に複雑なチェーン、意図が読み取りにくい分岐
- 危険なAPI使用: セキュリティリスクや予期せぬ副作用があるAPI

## 違反として重く見る例
- 任意コード実行（eval, Functionコンストラクタ）
- 暗黙の型変換、ビット演算hack
- delete によるオブジェクト形状の動的破壊
- 不必要に複雑な制御フローで、意図が読み取りにくい分岐

## 違反として扱わないもの
- 動作・型安全性に問題がなく、より一般的な書き方が存在する程度の軽微な非慣用
- コメントで正当化されている場合でも、上記「違反として重く見る例」に該当するなら違反として扱う（コメントは免罪符にならない）

## 「標準的なコード」の定義
- 読んだ開発者の90%が最初に思いつく書き方である
- その言語/ランタイムの公式ドキュメントで推奨されている方法である
- 特別な前提知識なしに意図が読み取れる

## PASS すべき境界例
\`\`\`typescript
function lastElement<T>(items: T[]): T | undefined {
  return items.at(-1);
}
\`\`\`
動作・型安全性に問題のない軽微な非慣用に過ぎないためPASSする

\`\`\`typescript
function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
\`\`\`
for ループの方が一般的だが、動作・型安全性に問題のない軽微な非慣用に過ぎないためPASSする`;

const definition: RuleDefinition = {
  meta: { scope: 'function' },
  create: () =>
    okAsync((ctx) =>
      ctx.llm.judge({
        criteria: CRITERIA,
        include: { source: true, filePath: true },
      }),
    ),
};

export default definition;
