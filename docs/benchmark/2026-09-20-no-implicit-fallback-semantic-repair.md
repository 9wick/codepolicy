# 独立2 Choiceの意味判定を修復した実験

## 結果

最終版で実行した5件は、入力側・失敗側の**両方の選択結果**と最終verdictが期待どおりだった。これは調整済みケースの回帰確認であり、一般精度100%や全12ケース成功を意味しない。

特に両方の意味喪失が同居するケースでは、入力側の選択は合ったがconfidenceは0.11だった。安定性が確認できたとは言えない。

モデル：`typesafe-jev-1.13.0`（応答 `jev-1.13.0`）。最終rule hash：`61098c0b3734a7fd1a79c5fe32b8223c46010dd032fbd35becf539dbf425e25e`。

## 修復したもの

基準は `2a5225f` の独立2 Choice。layer＋3問版で「意味の喪失」が「値の補完の有無」に変わっていた部分を修復した。

- `ambiguous_input_handling`：失敗以外の不在・未解決データが担う意味の喪失。
- `failure_handling`：実際に観測した操作失敗の意味の喪失。
- 各質問は関数全体を見て、該当する意味喪失が一つでもあれば検出する。主要な処理一つを選ばず、変数ごとのrequestにも分割しない。
- 両軸の選択肢は `meaning_lost` / `preserved_or_absent` / `unclear`。構文上の値の違いだけで意味の違いを断定しない。
- 権限・layer推定を質問から除いた。入力側の意味喪失は権限未設定のため保留。失敗側の意味喪失は違反。両方の観測を保持する。
- 意味保存はlayer非依存でpass。権限による特例許可ではない。
- 通常の表示でも、violationとborderlineが同居したとき両方の理由を表示する。passの理由は表示しない。
- cache経路、`--no-cache`、既存LLMルール、他4つのJevルールの判定は変更なし。共通composed policyの表示だけ、最終verdictと異なる非passの理由も残すよう変更した。
- 確率とconfidenceは保持するが、現行composed policyの選択結果による合成は変更していない。独立2 Choice当時の閾値分類へ戻したものではない。

## テストの分離と評価基準

内部契約テストはAPIを呼ばず、2軸の9組合せ、1関数1 request、回答分布・confidence保持、権限未設定と意味不明の理由の違い、同居時の出力、cache利用を検証する。

実API精度テストは `src/rules/jev-no-implicit-fallback/rule.test.ts` 内の `Jev semantics:` ケース。`bun test:rules` でのみ実行する。既存の共通 `evaluatePocCase` → `RuleEvaluationService` → TypeSafe providerを使い、別scriptからAPIを直接呼ばない。計測テスト既存の明示的 `noCache: true` を維持し、通常lintのcacheは迂回しない。

12ケースは `src/test-support/jev-fixtures/no-implicit-fallback-semantics.ts` に置いた。期待する選択結果・verdict・理由はテスト側だけに保持し、モデルへはsource/signature/filePathと質問を渡す。期待理由はモデルへ渡さない。

既存10ケースのbaselineテストは保持した。今回のJevテストは権限のない段階の意味観測が目的なので、旧baselineのpass/violation期待値を流用していない。旧比較用fixtureは変更しておらず、従来の比較benchmarkで権限未設定による保留をそのまま精度低下と解釈しないこと。

内部テストの成功はJevの意味理解を証明しない。実API側は最終verdictだけでなく両軸の選択を検証する。例えばr2の `mixed-failure-paths` は最終violationが合っても、入力側も喪失と誤判定したため失敗とした。

## 試行と予算

今回開始前は81/100回。今回19回、累計100/100回。追加のAPI実行なし。OpenCode / OpenAIおよびself全体実行はしていない。

| 試行 | API回数 | 両軸＋verdict一致 | 調整・観測 |
| --- | ---: | ---: | --- |
| r1 development | 8 | 6/8 | 測定不能を操作失敗にも分類。終了コード1での失敗表現も隠蔽と誤判定 |
| r2 development再試行 | 2 | 2/2 | 観測された操作失敗とデータ不明を区別し、返却値以外の失敗チャネルを明示 |
| r2 evaluation | 4 | 2/4 | Mapの件数0と測定不明0を区別。失敗側→入力側の混同、文脈不足での断定が残る |
| r3 最終回帰 | 5 | 5/5 | 入力側から操作失敗を除き、意味を文脈から確定できない場合はunclearと明示 |

