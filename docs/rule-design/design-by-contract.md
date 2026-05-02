# 契約による設計 (Design by Contract)

## 背景

DbC の本質は「呼び出し側と実装側の責任分担を明確にする」こと。
契約は3要素で構成される。

| 要素 | 意味 |
|---|---|
| 事前条件 (precondition) | 関数が動作するために呼び出し側が保証すべき入力条件 |
| 事後条件 (postcondition) | 関数が返す結果/状態について実装側が保証すべき条件 |
| 不変条件 (invariant) | 呼び出し前後で常に成り立つ条件（型・モジュール状態など） |

## 既存ルールとの対応

| 要素 | 既存ルール | 状況 |
|---|---|---|
| 事前条件 | `strict-function-boundary` | ✅ 入力の曖昧さ（optional、Partial、広すぎる union）を禁止 |
| 事後条件 | なし | ❌ 未カバー |
| 不変条件 | `no-invalid-state-type` | △ 型レベルのみ。関数/集約レベルの不変条件は対象外 |

補足: `function-contract` は「命名と副作用の整合性」を見るルールで、**契約の表明の一貫性**を扱う。事後条件そのものの検証ではない。

## 不足している観点

### 事後条件の不在

「`findUserById(id)` は id に一致する User か NotFound を返す」のような、**戻り値の約束**と実装の整合を評価する仕組みが無い。

### 不変条件の生成経路

`no-invalid-state-type` は型定義で不正状態を表現不能にするが、**外部入力から型を名乗らせる**経路（生オブジェクトリテラルでのキャストなど）は検出しない。型だけ完璧でも、バリデーションを経ない生成があれば不変条件は壊れる。

## 新ルール候補

### `postcondition-consistency`

- **Scope**: function
- **問い**: 関数シグネチャ・命名から導かれる戻り値契約と、実装が実際に返す値は整合しているか。
- **Pass**: `findUserById(id): Result<User, NotFoundError>` が id に対応する User を返すか NotFoundError を返している。
- **Fail**: 同じシグネチャで、見つからない時に `null` を握り潰して別ユーザーを返す、デフォルト User を返す、など。

### `invariant-protected-constructor`

- **Scope**: function
- **問い**: 不変条件を持つドメイン型が、smart constructor / factory 関数を経由してのみ生成されているか。
- **Pass**: `createUser(input)` がバリデーションを行い `Result<User, ValidationError>` を返す。
- **Fail**: `const user: User = { id, email }` のように生オブジェクトリテラルを `User` 型として扱っている。
- **備考**: このルールは**カプセル化**にも属する（cross-cutting）。

## プリセットでの扱い

```yaml
codepolicy:design-by-contract:
  - strict-function-boundary         # 事前条件
  - postcondition-consistency        # 事後条件（新）
  - no-invalid-state-type            # 不変条件（型レベル）
  - invariant-protected-constructor  # 不変条件（生成経路） ※encapsulation と共有
```

## 関連原則との重なり

- **カプセル化** — 不変条件の保護は両方に属する。`invariant-protected-constructor` と `no-invalid-state-type` はカプセル化プリセットにも入る。
- **副作用の隔離** — `function-contract`（命名と副作用）は DbC の「契約表明の一貫性」としても機能するが、直接的には副作用側に置く。
