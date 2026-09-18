# Jev PoCの試し方・測定方法

これは新規5ルールでJevの利用可能性を調べるPoC。既存ルールの代替や本番精度を保証するものではない。

## 1ルールを試す

`TYPESAFE_API_KEY` を実行環境に設定する。キーを設定ファイル・測定結果・チャットへ書かない。

```bash
bun run dev rule run jev-no-implicit-fallback samples/jev/fallback.ts --config .codepolicy.jev.yml
```

通常出力はRule / Verdict / Reasoningの3行。Reasoningはモデルが生成した文章ではなく、違反した観点名とNoul値の固定書式。Jevはコード引用を返さないため、`Citations: (none)`を含め引用行は出さない。`--verbose`でのみ全観点・閾値・要求／応答モデル・token usageをstderrへ出す。0.699は丸めず表示し、borderlineとして扱う。

通常lintは `bun run dev --config .codepolicy.jev.yml`。この設定は`filter: all`なので、ignore以外の全対象を外部APIへ送信する。先に単一ファイルの`rule run`で確認すること。通常lintは関数・型を抽出するが、`rule run`は指定ファイル全体を評価する。

## 比較測定

```bash
# API・ファイル書き込みなし。5ルール、50ケース、300評価になることを確認
bun run benchmark:jev --check

# APIを呼ぶ。比較用OpenCodeの利用環境も必要
bun run benchmark:jev --jev-model typesafe-jev-1.13.0 --text-model openai/gpt-5.4
```

モデル名は設定例であり、利用アカウントでの提供状況は実APIで確認する。Jevモデルの版固定を必須とし、latestは比較測定で拒否する。各ケースを既存・Jevの両経路で3回、concurrency=1、結果キャッシュなしで実行する。300評価であり、既存ルールの検証用追加呼び出しによりAPIリクエスト数はそれを超える。時間とAPI費用がかかる。

入力は `src/test-support/jev-fixtures/`。各ルールに調整用6件と評価用4件、各群でpass/violation同数。現行の既存18ケースを調整用に含め、新規32ケースを追加した。各ケースには期待理由がある。期待値はまだ人手レビュー・実API評価を経ていない初期仮説。結果を見て正解ラベルを変更しない。評価用ケースで調整したら、新しい未使用の評価用ケースを用意する。

両経路は同じScopeContext（source・filePath・name・fileTree等）を受け取る。fixtureのsignatureは省略し、両経路ともsourceに記載されたシグネチャを読む。既存の`ssot-placement`とは判定観点が完全同一ではない。Jev版はパス／layerと責務の不一致だけを調べ、兄弟関数との凝集度は調べない。

`docs/benchmark/<日時>-jev.jsonl` に次を逐次保存する。既存ファイルは上書きしない。

- 先頭行：入力ケース全件、Jev質問定義、反復数、並列数。
- ケース行：反復番号、caseId、期待値、split、fixture／ruleハッシュ、要求モデル、日時、所要時間、TypeSafe SDK版。
- Jev結果：応答モデル、全観点の丸め前Noul値、閾値、合成判定、usage。
- 既存結果：生成された理由・引用・判定・usage。既存providerは応答モデルIDを公開していないため要求モデルのみ。
- API失敗：`kind: error`とメッセージ。失敗をpassにしたり削除したりしない。

完走時に隣の `.jsonl.md` へルール・モデル・split別の正答数、誤検出、見逃し、precision/recall、保留数、エラー数、p50/p95所要時間、3回の判定が揺れたケース数を保存する。保留・エラーも総件数に含める。precisionは違反判定数、recallは期待違反数を分母とする。エラーがあれば終了コード1。中断時も保存済みの行は残る。

生データを見て、ルールごとに「次の実験へ進む／質問を見直す／用途に不適」を判断する。数値が低くても再現可能な限界が分かればPoCの知見となる。50ケースで本番採用の判断はしない。

## テスト

```bash
# API不要
bun run test

# 本番infraの契約確認。各provider 1テスト、再試行なし
bun run test:infra -- typesafe
bun run test:infra -- opencode

# 判定精度の評価（多数の実API呼び出し）。API失敗や保留は成功扱いしない
bun run test:rules -- src/rules/jev-*/rule.test.ts

# 開発時の検証（実APIを呼ばない）
bun prepush
```

実APIテストのモデルは `CODEPOLICY_TEST_JEV_MODEL` と既存の `CODEPOLICY_TEST_AGENT` で変更できる。測定用コマンドとは別であり、テスト実行だけでは比較結果ファイルは保存しない。

`test:infra` は2件を直列実行する。引数でproviderを選べばその1件だけ。実APIの正常応答とmock応答に `src/test-support/provider-contract.ts` の同じ検証を適用する。Jevは質問ID・数値範囲・モデル・usage、OpenCodeは要求JSON Schema・usageを確認し、ルールの判定精度は検証しない。キー不足・接続エラーをskipにしない。該当テスト0件も失敗とする。

別worktreeの.envは自動では読まない。必要なら `bun --env-file=/明示したパス/.env run test:infra -- typesafe` のように指定する。キーをコマンド引数やログへ展開しない。

アダプター呼び出しは各1回だが、OpenCode内部ではモデル一覧取得・セッション作成・自動タイトル生成・構造化出力再試行等の追加処理があり得る。推論APIリクエスト総数が必ず1とは保証しない。テスト側のretryは0で、使用後のローカルサーバーは成功/失敗とも終了する。
