# no-implicit-fallback：独立2 Choice実験

実行日: 2026-09-19

モデル: `typesafe-jev-1.13.0`（応答: `jev-1.13.0`）
最終rule hash: `95bd3252e580ae5b875e6d060dc20908d03522130166295efaad1869b1a11c3f`

## 目的

1問6分類の択一をやめ、次の意味軸を1リクエスト内で独立したChoiceとして評価する。

1. `ambiguous_input_handling`: 外界由来の不在・未解決設定の処理
2. `failure_handling`: 実際に観測した失敗・不正状態の処理

特に、正当な境界defaultと失敗隠蔽が同じ関数に存在しても、前者が後者を隠さないことを確認する。

## API call

- 独立2 Choiceの初回development評価: 7
- 質問具体化後のdevelopment評価: 7
- 業務entityの不在例を具体化した影響評価: 4
- 凍結後のevaluation評価: 4
- 最終rule hashで未実行だったdevelopment評価: 3
- 今回合計: 25
- 以前の調整44回との累計: 69 / 100

すべて`noCache: true`、直列、Jevのみ。OpenAI / OpenCodeは呼び出していない。

## 最終rule hashの結果

| split | case | expected | actual | ambiguous input | failure |
| --- | --- | --- | --- | --- | --- |
| development | `legacy-invalid-1` | violation | violation | `implicit_business_default` 0.96 | `no_failure_path` 0.00 |
| development | `legacy-invalid-2` | violation | violation | `preserved_or_absent` 0.09 | `swallowed_failure` 0.99 |
| development | `additional-1` | pass | pass | `preserved_or_absent` 0.00 | `no_failure_path` 0.00 |
| development | `additional-2` | pass | pass | `boundary_resolution` 0.04 | `no_failure_path` 0.00 |
| development | `technical-default` | pass | pass | `technical_default` 0.00 | `no_failure_path` 0.00 |
| development | `boundary-default-with-swallowed-failure` | violation | violation | `boundary_resolution` 0.08 | `swallowed_failure` 1.00 |
| evaluation | `additional-4` | pass | pass | `preserved_or_absent` 0.00 | `no_failure_path` 0.00 |
| evaluation | `additional-5` | pass | pass | `presentation_placeholder` 0.03 | `no_failure_path` 0.00 |
| evaluation | `additional-6` | violation | violation | `preserved_or_absent` 0.20 | `swallowed_failure` 1.00 |
| evaluation | `additional-7` | violation | violation | `implicit_business_default` 0.98 | `no_failure_path` 0.00 |

固定fixture suiteでは10 / 10が期待verdictと一致し、borderlineとAPI errorは0だった。未使用evaluation splitも4 / 4で一致した。既存suiteの比較条件（各rule 10件、development 3 pass / 3 violation、evaluation 2 pass / 2 violation）を維持するため、複合ケースは意味が重複する`additional-3`と入れ替えた。`additional-3`も調整中に最終rule hashで評価済みで、`implicit_business_default` 0.97、`no_failure_path` 0.00、期待どおりviolationだった。

複合ケースでは、境界default側を`boundary_resolution`（違反確率0.08）、失敗側を`swallowed_failure`（違反確率1.00）として別々に保持し、全体をviolationにできた。択一1問で失われていた独立性は、このfixture範囲では回復した。

## 制限

- 固定10 fixtureと調整用1 fixtureだけの結果であり、一般精度や正式導入可否は示さない。
- self lintで見つかった誤検知3件を、この質問版で再評価していない。
- `confidence`は保存するがverdictには使わない。
- 関数scope抽出が匿名callbackを取りこぼす問題は対象外。

## 実行ログ

作業worktreeの`jev-no-implicit-fallback-independent-choice.log`に、全試行の`JEV_RECORD`を保存した。`*.log`はgitignore対象。
