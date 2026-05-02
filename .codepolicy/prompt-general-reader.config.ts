import { Type } from '@sinclair/typebox';
import { okAsync } from 'neverthrow';

import type { RuleModule } from 'codepolicy';

const PROMPT_PATTERN = /prompt:\s*`((?:\\`|[\s\S])*?)`/g;

const promptReviewSchema = Type.Object(
  {
    pass: Type.Boolean(),
    reason: Type.String({ minLength: 1 }),
    unnaturalSignals: Type.Array(
      Type.Object(
        {
          phrase: Type.String({ minLength: 1 }),
          why: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
      { maxItems: 5 },
    ),
  },
  { additionalProperties: false },
);

export function extractPromptTexts(source: string): string[] {
  return [...source.matchAll(PROMPT_PATTERN)].flatMap((match) => {
    const text = match[1]?.trim();
    return text ? [text] : [];
  });
}

function buildPromptBody(prompts: string[]): string {
  return prompts.map((prompt, index) => `### Prompt ${index + 1}\n${prompt}`).join('\n\n');
}

function buildReviewPrompt(promptBody: string): string {
  return `以下は codepolicy の rule 実装から抽出した prompt 文面です。
この prompt を、あなたが知らない任意の product codebase（EC、SaaS、社内ツールなど）に適用すると想像してください。
prompt 内の carve-out・具体例・判定手順は、その product codebase のコードレビューとして自然に読めますか？
「概念の判定であって単語の blacklist ではない」ことを厳守してください。

## pass の条件
- carve-out・具体例・判定手順のすべてが、一般的な product code のレビューとして自然に読める
- 設計思想やアーキテクチャ用語（domain / application / adapter / 腐敗防止層 / validation / normalization など）の使用は許容
- TypeScript / ecosystem 固有の広く知られた用語（TypeDoc など）の使用は許容
- 対象 project 自身のファイル配置・命名規則・アーキテクチャ規約への言及は許容
- DraftUser / UnvalidatedOrder / completed / validated / normalized のような、ドメインモデリングの説明として理解できる語は許容

## fail の条件
- carve-out の分類が、一般的な product code の責務分類ではなく、lint / parser / analyzer の作者の作業分類になっている
- 具体例が、一般的な利用者プロジェクトではなく、lint ツール実装で自然に現れるコード分類に寄っている
- 判定手順が「推測してから比較する」「配置から意味を逆算する」など、LLM lint の実装都合から出た手順を要求している
- 表現を正しく理解するには、対象 project ではなく codepolicy 側の都合や checker の設計意図を知っている必要がある

## 判定時の注意
- 単語レベルではなく、文脈レベルで判定すること
- 用語の知名度ではなく、その用語が carve-out として使われている文脈が一般 product code のレビューとして自然かどうかを問うこと
- 設計思想そのものは fail にしないこと。ただし、その思想に属さない codepolicy 固有の語や前提は fail にすること
- 問題にするのは「対象 project の文脈」ではなく、「codepolicy repo / checker 作者側の文脈」である

## 出力
- pass: この prompt の carve-out・具体例・判定手順が一般 product code のレビューとして自然かどうか
- unnaturalSignals: fail の場合、不自然な carve-out・具体例を最大 5 個まで列挙
  - phrase: prompt 中の実際の表現を短く抜き出すこと
  - why: 不自然な理由
- reason: 判定理由の要約

## 対象 prompt 文面
${promptBody}`;
}

function formatReviewReason(review: {
  reason: string;
  unnaturalSignals: { phrase: string; why: string }[];
}): string {
  if (review.unnaturalSignals.length === 0) {
    return review.reason;
  }

  const signals = review.unnaturalSignals
    .map((signal) => `${signal.phrase} (${signal.why})`)
    .join(', ');
  return `${review.reason} Signals: ${signals}`;
}

const promptGeneralReaderRule: RuleModule = {
  id: 'prompt-general-reader',
  definition: {
    meta: { scope: 'file', agent: 'claude-sonnet-4-6', threshold: 80 },
    create: (ctx) => {
      const prompts = extractPromptTexts(ctx.source);
      if (prompts.length === 0) {
        return okAsync({ score: 100, reason: 'No rule prompt found in this file.' });
      }
      const promptBody = buildPromptBody(prompts);

      return ctx.llm
        .evaluate({
          prompt: buildReviewPrompt(promptBody),
          include: { filePath: true },
          responseFormat: promptReviewSchema,
        })
        .map((review) => ({
          score: review.pass ? 100 : 0,
          reason: formatReviewReason(review),
        }));
    },
  },
};

export default promptGeneralReaderRule;
