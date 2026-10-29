# 復旧した24件のJev全件回帰

## 実行条件

- 実行: 2026-09-20、各ケース1回。fixture・期待値・ruleの変更なし。
- 要求モデル: `typesafe-jev-1.13.0`、応答: `jev-1.13.0`。
- rule hash: `61098c0b3734a7fd1a79c5fe32b8223c46010dd032fbd35becf539dbf425e25e`。
- 旧12件＋意味論12件の全24件。比較用LLM baseline12件はfilterで除外。
- 既存の実APIテストを使用。cacheなし、直列、retryなし。
- 今回の依頼による全件確認: TypeSafe 24回、OpenCode 0回。以前の調整100回と合わせて124回（self実行は別枠）。追加調整や再試行は行わない。
- 入力token 26,469、出力token 2,543。テスト全体7.67秒。

実行コマンド（worktree: `/workspaces/github.com/9wick/codepolicy-jev-poc`）:

```bash
set -o noclobber
CODEPOLICY_TEST_REPORT_DECISIONS=1 CODEPOLICY_TEST_JEV_MODEL=typesafe-jev-1.13.0 \
  bun --env-file=/workspaces/github.com/9wick/codepolicy/.env run test:rules -- \
  src/rules/jev-no-implicit-fallback/rule.test.ts -t 'Jev' --reporter verbose \
  > jev-no-implicit-fallback-restored-all-2026-09-20-r1.log 2>&1
```

## 結果

| 対象 | 成功 | 失敗 | 確認する契約 |
| --- | ---: | ---: | --- |
| 旧fixture | 8 / 12 | 4 | 元の最終判定 |
| 意味論fixture | 12 / 12 | 0 | 独立2問の両回答＋最終判定 |
| 合計 | 20 / 24 | 4 | 上記の集合 |

終了コード1。APIエラー0。24件の結果ログがあり、case IDは全件一意。Vitestの`12 skipped`は意図的に除外したLLM baselineで、Jevの24件には未実行なし。

## 失敗した4件

| case | 内容 | 元の期待値 | 実際 | 入力側Choice / 選択確率 / confidence |
| --- | --- | --- | --- | --- |
| development/legacy-invalid-1 | 配送先の国が欠損→JPとして配送区分を決定 | violation | borderline | meaning_lost / 0.67 / 0.51 |
| development/additional-2 | HTTP入力省略→page size 20 | pass | borderline | meaning_lost / 0.44 / 0.16 |
| development/additional-3 | 未確定の割引率→0 | violation | borderline | meaning_lost / 0.62 / 0.43 |
| evaluation/additional-7 | 数量・価格欠損→1・0として請求 | violation | borderline | meaning_lost / 0.63 / 0.44 |

4件とも失敗側Choiceは`preserved_or_absent`。現行policyは入力側`meaning_lost`を一律「解釈権限が未設定」のborderlineにする。そのため、旧契約の許可／不許可を区別した最終判定に届かない。確率が0.7未満だから保留なのではない。

これは旧回帰契約に対する4件の失敗として残す。旧fixtureに問別の正解ラベルはないため、最終判定不一致を除いて「旧12件も意味判定100%」と数え直すことはしない。

## 意味論12件で確認できたことと限界

- 空から集計するMapの未登録→0は意味保存、測定不明のMap未登録→0は意味喪失として区別できた。
- unavailable usage→0、入力省略の補完、変更無し指示の破壊を入力側で検出できた。
- 入力と失敗の両方を失うケースは、両方の独立回答が`meaning_lost`になった。
- Resultの保持、終了コード1による失敗通知、変更無しとしての現状保持、技術的radix既定値を意味保存とした。
- 一部の例外だけ成功へ変換するケースを検出し、意味が不明な単純`value ?? 0`を`unclear`とした。

ただし、入力省略ケースの入力側confidenceは0.17、両方の意味喪失ケースは0.22。旧同居ケースの入力側confidenceは0.07（選択確率0.38）だった。回答一致は確認したが、高い確信度や反復安定性を示す結果ではない。

未検証: 同じ24件を過去方式へ適用した比較、反復安定性、self精度。前回の部分集合5/5や過去の10/10とそのまま比較して改善と断言しない。fixture・期待値を変更して成功扱いにはしていない。

生ログはworktree直下の`jev-no-implicit-fallback-restored-all-2026-09-20-r1.log`。全Choice・confidence・確率分布・fixture hash・rule hash・usageを保存した。`*.log`はgitignore対象。commit/pushなし。