消費token合計：input 19,289 / output 2,000。リクエスト数とtoken数は4つのログの `JEV_SEMANTIC_RECORD` 19行から集計した。エラー再試行や成功結果だけの抽出による除外はない。

`evaluation`という固定IDは保持しているが、r2の結果を見てr3を調整したため、その2ケースを未使用holdoutとは呼ばない。

## 最終版で確認した5件

数値は「選択カテゴリの確率 / confidence」。違反確率ではない。

| ケース | 入力側 | 失敗側 | 最終verdict |
| --- | --- | --- | --- |
| 自分で空から集計するMapカウンタ | 保存・非該当 0.95 / 0.92 | 保存・非該当 1.00 / 0.99 | pass |
| 測定不能のusageを0に確定 | 喪失 0.83 / 0.75 | 保存・非該当 0.98 / 0.97 | borderline：権限未設定 |
| 入力省略の補完＋取得失敗を空配列に変換 | 喪失 0.41 / 0.11 | 喪失 0.98 / 0.97 | violation：両観測を保持 |
| 一部のエラーは保持、他は成功件数0に変換 | 保存・非該当 0.75 / 0.62 | 喪失 0.99 / 0.98 | violation |
| 意味の文脈がない `resolve(value) { return value ?? 0; }` | 不明 0.62 / 0.44 | 保存・非該当 0.98 / 0.97 | borderline：意味を判断する材料不足 |

残る注意点：同居ケースは選択結果の一致だけなら成功だが、入力側の分布は割れている。confidenceを閾値にして成功に見せかける変更はしていない。

未検証：最終r3での残り7ケース再評価、最終版の未使用holdout、self全体の精度、繰り返し実行時の安定性。予算を使い切ったため追加実行していない。

## 再現コマンドとログ

以下は実際に実行したコマンド。作業worktreeで実行。ログはstdout/stderrを保存しており、既存ログを上書きしていない。ログはgitignore対象。

```bash
script -q -e -c "bun --env-file=/workspaces/github.com/9wick/codepolicy/.env run test:rules src/rules/jev-no-implicit-fallback/rule.test.ts -t 'Jev semantics: .*development/' --reporter verbose" jev-no-implicit-fallback-semantics-development-r1.log

script -q -e -c "bun --env-file=/workspaces/github.com/9wick/codepolicy/.env run test:rules src/rules/jev-no-implicit-fallback/rule.test.ts -t 'Jev semantics: .*development/(unknown-usage|failure-status)$' --reporter verbose" jev-no-implicit-fallback-semantics-development-r2.log

script -q -e -c "bun --env-file=/workspaces/github.com/9wick/codepolicy/.env run test:rules src/rules/jev-no-implicit-fallback/rule.test.ts -t 'Jev semantics: .*evaluation/' --reporter verbose" jev-no-implicit-fallback-semantics-evaluation-r2.log

script -q -e -c "bun --env-file=/workspaces/github.com/9wick/codepolicy/.env run test:rules src/rules/jev-no-implicit-fallback/rule.test.ts -t 'Jev semantics: .*/(missing-contract|mixed-failure-paths|both-losses|local-counter|unknown-usage)$' --reporter verbose" jev-no-implicit-fallback-semantics-final-r3.log
```

それぞれ終了コードは1、0、1、0。baselineテストは全回で未実行。再実行すると課金されるため、今回の100回枠では再実行しない。

内部検証：`NODE_OPTIONS=--max-old-space-size=4096 bun prepush` 成功。format、typecheck、lint、build、46ファイル407テストが通過。最初の実行ではimport整形、次に旧qualifiedSymbol前提のcacheテストが失敗したため修正後に全体を再実行した。cacheテストはqualifiedSymbolを要求しない場合の省略と、明示要求時の保持の両方を検証する。

TDD：独立判定・表示等の13ケース、テスト対象選択、保留期待値の集計について、変更前の失敗を確認してから実装した。

commit / pushなし。ユーザーの `.codepolicy.self.yml` は変更していない。
