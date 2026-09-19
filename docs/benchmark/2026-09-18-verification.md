# Jev PoC実装の検証記録（実APIの精度測定ではない）

この文書はテスト分離前の履歴。後続の修正・現在の検証結果は [テスト境界の検証記録](2026-09-18-test-boundaries.md) を参照。以下の失敗記録を後から成功へ書き換えない。

実装先：`feat/jev-poc`、元のHEAD：`a0b5a0c`。commit/pushなし。

## 実装されたこと

- 既存10ルールと公開カスタムルールAPIを保持し、新規`jev-*`5ルールを追加。
- Noul値を固定閾値で分類し、指摘のある観点だけを通常出力。全観点はverboseと比較測定で保持。
- Jevの`rule run`からCitations行を省略。
- 実SDK＋差し替えHTTP、pipeline、CLI、50固定ケース・300評価の測定ハーネスをテスト。

## 検証コマンドと結果

| コマンド | 結果 |
|---|---|
| `bun run test --exclude='src/rules/*/rule.test.ts'` | 38ファイル、335件成功 |
| `bun run format:check` | 成功（prepush内でも実行） |
| `bun run typecheck` | 成功（prepush内でも実行） |
| `bun prepush` | 最初の実行はESLintのNode heap上限約2GBでOOM |
| `NODE_OPTIONS=--max-old-space-size=4096 bun prepush` | format/typecheck/lint/build成功。全テストは335件成功、78件失敗。prepush全体は失敗 |
| `bun run dev validate --config .codepolicy.jev.yml` | Config OK、15ルール登録、5ルール有効 |
| `bun run dev rule list --config .codepolicy.jev.yml` | 新規5ルールを表示 |
| `bun run dev rule show jev-no-implicit-fallback` | IDとscopeを表示、成功 |
| `node dist/cli/entry.mjs validate --config .codepolicy.jev.yml` | ビルド済みCLIも成功 |
| `bun run benchmark:jev --check` | API・ファイル出力なし。5ルール／50ケース／300評価を確認 |
| `bun run dev rule run jev-no-implicit-fallback samples/jev/fallback.ts --config .codepolicy.jev.yml` | APIキー不足の明示エラー、終了コード1 |
| `git diff --check` | 成功 |

失敗した78件の内訳：

- 新規Jev実APIテスト50件：`TYPESAFE_API_KEY`未設定。
- 既存実APIテスト28件：OpenCodeがtext/structured outputを返さない。

切り分けとして、変更していない元の作業ツリーで `bun run test src/rules/no-implicit-fallback/rule.test.ts` を実行し、3件とも同じOpenCodeエラーを再現した。最初の全テスト試行ではOpenCodeの`database is locked`も1件発生したが、最終試行の失敗は上記の応答取得エラーだった。

既存`src/index.ts`、公開rule型、既存ruleTester、既存対象ルールの定義・専用テスト、既存providerに差分がないことも `git diff --exit-code -- <対象パス>` で確認した。共通実行系と一部テストの型注釈は変更している。

## 未検証・次の作業

未検証: Jevの実応答、判定精度、保留率、実APIの所要時間、アカウントでの版固定モデルの利用可否、50ケースの人手正解ラベル確認。

`TYPESAFE_API_KEY`と比較用OpenCodeモデルが使える環境で、単一サンプル→50ケース比較→prepushを実行する。現時点では「Jevが実用的」との結論は出さない。`prepush`成功が必要なDefinition of Doneも未達成。

比較測定の手順は [README](README.md)。実装を試せる状態と、PoCの目的である「使える範囲の実測」を分けて引き継ぐ。
