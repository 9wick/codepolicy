import { okAsync } from 'neverthrow';

import { llmScoreSchema } from '../../shared/schema-definitions';
import type { RuleDefinition } from '../rule-types';

const definition: RuleDefinition = {
  meta: {
    scope: 'exported-function',
    threshold: 70,
    usesFileTree: true,
  },
  create: () =>
    okAsync((ctx) =>
      ctx.llm.evaluate({
        prompt: `以下のエクスポートされた関数が、現在のファイルに適切に配置されているかを評価してください。

## 評価観点
1. **責務の一致**: 関数の責務とファイル/ディレクトリの命名規則が一致しているか
2. **レイヤーの適切さ**: プロジェクトのアーキテクチャ構造（ディレクトリ階層）に照らして、この関数が正しいレイヤーにいるか
3. **凝集度**: 同一ファイル内の他の関数（ファイルパスから推測される責務）と関連性があるか

## 判定基準
- 90-100: 完全に適切な配置
- 70-89: 概ね適切だが、より良い場所がありうる
- 40-69: やや不適切。別のファイル/ディレクトリが自然
- 0-39: 明らかに不適切な配置`,
        include: { source: true, signature: true, name: true, filePath: true, fileTree: true },
        responseFormat: llmScoreSchema,
      }),
    ),
};

export default definition;
