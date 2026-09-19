# no-implicit-fallback v3：3観測development pilot

実行日: 2026-09-19

モデル: `typesafe-jev-1.13.0`（応答: `jev-1.13.0`）

rule hash: `e25b5b6186098c76afd5d4fd16bb0be0e25ca8b40067683d089a6232e1a3bea9`

## 目的

no-implicit-fallbackの判定を次の3観測へ分け、観測結果をコード側の2 concernで合成できるかをdevelopment 6件で確認する。

1. `absence_effect`: 不在と通常値の区別が外向き結果で失われたか
2. `interpretation_authority`: 具体的mappingを確定する契約上の権限があるか
3. `failure_disposition`: 観測した失敗を成功値へ変えたか

## API callと結果

- 実行: 6 call（各development fixtureを1回、直列）
- 期待verdict一致: 3 / 6
- actual: pass 1 / borderline 3 / violation 2
- API error: 0
- input token: 合計5,694、平均949 / call
- output token: 合計1,140、平均190 / call
- 調整予算: 6 / 31使用、25残

| case | expected | actual | absence | authority | failure |
| --- | --- | --- | --- | --- | --- |
| `legacy-invalid-1` | violation | borderline | `distinction_collapsed` 0.99 | `insufficient_evidence` 0.47 | `not_applicable` 0.97 |
| `legacy-invalid-2` | violation | violation | `distinction_collapsed` 0.51 | `insufficient_evidence` 0.44 | `converted_to_success` 1.00 |
| `additional-1` | pass | pass | `not_applicable` 0.99 | `not_applicable` 1.00 | `not_applicable` 0.91 |
| `additional-2` | pass | borderline | `distinction_collapsed` 1.00 | `insufficient_evidence` 0.60 | `not_applicable` 0.98 |
| `technical-default` | pass | borderline | `not_applicable` 0.50 | `not_applicable` 0.45 | `not_applicable` 1.00 |
| `boundary-default-with-swallowed-failure` | violation | violation | `distinction_collapsed` 0.99 | `insufficient_evidence` 0.47 | `converted_to_success` 1.00 |

表の数値はselected Choiceのprobabilityであり、Choiceの`confidence`とは別である。全確率とconfidenceは実行ログに保存している。

## 分かったこと

`failure_disposition`の分離は有効だった。失敗を空値や`0`の成功へ変えた2件をいずれも`converted_to_success=1.00`で検出し、許容defaultが同居する複合ケースでも全体をviolationにできた。

`absence_effect`も、業務defaultとHTTP境界defaultの双方で区別が失われたという観測自体はできている。しかし、両者の合否を分ける`interpretation_authority`はどちらも`insufficient_evidence`になった。source、signature、file pathだけでは、`JP`や`20`という具体的mappingが外部契約で許可されているかを確認できない。このためstatementの言い換えや確率閾値だけでは、違反例をviolationへ、許容例をpassへ同時に分離できない。

`technical-default`では`parseInt`のradix既定値を「外界由来の不在」と見るかが割れ、selected Choiceは`not_applicable`でも0.50に留まった。質問の適用対象をさらに明確にする余地はあるが、上記の契約情報不足を解消しないままAPI反復を続けても主要な誤判定は直らない。

## 停止判断

計画の停止条件「観測が必要な軸を答えられず、入力stateに必要な証拠がない場合は構造問題として停止」に該当する。したがって残り25 callは消費せず、prompt修正2反復とevaluation 4件は未実施とした。

次に進むには、少なくとも「具体的mappingを許可する契約」をstateへどう渡すかを別途決める必要がある。fixtureの期待値をそのまま渡すと正解漏洩になるため、外部API/config schemaなどproductionでも取得できる契約情報でなければならない。

## 実行ログ

作業worktreeの`jev-no-implicit-fallback-v3-development-pilot.log`に、6件の`JEV_RECORD`と全確率、confidence、usageを保存した。`*.log`はgitignore対象。
