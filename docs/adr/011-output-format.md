# ADR-011: 出力フォーマット

**日付:** 2025-03  
**ステータス:** 決定

## 背景

codepolicyの出力フォーマットを決定する。利用者は人間（ターミナル確認・CIログ）とAI（他ツールやLLMによる結果の読み取り）の両方を想定する。

## 決定

**`--format pretty`（デフォルト）と `--format json` の2本柱。**

## 出力フォーマット

### pretty（デフォルト）

```
src/domain/user.ts:12  warn  [function-contract score:42]
  getUserById() の内部でログ書き込みが行われています。副作用のない命名と矛盾します。

src/domain/order.ts:34  error  [layer-responsibility score:28]
  Repositoryの実装がドメインロジックを含んでいます。

✖ 2 problems (1 error, 1 warning)
```

- 1行目: `ファイル:行  severity  [rule-id score:N]`
- 2行目: `reason`（インデント付き）
- 末尾にサマリー

### json

```json
{
  "summary": {
    "errors": 1,
    "warnings": 1
  },
  "results": [
    {
      "file": "src/domain/user.ts",
      "line": 12,
      "severity": "warn",
      "rule": "function-contract",
      "score": 42,
      "reason": "getUserById() の内部でログ書き込みが行われています。副作用のない命名と矛盾します。"
    }
  ]
}
```

## exit code

| 状態 | exit code |
|------|-----------|
| 問題なし | 0 |
| warnのみ | 0 |
| errorあり | 1 |
| 実行エラー（設定不正・API障害等） | 2 |

- warnはCIをブロックしない。`error` のみ失敗扱いにする
- 実行エラーは lint結果とは分けて exit code 2 で区別する

## MVPスコープ外

- `--format sarif`（GitHub Actions Code Scanning連携）: 将来対応
- `--format compact`（1行形式）: 必要になったら追加

## 設計方針

- **人向け**: ファイル・行・スコア・reasonが一目でわかるruff風のレイアウト
- **AI向け**: `reason` フィールドに自然言語で完結した説明を持たせ、JSONとしてそのまま読める構造にする。`score` を含めることでAIが「どのくらい怪しいか」を判断材料にできる

## 参考

- `ruff` — `ファイル:行:列` を一行で完結させるレイアウト
- `eslint --format json` — ファイル・行・severity・message・ruleIdが揃った構造
- `actionlint` — 「なぜ違反か」まで含むメッセージ設計
