## ADR-005: LLM連携SDKの選定

**日付:** 2025-03
**ステータス:** 決定

### 背景

codepolicyのコアであるLLMによるコードチェックを実装するためのSDKを選定する。

### 議論した選択肢

**Anthropic TypeScript SDK（`@anthropic-ai/sdk`）**
- 公式SDKでメンテナンスが安定している
- TypeScriptとの親和性が高い
- agentフィールドで将来的に他モデルへのルーティングも想定しているが、まずClaudeをデフォルトとする

**OpenAI SDK・その他**
- 複数モデル対応を最初から考えるなら選択肢になるが、初期実装では不要

### 決定

**`@anthropic-ai/sdk`を採用する。**

### 理由

言語選定（ADR-001）でTypeScriptを選んだ決定的な理由の一つがこのSDKの存在であり、採用は自明。将来的に他モデル対応が必要になった場合はadapterパターンで抽象化する。
