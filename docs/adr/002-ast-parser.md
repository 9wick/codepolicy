## ADR-002: ASTパーサーの選定（TypeScript以外の言語）

**日付:** 2025-03
**ステータス:** 決定

### 背景

codepolicyはTypeScript以外の言語（Go・Ruby・Python・Rust・PHP等）にも対応する必要がある。各言語のASTを取得するためのライブラリを選定する。

### 議論した選択肢

**言語ごとに専用パーサーを使う**
- 精度は高いが、言語ごとに異なるライブラリ・インターフェースを管理するコストが高い
- メンテナンスが困難になる

**tree-sitter（Node.jsバインディング: `node-tree-sitter`）**
- 多言語対応のASTパーサーフレームワーク
- TypeScript・Python・Go・Rust・Ruby・PHP等、主要言語に対応した文法定義が公開されている
- Node.jsバインディングが成熟しており、TypeScriptから統一的なAPIで各言語のASTが取れる
- similarityもRust版のtree-sitterを使用しており、実績がある

### 決定

**tree-sitter（`node-tree-sitter`）を採用する。**

### 理由

Node.jsバインディングが成熟していること、主要言語をほぼカバーしていること、統一的なAPIで各言語のextractorを実装できることが決め手。言語ごとに文法パッケージ（`tree-sitter-typescript`・`tree-sitter-python`等）を追加するだけで対応言語を拡張できる。
