# no-implicit-fallback fixtureの復旧

## 復旧の対象と契約

目的は、質問や判定方式を変えても同じテストケースで改善・退行を比較できる状態に戻すこと。今回、判定ルールや既存fixtureの期待値は変更しない。

- git履歴上の旧fixture全12件を保持する。削除されていた2件は元のID・source・context・期待値・期待理由のまま復旧する。
- 直前に追加した意味論fixture12件も残す。旧ケースとの入れ替えにしない。
- Jevの実行対象は24件すべて。旧12件をbaseline専用にしない。
- API不要の内部テストで、24件の内容と実際のテスト登録を検査する。
- 実APIの全件評価は内部テストと区別し、未実行なら精度が改善したとは報告しない。

## 復旧元

`src/test-support/jev-fixtures/no-implicit-fallback.ts`の全履歴を確認した。

| case IDの末尾 | 差し替えが起きたcommit | 復旧元 | 元の期待値 |
| --- | --- | --- | --- |
| `development/legacy-valid-1` | `4441d3e`で`technical-default`へ差し替え | `2e4047b` | pass |
| `development/additional-3` | `2a5225f`で`boundary-default-with-swallowed-failure`へ差し替え | `2e4047b` | violation |

`technical-default`と`boundary-default-with-swallowed-failure`も削除しない。これにより歴代ケースの和集合は12件となる。残っていた10件の内容は変更していない。`1cbbb4d`で追加された既存10件の`qualifiedSymbol`も保持し、復旧した2件へは新しいcontextを付け足していない。

旧版同士でもcontextに差があるため、過去の正答率をそのまま同条件の比較結果として扱うことはできない。方式を比較するときは、今回固定した同一入力を両方に渡す。

## 登録数と保護

| 対象 | 件数 |
| --- | ---: |
| no-implicit-fallbackの旧Jev回帰 | 12 |
| no-implicit-fallbackの意味論Jev回帰 | 12 |
| 同ファイルの既存LLM baseline | 12 |
| 同ファイルの全テスト登録 | 36 |
| 5ルール共通の比較測定用fixture | 52 |
| 共通比較測定の評価回数（2経路×3反復） | 312 |

意味論12件は共通比較測定の52件とは別枠だが、同じ`rule.test.ts`でJevの回帰テストとして登録される。他4ルールのfixtureは各10件のまま変更なし。

`src/test-support/no-fallback-fixture-integrity.test.ts`にIDとSHA-256の固定台帳を置いた。sourceだけでなくcontext・期待値・理由、意味論ケースの独立2問の期待回答も含めて照合する。さらにVitestの`list`による実際の登録を検査し、ケースを保持したままJev側の実行対象から外す変更も検出する。`list`はテストを実行せず、APIを呼ばない。

ケースを追加する場合も既存エントリは維持する。期待値の訂正が必要になった場合は判定結果に合わせて書き換えず、契約の変更として理由と版を明示する。

旧期待値には入力補完をpass/violationとするものがある一方、現ルールには解釈権限未設定を保留とするpolicyがある。その差を今回の復旧で隠していない。旧ケースが現ルールで全件成功するとは主張しない。

## 検証

- TDD: 復旧前は内容・総数・登録の3テストが失敗し、復旧後に成功。比較測定CLIも旧固定値300を返す失敗を確認してから、fixture数から算出するよう修正。
- `bun run test src/test-support/no-fallback-fixture-integrity.test.ts src/test-support/jev-fixtures.test.ts src/test-support/decision-rule-tester.test.ts`: 3ファイル・5テスト成功。
- `bunx vitest list --config vitest.rules.config.ts src/rules/jev-no-implicit-fallback/rule.test.ts -t 'Jev' --json`: 旧12件＋意味論12件、計24件が登録されることを確認。
- `bun run benchmark:jev --check`: `rules: 5, cases: 52, evaluations: 312`。API・結果ファイル書き込みなし。
- `NODE_OPTIONS=--max-old-space-size=4096 bun prepush`: format・型検査・lint・build・内部テスト成功。47ファイル・411テスト成功。
- `git diff --check`: 成功。

未検証: 復旧後の24件を使った実API全件回帰、過去方式との同一条件再比較、self精度。追加API呼び出しなし（調整予算は前回の100/100のまま）。commit/pushなし。
