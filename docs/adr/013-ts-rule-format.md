# ADR-013: TypeScript ルール定義フォーマット

## ステータス

承認済 — ADR-008（Markdown ルール定義）を置換

## コンテキスト

ADR-008 で採用した Markdown + YAML frontmatter 形式のルール定義は、単純な単一プロンプト評価には適していたが、以下の要件に対応できなかった：

- LLM の複数回呼び出し（マルチターン判定）
- カスタムロジック（AST 操作＋LLM 判定の組み合わせ）
- ルール単位のテスタビリティ（LLM モックによるユニットテスト）
- コンテキスト情報（filePath、source 等）の柔軟な制御

## 決定

ルール定義を TypeScript で実装する `RuleDefinition` 形式に移行する。

### Rule インターフェース

```typescript
type RuleMeta = { scope: RuleScope; agent: string; threshold: number };
type RuleCreateFn = (ctx: RuleContext) => ResultAsync<LlmScore, Error>;
type RuleDefinition = { meta: RuleMeta; create: RuleCreateFn };
type RuleModule = { id: string; definition: RuleDefinition };
```

### LlmHelper

`RuleContext` に注入される `llm` ヘルパーが、プロンプト構築と LLM 呼び出しを担当する。

```typescript
type LlmEvaluateOptions<Schema extends TSchema> = {
  prompt: string;
  include?: { filePath?: boolean; source?: boolean; scopeType?: boolean; name?: boolean };
  responseFormat: Schema;
};
```

### ルール実装例

```typescript
const definition: RuleDefinition = {
  meta: { scope: 'function', agent: 'claude', threshold: 70 },
  create: (ctx) =>
    ctx.llm.evaluate({
      prompt: 'この関数の名前と実装の整合性をチェック...',
      include: { source: true, filePath: true, name: true },
      responseFormat: llmScoreSchema,
    }),
};
```

### ビルトインルール

ルールは `src/rules/builtin-rules.ts` にレジストリとして登録される。

## 帰結

- ルール定義が TypeScript の型システムで保護される
- マルチターン LLM 呼び出しが `andThen` チェーンで自然に記述可能
- `RuleTester` による LLM モックテストが可能
- Markdown パーサー、frontmatter パーサー、ルールディレクトリ解決が不要になった
