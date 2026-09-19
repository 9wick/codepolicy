# no-implicit-fallback v3：self実行検証

実行日: 2026-09-19

モデル: `typesafe-jev-1.13.0`

対象rule: `jev-no-implicit-fallback`

設定: `.codepolicy.jev.yml`、`filter: all`、`concurrency: 1`、通常cache経路

## 実行結果

- 対象: 101 files、339 function scopes
- pass: 298
- violation: 41
- borderline: 0
- API / response validation error: 0
- 初回: 78.0秒、input 386,139 tokens、output 58,288 tokens
- 同一条件の再実行: 339 / 339 cache hit、0.1秒、input/outputとも0 tokens

初回ログは`self-jev-no-implicit-fallback-v3-layer-role.log`、cache再実行ログは`self-jev-no-implicit-fallback-v3-layer-role-cache-replay.log`に保存した。いずれも`*.log`としてgitignore対象である。

終了コード1は41件のerror-level violationによるもので、API障害ではない。

## 判定理由の内訳

通常表示された主理由は次のとおり。

| reason | 件数 | selected probabilityが0.7未満 |
| --- | ---: | ---: |
| 内部化済み値の不在を正常値へ変換 | 35 | 5 |
| 境界外でraw入力の不在を正常値へ変換 | 2 | 2 |
| 失敗を成功値へ変換 | 4 | 1 |

全339件のlayer roleは`internal_layer` 305件、`config_input_boundary` 16件、`user_input_boundary` 18件だった。

## 人手確認

実コードで有効な検出候補は存在する。

- `samples/jev/fallback.ts:calculateInvoiceTotal`: `unitPrice ?? 0`で価格不在を0へ潰す。
- `src/infrastructure/llm/codex.adapter.ts:extractCodexUsage`: usage欠損を0へ変える。
- `src/infrastructure/llm/anthropic.adapter.ts:extractUsageFromResult`: result自体の欠損を全0 usageへ変える。
- `src/infrastructure/llm/anthropic-model-lister.ts:parseModels`: model field欠損を空文字へ変える。
- `src/application/rule-execution/file-tree.lib.ts:generateFileTree`: `git ls-tree`失敗を`undefined`へ変える。

一方、明確な誤検知も多数ある。

- `groupRecords`、`findDuplicateRuleIds`、`computeFingerprint`、`logScopeTypeBreakdown`のMap/counter初期値。
- `evaluateAnyExpression`の空集合score 0、`bestOutcome`の探索用`undefined`、`composeConcern`のreduce初期値。
- `processHunkLine`の状態機械用`null`、`opencode-server-manager.acquire`の内部状態reset。
- `formatSchemaError`の表示専用placeholder。
- `simple-git.adapter.diff`の公開method既定引数`HEAD`。
- `resolveSettings`、`validateOptions`、`loadRuleModules`等のCLI/config入力補完。

これらは「内部値の不在を具体値へ置換した」という構文的・局所的説明には合うが、規約が防ぎたい業務データ・外部データの不可逆な意味変換ではない。

また、config境界と推定した関数でも`external_input_default=present`と`internal_value_default=present`が同時に選ばれ、後者のviolationが優先された例がある。独立質問にしたことで複合違反は保持できるが、同じ補完操作をexternal/internalの両方として数える誤判定も可能になっている。

## 結論

development fixture 6/6は実コード精度を表していなかった。現在のruleは有効な候補を検出できる一方、技術的初期値、状態機械、集約演算、表示placeholder、設定境界を`internal_value_default`へ広く含めるため、self lintとしては誤検知過多で未成立である。

次の修正ではlayer分類を増やす前に、`internal_value_default`を「業務・外部由来のdata-bearing valueの意味を不可逆に確定したか」へ狭める必要がある。ただし再び一つの長い違反質問へ戻さず、少なくとも次を独立観測または明示的除外として扱う。

- collection/counter/reductionのidentity初期化
- control-flow/state-machine sentinel
- display/log/error-message placeholder
- public function parameterとraw config/CLI入力の補完
- missingとfailureの区別を保持したまま別表現へ写す処理

confidence閾値だけでは解決しない。41件中0.7以上の誤検知も複数あり、0.7未満を保留へ戻しても主要な誤検知が残る。
