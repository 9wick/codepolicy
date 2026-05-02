# ルールの粒度とプリセットによる束ね方

## 背景

設計原則（契約による設計・関心の分離・カプセル化・副作用の隔離）を codepolicy のルールに落とし込む際、
「原則ごとに1つの大きなルールを作るか」「観点ごとに細かいルールを作るか」という設計判断がある。

結論: **細かいルールで分割し、プリセットで束ねる**。

## 細かく分ける理由

### 1. scope が混在してまとめられない

既存ルールは `scope`（`function` / `type` / `exported-function` / `test-case`）で1つの対象に絞っている。
原則単位で束ねようとすると複数スコープに跨り、現状の rule-types と噛み合わない。

- 契約による設計 = `function`（事前・事後条件） + `type`（不変条件）
- 関心の分離 = `function`（SRP） + `exported-function`（配置・依存方向）

### 2. LLM 精度が落ちる

codepolicy の強みは「1ルール = 1つの具体的な問い」を LLM に投げて推論の焦点を絞れる点。
「契約は守られているか」を1問にすると、事前条件・事後条件・不変条件を同時評価することになり、
どれか一つに引っ張られて他を見落とす典型的な失敗パターンに入る。

### 3. 粒度制御ができなくなる

プロジェクトによっては「事後条件は厳しく、SRP は緩く」のような運用をしたい。
1ルールにまとめると threshold や disable が粗くなり、チューニングが効かない。

## プリセットの考え方

ユーザー視点の概念（原則）と、ルール実装の粒度（1問=1ルール）を分離する。
概念単位の束ねは**プリセット**で吸収する。eslint の `extends` と同じ発想。

```yaml
extends:
  - codepolicy:design-by-contract
  - codepolicy:encapsulation
  - codepolicy:separation-of-concerns
  - codepolicy:side-effect-isolation
```

## プリセット間での重複は許容する

同じルールが複数プリセットに属してよい。
原則同士が本来的に重なる部分があるため、統合するより重複許容のほうが素直。

### 特に不変条件 は複数原則に属する

| ルール | DbC | カプセル化 |
|---|:---:|:---:|
| `no-invalid-state-type` | ✅ | ✅ |
| `invariant-protected-constructor` | ✅ | ✅ |

DbC 視点では「不変条件は実装側の責任」、カプセル化視点では「外部から壊せないようにする境界設計」。
視点が違うが、同じルールで両方を満たせる。

### その他のクロスカット

| ルール | 主属先 | サブ属先 |
|---|---|---|
| `effect-kind-cohesion` | 副作用の隔離 | 関心の分離（SRP の一特化） |
| `function-contract` | 副作用の隔離 | 契約による設計（契約表明の一貫性） |
| `dependency-direction` | 関心の分離 | カプセル化（実装詳細の越境参照抑止） |

## プリセット構成案（総まとめ）

```yaml
codepolicy:design-by-contract:
  - strict-function-boundary
  - postcondition-consistency         # 新
  - no-invalid-state-type
  - invariant-protected-constructor   # 新

codepolicy:encapsulation:
  - no-implementation-leak            # 新
  - invariant-protected-constructor   # 新
  - opaque-type-boundary              # 新
  - no-invalid-state-type

codepolicy:separation-of-concerns:
  - ssot-placement
  - ssot-violation
  - layer-symmetry
  - single-responsibility             # 新
  - dependency-direction              # 新

codepolicy:side-effect-isolation:
  - function-contract
  - pure-core-impure-shell            # 新
  - effect-kind-cohesion              # 新
  - no-global-mutation                # 新
```

## 新規ルール一覧

| ルール | 属するプリセット |
|---|---|
| `postcondition-consistency` | DbC |
| `invariant-protected-constructor` | DbC / Encapsulation |
| `no-implementation-leak` | Encapsulation |
| `opaque-type-boundary` | Encapsulation |
| `single-responsibility` | SoC |
| `dependency-direction` | SoC |
| `pure-core-impure-shell` | SideEffect |
| `effect-kind-cohesion` | SideEffect |
| `no-global-mutation` | SideEffect |

合計 9 ルール。実装優先度は各テーマ別 md を参照。
