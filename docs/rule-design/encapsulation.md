# カプセル化 (Encapsulation)

## 背景

カプセル化の本質は Parnas の情報隠蔽 (1972) に立ち戻る:

> **「変わりうる実装詳細」をモジュール内部に閉じ込め、外部は抽象的なインターフェースだけを知る**

「何個 export されているか」ではなく「**何を隠しているか**」が論点。未使用コードの検出はカプセル化ではなく dead code elimination の話であり、混同しないこと。

関数型/データ指向では、class の private/public ではなく以下の形で具体化される:

| 観点 | 意味 |
|---|---|
| 情報隠蔽 | 公開 API のシグネチャ・型から実装詳細（DB スキーマ、中間表現、技術的都合）が漏れていない |
| 不変条件の保護 | 不正な状態を持つ値をそもそも作れないようにする（smart constructor, opaque type） |
| アクセス経路の強制 | 内部状態への直接 read/write を禁じ、意図された関数経由に限定する |

## 既存ルールとの対応

| 観点 | 既存ルール | 状況 |
|---|---|---|
| 情報隠蔽 | なし | ❌ |
| 不変条件の保護 | `no-invalid-state-type`（型レベル） | △ 型定義は守れるが、生成経路は対象外 |
| アクセス経路の強制 | なし | ❌ |

## 新ルール候補

### `no-implementation-leak`

- **Scope**: exported-function
- **問い**: 公開関数のシグネチャ / 戻り値型に**実装詳細の型**（DB row、内部フラグ、外部ライブラリの型）が露出していないか。
- **Pass**: `findUser(id): Result<User, NotFoundError>` が返す `User` はドメイン型。
- **Fail**: `findUser(id): Promise<UserRow>` のように ORM が返す row 型がそのまま公開境界に出ている。

### `invariant-protected-constructor`

- **Scope**: function
- **問い**: 不変条件を持つドメイン型が、smart constructor / factory 関数を経由してのみ生成されているか。
- **Pass**: `createUser(input): Result<User, ValidationError>` のみで User を作る。
- **Fail**: `const user: User = { id, email }` のように生オブジェクトリテラルを `User` 型として扱っている。
- **備考**: このルールは**契約による設計**にも属する（cross-cutting）。

### `opaque-type-boundary`

- **Scope**: exported-function / type
- **問い**: 意味のある概念（`UserId`, `Email`, `Amount` など）が primitive (`string`, `number`) のまま公開 API に出ていないか。ブランド型 / opaque type で隠蔽されているか。
- **Pass**: `sendEmail(to: Email): Result<void, SendError>` で Email が branded string。
- **Fail**: `sendEmail(to: string)` で呼び出し側が任意の文字列を渡せてしまう。

## プリセットでの扱い

```yaml
codepolicy:encapsulation:
  - no-implementation-leak
  - invariant-protected-constructor  # DbC と共有
  - opaque-type-boundary
  - no-invalid-state-type            # DbC と共有
```

## 関連原則との重なり

- **契約による設計** — 不変条件の保護は両方の原則に属する。同じコードの別側面を見ているため、ルール自体は統合せず、プリセットで重複して含める。
- **関心の分離** — `no-implementation-leak` は「レイヤー越しに内部型が漏れる」問題でもあり、`dependency-direction` と隣接するが、主眼は「可視性」なのでカプセル化側に置く。

## 誤解しがちな点（記録）

当初「1箇所でしか使われない export は internal に閉じるべき」というルール案を出したが、これは**未使用コード検出**であって情報隠蔽とは別物。export 面の最小化は結果論であり、カプセル化の本質ではない。カプセル化は「変わりうる決定を内部に閉じ込める」ことで、表面積の数ではなく**何を隠しているか**が問われる。
