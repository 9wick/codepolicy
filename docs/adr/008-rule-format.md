> **注意:** この ADR は [ADR-013](./013-ts-rule-format.md)（TypeScript ルール定義フォーマット）により置換されました。

# ADR-008: ルールファイルのフォーマット

**日付:** 2025-03
**ステータス:** 決定

### 背景

codepolicyのルール本体のフォーマットを決定する。ルールはコミュニティが追加・共有できるエコシステムを想定している。

### 決定

**Markdownファイル（frontmatterあり）を採用する。**

### ルールファイルの構造

```markdown
---
scope: function
agent: claude
threshold: 70
---

関数名と引数から想定できる処理以外をやっていないかチェック。
副作用の有無と命名が一致しているかも確認する。
```

### ファイル配置とid

```
rules/
  function-contract.md       # id: function-contract
  layer-responsibility.md    # id: layer-responsibility
  domain/
    ssot-violation.md        # id: domain/ssot-violation
```

- **id = ファイル名**（拡張子なし）
- 階層構造は `{folder}/{name}` 形式で表現
- 将来的にルールセットパッケージが増えた場合も同じ命名規則で対応できる

### frontmatterのフィールド

| フィールド | 説明 |
|-----------|------|
| `scope` | LLMに渡すコードの単位（function / file / function+d.ts 等） |
| `agent` | 使用するLLMモデル（拡張性のために明示） |
| `threshold` | fail判定のデフォルトスコア閾値（設定ファイル側で上書き可） |

### 理由

- Markdownにすることで、promptを自然な文章として書ける。複数行・長文になっても読みやすい
- frontmatterでメタデータを分離することで、promptとの混在を防げる
- Claude CodeのSKILL.mdやtaktのagent定義など、同様のパターンが実績を持つ
- id = filenameにすることで、設定ファイルとの対応が直感的になる
