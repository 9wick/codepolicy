# 関心の分離 (Separation of Concerns)

## 背景

SoC は「異なる関心（責務・抽象レベル・技術的事項）をコード上で混在させない」原則。
観点を分解すると以下の4つに整理できる。

| 観点 | 意味 |
|---|---|
| 配置 | ある責務のコードが正しい場所（ファイル/モジュール）にあるか |
| スタイル一貫性 | 同じロール/レイヤーの関数同士が揃っているか |
| 責務の単一性 (SRP) | 1つの関数/モジュールが1つの関心に閉じているか |
| 依存方向 | 高位レイヤーが低位レイヤーに一方向に依存しているか |

## 既存ルールとの対応

| 観点 | 既存ルール | 状況 |
|---|---|---|
| 配置 | `ssot-placement`, `ssot-violation` | ✅ 手厚い |
| スタイル一貫性 | `layer-symmetry` | ✅ |
| 責務の単一性 | なし | ❌ 未カバー |
| 依存方向 | なし | ❌ 未カバー |

補足: `code-duplication` は SoC そのものではなく「重複排除」の観点なので、ここでは参考扱い。

## 不足している観点

### 責務の単一性 (SRP)

「1つの関数がバリデーション・DB保存・メール送信を全部やっている」ような**異なる関心が1関数に凝集した状態**を検出する仕組みが無い。`function-contract` が「命名と副作用の矛盾」を拾うが、SRP 違反全般をカバーするものではない。

### 依存方向

domain 層が infrastructure 層を import する、のようなレイヤー越境は構文検出（eslint-plugin-boundaries など）で拾える部分もあるが、**意味的な越境**（「domain の関数だが内部で HTTP クライアントを直接呼んでいる」など）は codepolicy の守備範囲。

## 新ルール候補

### `single-responsibility`

- **Scope**: function
- **問い**: 関数内の操作が、異なる関心（異なる抽象レベル・異なる技術領域・異なる IO 種別）に跨っていないか。
- **Pass**: `registerUser(input)` が `validateInput → persistUser → publishEvent` のように同じ抽象レベルのステップを直列に並べる。各ステップ自体は別関数。
- **Fail**: 同じ `registerUser` の中で、バリデーション処理・SQL 組み立て・SMTP 呼び出し・ログ書き込みが全部インラインで混在している。

### `dependency-direction`

- **Scope**: function または file
- **問い**: 関数/ファイルの import 先が、レイヤー階層上、自分より**高位の責務**を参照していないか。
- **Pass**: `domain/user.ts` が `shared/result.ts` のみを import。
- **Fail**: `domain/user.ts` が `infrastructure/db/userRepo.ts` を直接 import している。
- **備考**: レイヤー判定は「ファイルパス規約」+ 「公開シグネチャから推論される役割」で行う。純粋な構文ルールでは捉えにくい意味的越境を対象とする。

## プリセットでの扱い

```yaml
codepolicy:separation-of-concerns:
  - ssot-placement
  - ssot-violation
  - layer-symmetry
  - single-responsibility  # 新
  - dependency-direction   # 新
```

## 関連原則との重なり

- **副作用の隔離** — `single-responsibility` が「複数種の副作用混在」を検出する `effect-kind-cohesion` と部分的に重なる。`single-responsibility` は抽象レベル全般、`effect-kind-cohesion` は副作用種別に特化、と棲み分ける。
- **カプセル化** — `dependency-direction` は「実装詳細が高位から参照される」ことを防ぐ意味でカプセル化とも関連するが、主眼は「方向」なので SoC 側に置く。
