# テスト境界の修正・検証記録

## 変更内容

- 元から存在したCI・公開前チェックの実API除外を、通常testとprecommit/prepushにも統一した。
- 内部完結、実APIのinfra契約、ルール精度評価を別のVitest設定にした。収集パターンは `vitest.shared.config.ts` の一箇所で定義する。
- 既存・Jevルールの精度テスト15ファイルは削除・改変せず `test:rules` から実行する。
- 本番adapterを呼ぶ `typesafe.infra.test.ts` / `opencode.infra.test.ts` を追加した。一時スクリプトによるSDKの直接呼び出しは使わない。
- mock応答と実APIの正常応答を同じprovider別assertionで確認する。TypeSafeのpipeline用mockにも適用した。
- OpenCodeの `info.error` をResultのエラーとして返す。空のpartsや正常に見えるpartsがあってもAPIエラーを優先する。応答ヘッダー・本文全体は転記しない。
- 通常test・CI・prepushの成功は実API契約や判定精度の成功を意味しない。

## TDD

最初に `bun run test src/test-support/test-suites.test.ts src/test-support/provider-contract.test.ts src/infrastructure/llm/opencode.adapter.test.ts` を実行し、未実装の設定・assertionとOpenCodeエラー伝播の失敗を確認した。OpenCodeの追加テストのデータ形を修正後、再実行でも空出力への置換とAPIエラーの成功扱いの2件が失敗することを確認してから、本番コードを修正した。

## 検証結果

| コマンド | 結果 |
| --- | --- |
| `bun run test` | 40ファイル、354件成功。内部完結のみ |
| `bunx --no-install vitest list --filesOnly --config vitest.infra.config.ts typesafe` | TypeSafeのinfraテスト1ファイルだけ |
| `bunx --no-install vitest list --filesOnly --config vitest.infra.config.ts opencode` | OpenCodeのinfraテスト1ファイルだけ |
| 収集境界の回帰テスト（通常test内） | 全testファイルの重複・未所属なし。infra 2ファイル、精度評価15ファイルを確認。テスト本体は実行せず一覧だけを取得 |
| `bun run test does-not-exist` | 意図どおり終了1。対象0件を成功扱いしない |
| `bun --env-file=/workspaces/github.com/9wick/codepolicy/.env run test:infra -- typesafe` | 実APIの1件成功。質問1個、provider呼び出し1回、SDK retry 0 |
| `NODE_OPTIONS=--max-old-space-size=4096 bun prepush` | format/typecheck/lint/build/内部354テスト成功、検証ハッシュ保存成功 |
| `git diff --check` | 成功 |

この修正中に実APIを呼んだのは上記TypeSafeテストだけ。OpenCodeのserver-manager内部テストが出す起動ログは、mockされたSDKの呼び出しであり実サーバー起動ではない。

## 未検証・制約

- 未検証: 新設したOpenCode実API契約テストの実行。先の調査で `openai/gpt-5.4` が当該ChatGPTアカウント接続では非対応（400）だったため、課金を伴い得る同じ条件での再試行は行わなかった。利用可能モデルを明示設定して `bun run test:infra -- opencode` で確認する必要がある。
- 未検証: 5ルールの判定精度・保留率・速度の比較測定、50ケースの期待ラベルの人手確認。今回 `test:rules` とベンチマークを実行していない。
- OpenCodeのprovider呼び出し1回でも、自動タイトル生成・構造化出力再試行等で推論回数が増える可能性がある。今回はその本番挙動を変更していない。
- 現状の内部テストは外部境界をmockしている。収集境界テストはファイルの分類を保証するもので、OSレベルの通信禁止機構ではない。

## 目的との対応

開発時の検証は接続障害・認証・推論課金から切り離せた。実サービスとの適合を調べる入口もテストコードになった。一方、TypeSafeの契約成立は「Jevが5ルールを正しく判定できる」証拠ではない。後者は独立したPoCの評価として残す。
