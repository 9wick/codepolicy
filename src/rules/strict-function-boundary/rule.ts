import { okAsync } from 'neverthrow';

import { llmScoreSchema } from '../../shared/schema-definitions';
import type { RuleDefinition } from '../rule-types';

const definition: RuleDefinition = {
  meta: { scope: 'function', threshold: 70 },
  create: () =>
    okAsync((ctx) =>
      ctx.llm.evaluate({
        prompt: `以下の関数が「strict function boundary」の原則に違反していないかを検証してください。

## この rule が見たいこと
- 関数が、契約として曖昧な入力/出力を受け入れたまま business/application decision を行っていないか
- 呼び出し側が曖昧な値を渡したり、曖昧な結果を受け取ったまま先に進めてしまう設計になっていないか
- application/domain の主要処理に入る時点で、入力がすでに normalized / validated 済みになっているか

## 違反として重く見る例
- application service / use case / domain logic がオプショナル引数や \`undefined\` を受けたまま処理を進める
- business/application decision を行う関数が \`Partial<T>\` や広すぎる union 型を受け入れる
- 成功系の戻り値なのに \`Foo | null\` や \`Result | undefined\` のような曖昧な返り値で、呼び出し側に業務判断を押し戻す
- 関数の契約が広すぎるために、内部で前提確認や分岐が増えている
- application/domain の主要処理が、外側入力の optional 値を \`??\` や default 引数で確定している
- normalized されるべき execution option や設定入力を、境界で閉じずに内部へ持ち込んでいる

## 違反として扱わないもの
- parser helper / AST traversal / lookup helper のように、「見つからない」を \`null\` や \`undefined\` で返すこと自体が自然な関数
- collection search や name extraction のような探索系 utility
- 単なるデータ変換・補助関数で、business/application decision を担っていないもの

## 高評価の条件
- business/application decision を担う関数の引数と返り値が、その責務に対して具体的で最小限である
- 曖昧な状態を契約に持ち込まず、必要ならより外側で正規化・分岐済みである
- application/domain の主要処理は、境界で確定済みの入力だけを受け取り、内部で optional 値の意味づけをしない

## 判定時の注意
- 構文パターンだけでなく、関数の責務を見ること
- 単に union 型や nullable があるだけでは違反にしないこと
- 「探索結果の不在」と「契約の曖昧さ」を区別し、後者だけを減点すること`,
        include: { source: true, signature: true, filePath: true },
        responseFormat: llmScoreSchema,
      }),
    ),
};

export default definition;
