import { okAsync } from 'neverthrow';

import type { RuleDefinition } from '../rule-types';

const definition: RuleDefinition = {
  meta: { scope: 'function' },
  create: () =>
    okAsync((ctx) =>
      ctx.llm.judge({
        criteria: `以下の関数が「no implicit fallback」の原則に違反していないかを検証してください。

## この rule が見たいこと
- 欠損や不正状態を黙って「業務上妥当な値」に変換して先へ進めていないか
- 呼び出し側へ失敗や未確定状態を返すべきところで、都合のよい既定値にすり替えていないか
- 外側入力の未指定値に意味を与える正規化を、application/domain の主要処理が抱え込んでいないか

## 違反として重く見る例
- 申込なしを \`guest\` にする、未設定金額を \`0\` にする、未入力状態を \`default status\` にするなど、業務上意味のある値へ補完する
- 例外や不正値を握りつぶして、成功扱いの既定値を返す
- 欠損を補完した結果、その後の business/application decision が継続できてしまう

## 違反として扱わないもの
- 単なる検索・照会・参照取得の補助関数における「見つからなければ null」
- debug/logging/display のための軽微な既定値
- 単なる表現上の整形であり、業務上の意味を変えないもの

## 違反ではない設計
- 前提を満たさない場合は、明示的に失敗させるか未確定状態として返している
- 欠損や不正を、業務上有効な値にすり替えていない
- fallback があっても、それが business/application decision に影響しない
- 外側入力の未指定値は、主要処理に入る前のプレゼン層・adapter 層・腐敗防止層などで正規化されている

## 判定時の注意
- \`??\`, \`||\`, default 引数の有無だけで機械的に違反にしないこと
- 構文ではなく、「欠損/不正を業務上妥当な値へ変換しているか」で判定すること
- 表示用整形や探索結果の不在表現と、外側入力の正規化を区別すること
- 外側入力の未指定値に意味を与える処理は、プレゼン層・adapter 層・腐敗防止層などで済ませるべきであり、application/domain の主要処理に持ち込むべきではない
- application/domain の主要処理で \`??\` や default 引数などにより入力を確定させている場合は、たとえ制御用入力であっても違反になりうる

## PASS すべき境界例
\`\`\`typescript
function formatAmount(amount: number | undefined): string {
  return amount != null ? String(amount) + '円' : '-';
}
\`\`\`
表示用の整形であり業務上の意味を変えないため、「debug/logging/display のための軽微な既定値」としてPASSする

\`\`\`typescript
function findUserById(id: string, users: User[]): User | null {
  return users.find((u) => u.id === id) ?? null;
}
\`\`\`
検索・照会の補助関数であり、「見つからなければ null」はPASSする`,
        include: { source: true, signature: true, filePath: true },
      }),
    ),
};

export default definition;
