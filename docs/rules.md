# Built-in Rules

codepolicy に組み込まれているルールの一覧です。

## 実験用Jevルール（PoC）

既存ルールとは別ID。`typesafe-jev` / `typesafe-jev-latest` / `typesafe-jev-<x.y.z>` 専用で、既存の文章生成モデルとは組み合わせられない。`level`・`borderline`・`overrides`の意味は変更なし。専用optionsはない。

| 新規ルール | Scope | 判定範囲 |
|---|---|---|
| jev-no-implicit-fallback | function | 不足入力の補完、失敗の成功値化、段階的な代替値の使用 |
| jev-strict-function-boundary | function | 未確定な業務入力、曖昧な成功結果、前提分岐、主要処理内の正規化 |
| jev-no-invalid-state-type | type / interface | 必須値欠損、状態矛盾、値の混同、検証前後の混在 |
| jev-ssot-placement | exported-function | パス／layerと責務の不一致。兄弟関数との凝集度は対象外 |
| jev-no-nonstandard-code | function | 動的実行、意図を隠す変換、形状破壊、不要に複雑な制御 |

各観点は違反命題に対するNoul値。0.7以上がviolation、0.3以下がpass、その間がborderline。1観点でもviolationなら全体violation、全観点passならpass、それ以外はborderline。閾値はPoCの固定値であり、正解率の保証ではない。

通常出力では合成判定に該当する指摘だけを定義順に表示する。値は丸めない。Jevには引用機能がないため`rule run`にもCitations行を表示しない。`--reasoning-effort`は実行前エラー。詳細は [比較測定](benchmark/README.md)。

通常lint・`rule run` は、text/Jevとも既定で既存の結果キャッシュを利用する。同じ評価入力なら再実行時の推論API呼び出しは発生しない。Jevの質問・表示ラベル・include・閾値の変更はキャッシュキーへ反映される。ファイル全体を評価する `rule run` と通常lintの抽出scopeは区別する。

強制的に再評価したい場合は、どちらも `--no-cache` を付ける。この実行ではキャッシュを照会せず、結果も保存しない。hit時の今回のusageは0となり、`--verbose` では保存済みのJev生値も確認できる。

```sh
codepolicy rule run jev-no-implicit-fallback src/example.ts --config .codepolicy.jev.yml
codepolicy rule run jev-no-implicit-fallback src/example.ts --config .codepolicy.jev.yml --no-cache
codepolicy --config .codepolicy.jev.yml --no-cache
```

## 概要

