# ADR-010: CLIコマンド体系

**日付:** 2025-03  
**ステータス:** 決定

## 背景

codepolicyのCLIコマンド体系を決定する。利用シーンはCIでの自動実行とローカルでのデバッグの2つが主要。

## 決定

**`codepolicy` 直打ちでlint実行。サブコマンドは `rule` のみ。**

## コマンド一覧

### lint実行

```sh
codepolicy [path...]             # lint実行（引数なしでカレントディレクトリ）
codepolicy --filter all          # 全ファイルを対象
codepolicy --filter diff         # 差分のみ（CI向け）
codepolicy --rule <id>           # 特定ルールのみ実行
```

- `path` を指定した場合はそのファイル・ディレクトリのみを対象にする
- `--filter` は `.codepolicy.yml` の `filter` 設定を上書きする
- `--rule` はデバッグ用途。特定ルールに絞って動作確認できる

### ruleサブコマンド（デバッグ用）

```sh
codepolicy rule list                          # 有効なルール一覧を表示
codepolicy rule show <id>                     # ルールの詳細（prompt・threshold等）を表示
codepolicy rule run <id> <file>               # 特定ルールを特定ファイルに単体実行
codepolicy rule run <id> <file> --verbose     # LLMに渡したpromptとraw responseを表示
```

`--verbose` の出力例：

```
=== PROMPT ===
<LLMに渡したプロンプト全文>

=== RESPONSE ===
<LLMのraw response>

=== PARSED ===
{"score": 42, "reason": "..."}
```

### 設定系

```sh
codepolicy init        # .codepolicy.ymlを対話形式で生成
codepolicy validate    # 設定ファイルの構文チェック
```

## 議論した選択肢

**`codepolicy run` サブコマンド方式**
- `codepolicy run --filter diff` のように明示的
- `eslint .` や `tsc` など、ツール名直打ちが主流のlint系CLIと乖離する

**`codepolicy` 直打ち方式（採用）**
- `eslint`・`tsc`・`ruff` と同じ使い勝手
- CI設定ファイルへの記述がシンプルになる

## 理由

- lint系ツールは `eslint .` `tsc` のようにツール名直打ちが慣習。`codepolicy run` は冗長
- `rule` サブコマンドはデバッグ用途として必要。特に `rule run --verbose` はLLMへの入出力を直接確認できるため、ルール作成時に不可欠
- `init` / `validate` は補助コマンドとして割り切り、サブコマンド扱いにする
