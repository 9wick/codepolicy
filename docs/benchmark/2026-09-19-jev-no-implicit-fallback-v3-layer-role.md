# no-implicit-fallback v3：layer role分離development pilot

実行日: 2026-09-19

モデル: `typesafe-jev-1.13.0`（応答: `jev-1.13.0`）

rule hash: `3c1954d790f36d7c6464397c61815f87b7f89adcd13d66e1e29850673cb7e587`

## 目的

具体的なdefault値ごとの正当性を問わず、関数単位で次の4観測を独立に取得し、コード側のpolicyで合成できるかをdevelopment 6件で確認する。

1. `layer_role`: `filePath`と`qualifiedSymbol`から関数の責務上の位置を推定する
2. `external_input_default`: rawなHTTP/config入力の補完があるか
3. `internal_value_default`: 内部化済み値の補完があるか
4. `failure_conversion`: 観測済みの失敗を成功値へ変換しているか

## API callと結果

- TypeSafe API: 6 call（各development fixtureを1回、cacheなし）
- 期待verdict一致: 6 / 6
- actual: pass 3 / borderline 0 / violation 3
- TypeSafe API error: 0
- input token: 合計6,018、平均1,003 / call
- output token: 合計1,028、平均171.3 / call
- TypeSafe処理時間: 合計2,152ms、平均358.7ms / call
- 今回の調整予算: 6 / 25使用、19残
- v3累計: 12 / 31使用、19残

| case | expected | actual | layer role | external default | internal default | failure conversion |
| --- | --- | --- | --- | --- | --- | --- |
| `legacy-invalid-1` | violation | violation | `internal_layer` 1.00 | `absent` 0.93 | `present` 0.95 | `absent` 0.99 |
| `legacy-invalid-2` | violation | violation | `internal_layer` 1.00 | `absent` 1.00 | `present` 0.67 | `present` 1.00 |
| `additional-1` | pass | pass | `internal_layer` 1.00 | `absent` 1.00 | `absent` 1.00 | `absent` 0.99 |
| `additional-2` | pass | pass | `user_input_boundary` 1.00 | `present` 0.96 | `absent` 0.87 | `absent` 0.98 |
| `technical-default` | pass | pass | `internal_layer` 0.98 | `absent` 0.98 | `absent` 0.80 | `absent` 0.98 |
| `boundary-default-with-swallowed-failure` | violation | violation | `user_input_boundary` 0.99 | `present` 0.97 | `absent` 0.81 | `present` 1.00 |

表の数値はselected Choiceのprobabilityである。全確率とChoiceのconfidenceは実行ログに保存している。

## 分かったこと

`path + filename + class#func`から責務上の位置を推定する問いと、sourceから処理カテゴリを観測する問いを分けることで、前回borderlineだった3件を期待どおり分離できた。

- 業務defaultは`internal_layer + internal_value_default=present`としてviolationになった。
- HTTP入力defaultは`user_input_boundary + external_input_default=present`としてpassになった。
- `parseInt(value, 10)`はexternal/internal defaultとも`absent`になり、一般的なalgorithm parameterを規制対象から除外できた。
- HTTP入力defaultと失敗の成功値化が同居するケースでは、独立した`failure_conversion=present`が保持され、全体はviolationになった。

`legacy-invalid-2`の`internal_value_default=present`はselected probability 0.67、confidence 0.50と低めだが、同じ関数の`failure_conversion=present`が1.00であり最終violationは安定している。composed ruleではselected categoryをpolicy入力に使うため、0.7未満を機械的にborderlineへ戻していない。

## 実行上の注意

テスト名のfilterが同じfixtureの比較用LLM baselineも選択したため、TypeSafe 6件の完了後にbaseline 6件がOpenCodeの`gpt-5.4`非対応エラーになり、テストコマンド全体は終了コード1だった。TypeSafe側は6件すべて正常応答し、全Jevテスト自体はpassしている。追加のTypeSafe API呼び出しは行っていない。

## 実行ログ

作業worktreeの`jev-no-implicit-fallback-v3-layer-role-development.log`に、6件の`JEV_RECORD`、全確率、confidence、usage、および比較用baselineのエラーを保存した。`*.log`はgitignore対象である。
