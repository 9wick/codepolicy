## ADR-001: 実装言語の選定

**日付:** 2025-03
**ステータス:** 決定

### 背景

codepolicyのコア実装言語を選定する。主な候補はRust・TypeScript・Go・Pythonだった。

### 議論した選択肢

**Rust**
- シングルバイナリ配布が容易（`cargo install`）
- tree-sitterがRustネイティブで動く
- similarityと同様のアーキテクチャが取れる
- ただしAnthropicの公式SDKが存在しない（自前実装 or 非公式クレートが必要）
- LLM連携がコアになるツールでSDKがないのは大きなデメリット
- Rustを書くコスト・デバッグコストが高い

**TypeScript（Node.js / Bun）**
- AnthropicのSDKが公式で最も充実している
- ts-morphでTypeScriptのAST・d.ts取得が完結する
- tree-sitterのNode.jsバインディングが成熟しており他言語にも対応できる
- `bun build --compile`でシングルバイナリ配布も可能
- Claude Codeで実装する際に、ライブラリのドキュメント・サンプルがLLMの学習データに豊富に含まれており迷わず書ける
- npmパッケージとしても配布でき、`npx codepolicy`でも動く

**Go / Python**
- 技術的には実現可能だが、「作りたくない部分を減らす」という優先度で外れた
- GoはLLM SDK周りが弱い
- PythonはTSのd.ts相当の取得が辛い

### 決定

**TypeScript（Bun）を採用する。**

### 理由

ボトルネックがLLMとの通信にあるため、実行速度でのRustのアドバンテージが活きない。一方でAnthropicの公式TypeScript SDKが使えること、ts-morphでd.tsが取れること、Claude Codeで実装する際の扱いやすさ、の3点がTypeScriptを選ぶ決定的な理由となった。バイナリ配布はBunで解決できるため、Rustを選ぶ理由がなくなった。
