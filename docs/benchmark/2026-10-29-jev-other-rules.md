# 他の4つのJevルールの改善と独立作問評価

## 目的と評価の分離

対象は `jev-strict-function-boundary`、`jev-no-invalid-state-type`、`jev-ssot-placement`、`jev-no-nonstandard-code`。最初に既存の固定40件を実APIで1回ずつ測定した。変更前の一致は順に **2/10、2/10、9/10、9/10**。この固定ケースを**調整用**として扱い、初回測定の失敗・期待値を変更していない。`src/rules/*/rule.test.ts` と固定fixtureに期待判定があり、質問文の修正前に失敗を観測した。

別エージェントに**ルールの自然言語の意図だけ**を伝え、リポジトリ・既存の例・実装・過去のJev結果を読ませず、最初の2ルールに24件、残る2ルールに16件のTypeScriptケースと期待判定を作成させた。入力と期待値のSHA-256はそれぞれ `00cb03e41035ca602a06180213d03b0b0d72c1f34757e4f3ac9193b37b171dec`、`502e88b4d140742616df2a4facd2bdeca83e8a8e0f0081b2dceca68e8515b354`。これらを**初回実行前に固定**し、評価後も変更していない。保存先は `2026-10-29-jev-other-independent-primary.json` と `2026-10-29-jev-other-independent-secondary.json`。期待判定と理由はJevには送信していない。

## 初回の独立作問比較

同じ入力を変更版と変更前のルール定義に1件1回ずつ直列に通した。モデルは `typesafe-jev-1.13.0`、`evaluatePocCase` 経由でキャッシュなし、APIエラー0。各行に期待値、実際の判定、観測ごとの確率・判定、所要時間、rule・fixture hashを記録した。

| ルール | 変更前 | 候補版 | 採否 |
| --- | ---: | ---: | --- |
| strict-function-boundary | 5/12 | **8/12** | 採用 |
| no-invalid-state-type | 1/12 | **7/12** | 採用 |
| ssot-placement | 4/8 | **5/8** | 採用。なお誤検出・保留が各1件以上残る |
| no-nonstandard-code | **8/8** | 7/8 | **不採用**。調整用ケースの改善より未見ケースでの退行を重視し、質問文を元に戻した |

変更版での不一致は境界4件（`sfb-07/08/09/10`）、型5件（`ist-03/06/07/10/11`）、配置3件（`ssot-02/05/07`）。非標準コード候補は `nonstandard-08` が `violation` → `borderline` に退行した。出力に合わせてラベルを直さず、全結果を以下に保存した。

- 変更前の固定40件: `2026-10-29-jev-other-fixed-original.jsonl`
- 独立作問24件の候補／変更前: `2026-10-29-jev-other-primary-candidate.jsonl`、`2026-10-29-jev-other-primary-original.jsonl`
- 独立作問16件の候補／変更前: `2026-10-29-jev-other-secondary-candidate.jsonl`、`2026-10-29-jev-other-secondary-original.jsonl`
- 調整中の固定ケースの実測: `2026-10-29-jev-other-{strict,state,style,placement}-development.jsonl`、`2026-10-29-jev-other-placement-final-development.jsonl`、`2026-10-29-jev-other-fixed-final-evaluation.jsonl`

調整後の固定ケース（未見とは扱わない）の最終測定は境界4/4、型4/4、配置の評価側4/4・開発側5/6。非標準コードの採用版は変更前と同一。各結果の `ruleHash` で質問文のバージョンを識別できる。応答時間の中央値（独立作問の候補版）は境界142.5ms、型148.5ms、配置142.5ms。ケース数が少なく速度差の優位性は主張しない。

## 限界と次の改善

独立作問者はルール実装を知らないが、**公開リポジトリから採った実コードでも独立した人間によるラベルでもない**。合成例40件に対する比較であり、実コードや別のpolicyへの汎用性は未証明。固定ケースでの調整と独立作問評価の役割は混同しない。この40件を見て次に質問文を変える場合、新たな未使用の評価集合が必要。

現時点の残課題は境界・型での保留の多さ、配置での誤検出。Jev呼び出しは本作業開始時 **124/300回**、終了時 **290/300回**（残り10回）。`bun prepush` の内部・mockテストはJev実呼び出しに含めない。
