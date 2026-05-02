# 副作用の隔離 (Isolation of Side Effects)

## 背景

関数型プログラミング / データ指向設計における核心原則の一つ。
本質は「純粋なロジックと不純な IO を分離し、IO を edge に押し出す」こと。

観点を分解すると:

| 観点 | 意味 |
|---|---|
| pure / impure の分離 | ドメインロジックは純粋関数、副作用は周辺層に集中 |
| 副作用の明示化 | 型レベルで副作用が見える（戻り値・シグネチャから推測可能） |
| 副作用の種別分離 | DB / HTTP / ログ / 時刻取得 などを混ぜない |
| グローバル可変状態の排除 | モジュールスコープの書き換え可能な状態を持たない |

## 既存ルールとの対応

| 観点 | 既存ルール | 状況 |
|---|---|---|
| 副作用の明示化 | `function-contract`（命名と副作用の整合） | △ 限定的。効果の**有無**のみ |
| pure / impure の分離 | なし | ❌ |
| 副作用の種別分離 | なし | ❌ |
| グローバル可変状態の排除 | なし | ❌ |

補足: `function-contract` は「get 系の名前なのに副作用がある」のようなミスマッチを検出するが、「副作用をどこに置くべきか」「種別が混ざっていないか」「グローバル状態がないか」は別の問い。

## 新ルール候補

### `pure-core-impure-shell`

- **Scope**: function
- **問い**: ドメイン層 / ユースケース層の関数に、IO 操作（DB / HTTP / 時刻 / 乱数 / ログ / ファイル）が**直接**含まれていないか。副作用は infrastructure 層の adapter に委譲されているべき。
- **Pass**: `decideShippingTier(order, rates): Tier` が純粋関数で、現在時刻や DB が必要な場合は引数として受け取る。
- **Fail**: `decideShippingTier(order)` の内部で `new Date()` や `await db.query(...)` を呼んでいる。

### `effect-kind-cohesion`

- **Scope**: function
- **問い**: 1つの関数内で**複数種類**の副作用（例: DB 書き込み + メール送信 + 外部 API 呼び出し + ログ出力）が混在していないか。
- **Pass**: `saveUser(input)` は DB 書き込みのみを行い、メール送信は別関数に分離されている。
- **Fail**: `registerUser(input)` が DB insert・welcome メール送信・audit ログ書き込みを1関数内で全部行う。
- **備考**: **関心の分離**の `single-responsibility` と隣接するが、こちらは副作用種別に特化した観点。

### `no-global-mutation`

- **Scope**: file
- **問い**: モジュールスコープの可変状態（`let x = 0; export function inc() { x++ }` のような共有ミュータブル state）を持っていないか。
- **Pass**: モジュールトップレベルは `const` のみ。状態が必要な場合は引数で受け渡す、または DI コンテナ経由で注入。
- **Fail**: モジュールトップレベルの `let` / 配列への push / オブジェクトのプロパティ書き換え。
- **備考**: プロジェクトの CLAUDE.md で singleton / global state が禁止されている方針と整合する。

## 既存の `function-contract` との棲み分け

同じ「副作用」を見ているようでも、問いが違うので分けて成立する:

| ルール | 何を見るか |
|---|---|
| `function-contract` | 命名・シグネチャと副作用の**矛盾**（ミスマッチ） |
| `pure-core-impure-shell` | 副作用の**配置**（どの層にあるか） |
| `effect-kind-cohesion` | 副作用の**粒度**（何種類混ざっているか） |
| `no-global-mutation` | 副作用の**保存先**（モジュール外の共有状態に漏れていないか） |

## プリセットでの扱い

```yaml
codepolicy:side-effect-isolation:
  - function-contract            # 命名 vs 副作用
  - pure-core-impure-shell       # 新
  - effect-kind-cohesion         # 新
  - no-global-mutation           # 新
```

## 関連原則との重なり

- **関心の分離** — `effect-kind-cohesion` は `single-responsibility` の一特化。両プリセットに入れる。
- **契約による設計** — `function-contract` が契約の表明の一貫性としても機能するため、副作用側に主軸を置きつつ DbC プリセットからも参照され得る（要検討）。
