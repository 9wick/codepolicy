# samples

`samples/basic/user-service.ts` は `codepolicy` の実行例です。

`samples/basic/.codepolicy.yml` は sample 用の最小設定です。
ルール本体は sample 側に持たず、`codepolicy` の組み込み既定ルールを使います。

実行は sample ディレクトリで行えます。

```bash
cd samples/basic
bun run validate
bun run lint
```

リポジトリルートから直接試す場合はこれです。

```bash
node dist/entry.mjs --config=samples/basic/.codepolicy.yml validate
node dist/entry.mjs --config=samples/basic/.codepolicy.yml
```

- `getUserProfile()` は `get` 系の名前なのに `console.log` という副作用を持つ
- `"premium"` を複数箇所で重複させており、SSOT 違反の検出対象にしやすい
- ルール定義はこのサンプル側には置かず、配布物に同梱される既定の markdown ルールを使う
