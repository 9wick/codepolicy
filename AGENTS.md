## Code Policy
- Nestjs風のDIを採用する。実態はneedle-di。あくまでcontainerとしてのclassを利用するので、classとしての機能（継承/メンバ変数など）は利用禁止。implementsは許容
- テストコードはt-wadaのTDD方式で作成する。
- 型厳格を採用する。as禁止, など。詳細は eslintのルールを参照すること。
  - any の完全排除、型アサーション (as, <Type>) 、 throw、Non-null assertion (!) 、などの使用禁止。

- Railway Oriented Programmingを採用する。



## Definition of Done

- mdファイルのみ変更：
  - 変更内容を明記する。
- “src/**' を変更：
  - t-wadaのTDD方式でtestが作られている
  - bun prepushを実施し成功している
- 実行不能項目がある場合は理由を明記する。
