# 共通キャッシュ復旧の検証

通常lint・`rule run` のtext/Jevを同じ `RuleEvaluationService` → `EvalCacheService` → `CacheStore` に接続した。Jevのearly return、5ルールの固定 `cacheable:false`、CLIの直接評価、未使用の `runDecisionFile` を撤去した。

## 検証結果

実API呼び出し: 0回。推論はmockし、永続化はテスト専用の一時ディレクトリで確認した。

| コマンド | 結果 |
| --- | --- |
| `bun run test src/application/rule-execution/decision-pipeline.test.ts src/cli/commands/jev-rule-run.test.ts src/rules/decision-rules.test.ts`（変更前） | 新契約に対して4件失敗。キャッシュ未使用・固定無効化を再現 |
| `bun run test src/test-support/poc-evaluator.test.ts`（測定経路変更前） | 共通評価を利用していないことを新テストで検出 |
| `bun run test src/cli/entry-cache.test.ts src/application/rule-execution/eval-cache.service.test.ts` | 14件成功。実CLIからの無効化指定と旧キー互換を確認 |
| `NODE_OPTIONS=--max-old-space-size=4096 bun prepush` | 成功。format/typecheck/lint/build/内部テスト44ファイル383件、検証ハッシュ保存まで完了 |
| `bun run dev --help` / `bun run dev rule run --help` | 成功。両方に `--no-cache` を表示 |
| `git diff --check` | 成功 |

途中の全体lintはNode既定ヒープ上限で停止した。4GB設定で再実行した。import順序の違反も修正し、検査やhookを無効化せず全項目を通した。

未検証: 実APIでの再実行、ルール精度・速度の比較測定。課金を避けるため今回実行しない。

## 契約との照合

- 通常lint・`rule run` とも、同一入力の再実行で評価を省略する。Jevと `rule run` は新しいcontainerでもディスクから再利用する。
- `--no-cache` は既存entryがあっても評価し、storeの照会・保存はともに0回。
- CLIパーサーは `--no-cache` を `cache:false` として返す。従来の `args['no-cache']` を修正し、両コマンドで共通のboolean定義を使用する。helpには有効化側の `--cache` も表示される。`--disable-cache` は追加しない。
- Jevの質問ID/本文/順序・表示ラベル・include・閾値をruleVersionへ反映する。使用するfileTree、コード、モデルなどは共通キーに反映する。
- 通常lintの旧textキーは固定ハッシュ値との比較で互換を確認。旧text保存形式も読み込める。fileモードは抽出scopeと区別する。
- Jev生値・閾値・要求/応答モデルを既存storeに保持する。hitでは今回のusageを0にし、verboseで保存済み生値とhitを識別できる。
- 評価失敗は保存しない。読込エラーは伝播、破損は警告して再評価、保存エラーは警告して評価結果を返すという従来契約を維持する。
- 比較測定も同じ評価処理へ接続し、`noCache:true` を明示する。測定レコードの形式は維持する。

## 目的達成・構造の確認

目的は、PoCで同じ入力を繰り返し試す際の不要な推論を避けること。cacheableの宣言だけでなく、CLI入口から保存・再利用までをテストした。CLIパーサーの挙動が想定と異なる点を検出し、共通設定へ修正した。

| 観点 | 確認結果 |
| --- | --- |
| カプセル化 | cacheの照会・実行・保存はapplicationの共通処理に集約。新serviceのフィールドはDI依存のみ |
| 関心の分離 | CLIは入力・表示、pipelineは対象抽出・並列実行、評価serviceはキャッシュ付き評価を担当 |
| モデルの整合性 | 外部応答の既存検証を維持。保存したdecisionの形・値域はinfraのschemaで検証 |
| layer間の責務 | storeは永続化を担当し、SDK問い合わせや分類処理を持ち込んでいない |
| 利用パターン | 同じCacheStore契約と既存の失敗方針を維持。Jev専用storeは作らない |
| interface | キャッシュの判断は種別共通。text/Jevの差はevaluatorの準備と入力・出力の変換に限定 |

制約: 同時実行中の評価そのものの重複排除は追加していない。ルール精度は今回の修正検証とは別の目的であり、上記テストから精度向上を主張しない。
