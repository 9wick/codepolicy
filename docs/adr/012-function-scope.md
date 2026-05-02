# ADR-011: scopeの設計

**日付:** 2025-03  
**ステータス:** 決定

## 背景

LLMに渡すコードの範囲（scope）を決定する。scopeはルールのfrontmatterで指定し、ルールごとに異なる範囲のコードをLLMに渡す。

## 決定

**MVPは `function` と `file` の2種類。**

## scopeの定義

### `function`（デフォルト）

diff行を含む最小のnamed functionの本体のみを渡す。

```ts
// これだけ渡す
function getUserById(id: string): Result {
  // diff行がここにある
  await logger.write(...)  // ← 副作用
  return db.find(id)
}
```

- importや型定義（interface / type）は含めない
- 関数名・引数・返り値の型アノテーション・本体があればLLMは十分判断できる
- promptが膨らむのを防ぎ、コストを抑える

対象の特定方法：
1. git diffで変更行を取得
2. tree-sitterで変更行を含む最小のnamed functionを特定
3. その関数全体をLLMに渡す

### `file`

ファイル全体を渡す。ファイルレベルの構造・責務を見るルール向け。

```
// ファイル全体
```

- `layer-responsibility` のように、ファイル全体の構成を見ないと判断できないルールで使う
- コストが高くなるため、ルール設計時に意識して使う

## 議論した選択肢

**function + import + 型定義**
- 精度が上がる可能性がある
- promptが膨らみコスト増
- 関数単体で読めることをルール設計の前提にすれば不要

**function のみ（採用）**
- LLMは関数名・引数・返り値の型アノテーション・本体から十分判断できる
- promptを小さく保てる
- ルール設計側が「関数単体で判断できる粒度」を意識する前提

## 将来の拡張

- `function+types`: 関数本体 + 同ファイルの関連型定義（必要になったら追加）
- `class`: クラス全体
- カスタムscopeのプラグイン対応