| Rule | Scope | Threshold | 概要 |
|------|-------|-----------|------|
| [function-contract](#function-contract) | function | 70 | 関数名から期待される振る舞いと実装の一致 |
| [strict-function-boundary](#strict-function-boundary) | function | 70 | 業務関数の入力が曖昧でないか |
| [no-implicit-fallback](#no-implicit-fallback) | function | 70 | 欠損値を暗黙のデフォルトで埋めていないか |
| [no-invalid-state-type](#no-invalid-state-type) | type | 70 | 型定義が不正状態を許容していないか |
| [code-duplication](#code-duplication) | function | 70 | 意味的に重複した関数がないか |
| [layer-symmetry](#layer-symmetry) | function | 70 | 同レイヤーの関数間でスタイルが一貫しているか |
| [ssot-placement](#ssot-placement) | exported-function | 70 | 関数がアーキテクチャ上正しいファイルに配置されているか |
| [ssot-violation](#ssot-violation) | exported-function | 70 | 関数の正規の居場所(SSOT)と現在の配置の一致 |
| [test-validity](#test-validity) | test-case | 70 | テスト名とアサーションが一致しているか |

---

## function-contract

関数の実装から振る舞いを推論し、名前・引数・戻り値から呼び出し元が抱く期待に対して実装が裏切っていないかを検証する。特に命名と副作用の矛盾を検出する。

- **Scope**: function
- **Threshold**: 70

**Pass**: `getUser(id)` が DB を検索して `Result<User, Error>` を返すだけの関数。

**Fail**: `getUser(id)` の中で `sendEmail(id)` を呼んでいる関数。get 系の名前なのに副作用がある。

---

## strict-function-boundary

業務ロジックを担う関数が、オプショナル引数・`Partial<T>`・過度に広い union 型など曖昧な入力を契約として受け入れたまま処理を進めていないかを検証する。境界に入る時点で入力が正規化・検証済みであることを要求する。

- **Scope**: function
- **Threshold**: 70

**Pass**: `processOrder(order: Order): Receipt` のように具体的な型を受け取り曖昧さがない関数。

**Fail**: `processUserRegistration(name?: string, email?: string, role?: ...)` のようにオプショナル引数を内部で `?? 'Guest'` と既定値補完しながら業務処理を進める関数。

---

## no-implicit-fallback

欠損・不正状態を業務上有効な既定値（例: `'JP'`、`0`、`'guest'`）に暗黙変換して処理を続行していないかを検証する。失敗を明示的に返すべきところで都合のよい値にすり替えていないかを見る。

- **Scope**: function
- **Threshold**: 70

**Pass**: `processOrder` で空の注文は `throw new Error(...)` で明示的に失敗させている。

**Fail**: `decideShippingTier` で `order.shippingAddress?.country ?? 'JP'` として国が未設定でも業務決定を続行する。

---

## no-invalid-state-type

type / interface 定義が不正状態・未検証状態を表現できてしまっていないかを検証する。必須フィールドの optional 化、相互制約のない複数フィールド、primitive の意味混同などを検出する。

- **Scope**: type
- **Threshold**: 70

**Pass**:
```ts
type OrderState =
  | { kind: 'pending'; items: Item[] }
  | { kind: 'approved'; approvedAt: Date; items: Item[] };
```
各状態ごとに必須フィールドが閉じている判別共用体。

**Fail**:
```ts
interface Shipment {
  status: 'pending' | 'shipped';
  shippedAt?: Date;
}
```
`status: 'shipped'` なのに `shippedAt` が未設定という不正な組み合わせが型上許容される。

---

## code-duplication

コードベース内の関数を AST フィンガープリントで類似検索し、変数名の違いを超えて意味的に重複している関数を統合すべきかどうかを LLM で判定する。

- **Scope**: function
- **Threshold**: 70

**Pass**: `calculateArea(width, height)` と `formatUserName(first, last)` のように処理の目的が全く異なる関数。

**Fail**: `sumNumbers(items)` と `addAll(values)` のように変数名だけ変えた実質同一ロジック。

---

## layer-symmetry

対象関数と同じロール・同じレイヤーに属する関数群を特定し、エラーハンドリング、戻り値型、命名規則などの記述スタイルが一貫しているかを評価する。

- **Scope**: function
- **Threshold**: 70

**Pass**: `findUserById` と `findOrderById` が同じ `Result<T, NotFoundError>` パターンと `.mapErr()` チェーンで統一されている。

**Fail**: `findUserById` が `User | null` で生 SQL 直書き、`findOrderById` が `Result<Order, AppError>` とリポジトリ委譲。同ロールなのにスタイルが混在。

---

## ssot-placement

エクスポートされた関数が、ファイルの命名規則・ディレクトリの責務・アーキテクチャ上のレイヤーに照らして適切な場所に配置されているかを評価する。

- **Scope**: exported-function
- **Threshold**: 70

**Pass**: `formatDate(date)` が `src/utils/date.ts` に置かれている。

**Fail**: `sendWelcomeEmail(user)` が `src/models/user.model.ts` に置かれている。メール送信ロジックがモデルファイルにある。

---

## ssot-violation

関数の責務と抽象レベルを分析し、ファイルツリーの中で「その責務の Single Source of Truth となるべき正規の居場所」と現在の配置が一致しているかを判定する。

- **Scope**: exported-function
- **Threshold**: 70

**Pass**: `formatDate(date)` が `src/utils/date.ts` に配置されている。日付整形のユーティリティとして正規の場所。

**Fail**: `sendWelcomeEmail(user)` が `src/models/user.model.ts` に置かれている。正規の居場所として `src/services/email.service.ts` が推定される。

---

## test-validity

テストケースのアサーションがテスト名の主張を正しく証明しているかを、テスト名から期待される検証内容を先に推論した上で実際のコードと照合する。

- **Scope**: test-case
- **Threshold**: 70

**Pass**: テスト名「should return error for invalid email」に対して `expect(result.isErr()).toBe(true)` でエラーを検証している。

**Fail**: 同じテスト名なのに `expect(user.name).toBe('test')` しかアサートしていない。メール検証と無関係。
