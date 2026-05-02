# ADR-009: LLMレスポンスのフォーマットと解析方法

**日付:** 2025-03
**ステータス:** 決定

### 背景

LLMからのレスポンスをどのフォーマットで受け取り、どう解析するかを決定する。

### 議論した選択肢

**キーワード方式（taktパターン）**
```
SCORE: 42
REASON: getUserById()の実装内部でログ書き込みが行われています
```
- シンプルで安定する
- 将来的にフィールドを増やしたいときに辛くなる

**tool_use（Anthropic API）**
- 構造が保証される
- モデルがtoolを呼ばずにテキストで返すことがあり不安定
- `tool_choice: required`で強制できるが完全ではない

**JSON（末尾パース）**
```json
{"score": 42, "reason": "getUserById()の実装内部でログ書き込みが行われています"}
```
- 将来的にフィールドを増やせる
- プロンプトで「最後にJSONを出力」と指示することでパースが安定する

### 決定

**JSONフォーマットを採用し、レスポンス末尾から`{`を探してパースする。**

### プロンプト側の指示

```
必ず最後にJSON形式で結果を出力してください：
{"score": <0-100の数値>, "reason": "<理由>"}
```

### パース処理

```typescript
const lastBrace = response.lastIndexOf('{')
const jsonStr = response.slice(lastBrace)
const result = JSON.parse(jsonStr)
```

### 現時点のレスポンス構造

```json
{
  "score": 42,
  "reason": "getUserById()の実装内部でログ書き込みが行われています"
}
```

将来的に追加を想定しているフィールド例：
- `violations`: 違反の箇条書きリスト
- `suggestion`: 修正の提案

### 理由

- tool_useは呼び出しが不安定になるリスクがある
- キーワード方式はシンプルだが、フィールド追加の拡張性が低い
- JSONは将来のフィールド追加に対応しやすく、末尾パースで安定して取得できる
- Claudeは「最後にJSONを出力」という指示に従う傾向が強い
