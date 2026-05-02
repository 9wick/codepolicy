# ADR-007: 設定ファイルのフォーマット

**日付:** 2025-03
**ステータス:** 決定

### 背景

codepolicyの設定ファイルのフォーマットと構造を決定する。

### 決定

`.codepolicy.yml`（YAMLまたはJSON、どちらでも可）を採用する。

### 設定ファイルの構造

```yaml
filter: diff  # global設定。diff / all / path

rules:
  function-contract: error
  layer-responsibility:
    level: warn
    threshold: 75

overrides:
  - files:
      - src/domain/**
      - src/usecase/**
    rules:
      layer-responsibility: error

ignore:
  - src/generated/**
  - "**/*.test.ts"
```

### 決定した内容

- **ファイル形式**: YAML / JSON どちらでも可（利用者の好みに合わせる）
- **ルールのデフォルト**: off（ホワイトリスト方式）。明示的に書いたものだけ有効
- **レベル**: `error` / `warn` / `off`
- **threshold**: 設定側で上書き可能。ルール本体のデフォルト値を上書きする
- **適用パスの制御**: overridesパターン（ESLint flat configと同様のglobベース）
- **filter**: global設定。個別ルールではなく実行環境単位で制御する（CIでは`diff`、ローカルでは`all`など）
- **ignore**: gitignoreライクなglobパターンで除外

### 理由

- YAML / JSON両対応にすることで、利用者が好みの形式を選べる
- ホワイトリスト方式にすることで、意図しないルールの適用を防げる
- overridesパターンはESLintで実績があり、DDDのレイヤー構造（domain / usecase / infrastructure）との相性が良い
- filterをglobalにするのは、CIかローカルかという実行環境の違いがルール単位ではなく実行単位の関心事であるため
