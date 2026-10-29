# 公開コード12件による Jev 判定比較

## 入力と出典

- `2026-10-29-jev-policy-external.json` に12件の**実行前に固定した**コード断片、filePath、期待判定、理由、行番号付きURL、取得元ファイルのSHA-256を保存。ファイル全体のSHA-256: `c362f0d902c4748183cbd4163a968068ee8aa5ffc3d79480fff5a6d069f4784d`。各断片が取得元ファイルの指定行と一致することを確認した。Jevへの入力に期待判定と理由は含めない。
- 出典は [elizaOS/eliza `8a2b993`](https://github.com/elizaOS/eliza/tree/8a2b993)、[Speakeasy SDK `d67fd88877c83268a900a6aee721e576c2c0203d`](https://github.com/speakeasy-api/speakeasy-client-sdk-typescript/tree/d67fd88877c83268a900a6aee721e576c2c0203d)、[Immer `75a290e44ba14bd723c8ef8546b6559c8ef3ae88`](https://github.com/immerjs/immer/tree/75a290e44ba14bd723c8ef8546b6559c8ef3ae88)。後二者の入力URLは当時の `main` を指すが、記載のコミットにあるファイルのSHA-256が入力の `sourceFileSha256` と一致することを後から検証した。将来の `main` 更新で入力の出典が変わるわけではない。
- 3問版と変更前の2問版を同一入力でそれぞれ1回評価。モデルは `typesafe-jev-1.13.0`。ルールは実行中に変更していない。3問版のrule hashは `09e9935f76a11854ccca11710100774849cfbd821a7faa3a832e304e3d54bfe1`、2問版は `61098c0b3734a7fd1a79c5fe32b8223c46010dd032fbd35becf539dbf425e25e`。結果は `2026-10-29-jev-policy-external-3q.jsonl` と `2026-10-29-jev-policy-external-2q.jsonl` に保存した。APIエラーなし。

| 方式 | 期待判定との一致 | 違反3件 | pass 9件 | p50 / p95（1件） |
| --- | ---: | ---: | ---: | ---: |
| 3問版 | 11/12 | 3/3 | 8/9 | 160 / 264 ms |
| 2問版 | 10/12 | 3/3 | 7/9 | 162.5 / 250 ms |

## 不一致の調査

- 共通の不一致 `retry-exhausted-response`: 期待 `pass`、両方式の結果 `violation`。3問版の `failure_handling` は `meaning_lost`。入力断片は `TemporaryError` で再試行を尽くすと `err.response` を返す。出典の[クラス定義](https://github.com/speakeasy-api/speakeasy-client-sdk-typescript/blob/d67fd88877c83268a900a6aee721e576c2c0203d/src/lib/retries.ts#L55-L70)では `response: Response` を保持し、[呼び出し側](https://github.com/speakeasy-api/speakeasy-client-sdk-typescript/blob/d67fd88877c83268a900a6aee721e576c2c0203d/src/lib/retries.ts#L93-L126)は再試行対象のHTTPレスポンスをそのまま格納する。元のHTTPステータスと本文が残るので、例外を通常の成功値に捏造したケースではない。ただし**Jevに渡した関数単体**にはこの生成元がなく、断片だけから同じ結論が確定できるかは不明。ルールの誤判定と入力コンテキスト不足をこの1件だけでは切り分けられない。期待値は変更しない。
- 2問版だけの不一致 `retry-after-header`: 期待 `pass`、結果 `borderline`。ヘッダ不在・不正時の `0` は再試行間隔の制御上の表現で、3問版は `pass`。この1件の改善を汎用的な優位性とみなさない。

## 評価の限界と次の扱い

コードは外部著者の既存コードで、評価結果を見て期待判定を書き換えていない。一方、12件の**選択と期待判定は実装を知る同じassistant**が行った。失敗隠蔽のissueを起点に探したため無作為抽出でもなく、独立作問者・独立ラベル付け者によるテストではない。従って11/12を一般化精度や独立評価の証明として扱わない。今回の不一致を使って実装・質問文・入力範囲を変更するなら、この12件は開発用となり、次の検証には未使用の外部コードと独立したラベルが必要。

この比較までのJev呼び出しは予算設定以降 **124/300回**（残り176回）。この記録の作成と調査では追加呼び出しをしていない。
