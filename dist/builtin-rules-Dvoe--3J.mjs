import { llmScoreSchema } from "./schema-definitions-D_6JvUJp.mjs";
import { ResultAsync, ok, okAsync } from "neverthrow";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";

//#region src/application/rule-execution/ast-fingerprint.ts
function computeFingerprint(rootNode) {
	const counts = new Map();
	function walk(node) {
		counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
		for (const child of node.children) walk(child);
	}
	walk(rootNode);
	return counts;
}
function cosineSimilarity(a, b) {
	if (a.size === 0 || b.size === 0) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (const [key, valA] of a) {
		normA += valA * valA;
		const valB = b.get(key);
		if (valB !== void 0) dot += valA * valB;
	}
	for (const valB of b.values()) normB += valB * valB;
	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	if (denominator === 0) return 0;
	return dot / denominator;
}
function isNested(a, b) {
	return a.scope.startLine <= b.scope.startLine && b.scope.endLine <= a.scope.endLine || b.scope.startLine <= a.scope.startLine && a.scope.endLine <= b.scope.endLine;
}
function findSimilarScopes(target, candidates, threshold) {
	const results = [];
	for (const candidate of candidates) {
		if (candidate.scope.filePath === target.scope.filePath) {
			if (candidate.scope.startLine === target.scope.startLine) continue;
			if (isNested(target, candidate)) continue;
		}
		const similarity = cosineSimilarity(target.fingerprint, candidate.fingerprint);
		if (similarity >= threshold) results.push({
			scope: candidate.scope,
			similarity
		});
	}
	results.sort((a, b) => b.similarity - a.similarity);
	return results;
}

//#endregion
//#region src/application/rule-execution/fs-walk.ts
function shouldSkipEntry(name) {
	return name === ".git" || name === "node_modules";
}

//#endregion
//#region src/rules/code-duplication/rule.ts
const optionsSchema$2 = Type.Object({
	dirs: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
	similarityThreshold: Type.Optional(Type.Number({
		minimum: 0,
		maximum: 1,
		default: .7
	}))
});
const FUNCTION_TYPES$1 = new Set([
	"function_declaration",
	"method_definition",
	"arrow_function",
	"function_expression"
]);
const TYPE_TYPES = new Map([["type_alias_declaration", "type"], ["interface_declaration", "interface"]]);
function extractName$1(node) {
	if (node.type === "arrow_function" || node.type === "function_expression") {
		if (node.parent?.type === "variable_declarator") return node.parent.childForFieldName("name")?.text;
		return void 0;
	}
	return node.childForFieldName("name")?.text;
}
function extractScopesFromTree(rootNode, filePath) {
	const results = [];
	function walk(node) {
		if (FUNCTION_TYPES$1.has(node.type)) {
			const name = extractName$1(node);
			if (name) results.push({
				scope: {
					filePath,
					scopeType: "function",
					name,
					code: node.text,
					startLine: node.startPosition.row + 1,
					endLine: node.endPosition.row + 1
				},
				fingerprint: computeFingerprint(node)
			});
		}
		const typeKind = TYPE_TYPES.get(node.type);
		if (typeKind) {
			const name = node.childForFieldName("name")?.text;
			if (name) results.push({
				scope: {
					filePath,
					scopeType: typeKind,
					name,
					code: node.text,
					startLine: node.startPosition.row + 1,
					endLine: node.endPosition.row + 1
				},
				fingerprint: computeFingerprint(node)
			});
		}
		for (const child of node.children) walk(child);
	}
	walk(rootNode);
	return results;
}
function isTsFile$1(name) {
	return name.endsWith(".ts") || name.endsWith(".tsx");
}
async function collectTsFiles$1(dir) {
	const results = [];
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (shouldSkipEntry(entry.name)) continue;
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) results.push(...await collectTsFiles$1(fullPath));
		else if (isTsFile$1(entry.name)) results.push(fullPath);
	}
	return results;
}
function buildComparisonPrompt(sourceA, sourceB, nameA, nameB, filePathA, filePathB) {
	return `以下の2つのコードについて、一方をもう一方で置き換えるか、両方を1つの関数に統合すべきかを判定してください。

## 判定基準
- 変数名やフォーマットの違いは無視し、関数の目的と意図を比較する
- 一方を他方の呼び出しで置き換えられるなら重複
- 両方を1つの関数に統合すべきなら重複
- 以下は重複ではない:
  - 同じデザインパターン（再帰走査、イテレーション、型ガード等）を使っているだけで、パターン内のビジネスロジックが異なる場合
  - 同じデータ構造を扱うが、目的が異なる処理（構築 vs 検証 vs 変換など）

## コード A: ${nameA} (${filePathA})
${sourceA}

## コード B: ${nameB} (${filePathB})
${sourceB}

## 出力
- score: 統合不要なら100、統合すべきなら0
- reason: 判定根拠`;
}
function parseAndCollect(filePaths, parser, workingDir) {
	const allFingerprints = [];
	return filePaths.reduce((acc, filePath) => acc.andThen((fps) => ResultAsync.fromPromise(readFile(filePath, "utf-8"), (e) => e instanceof Error ? e : new Error(String(e))).map((source) => {
		const tree = parser.parse(source);
		const relativePath = path.relative(workingDir, filePath);
		fps.push(...extractScopesFromTree(tree.rootNode, relativePath));
		return fps;
	})), okAsync(allFingerprints));
}
function collectAllFingerprints(scanDirs, parser, workingDir) {
	return ResultAsync.fromPromise(Promise.all(scanDirs.map(collectTsFiles$1)), (e) => e instanceof Error ? e : new Error(String(e))).andThen((fileLists) => parseAndCollect(fileLists.flat(), parser, workingDir));
}
const definition$9 = {
	meta: {
		scope: "function",
		threshold: 70
	},
	optionsSchema: optionsSchema$2,
	create: (workingDir, options) => {
		const rawDirs = options?.["dirs"];
		const dirs = Array.isArray(rawDirs) ? rawDirs.map(String) : void 0;
		const rawThreshold = options?.["similarityThreshold"];
		const threshold = typeof rawThreshold === "number" ? rawThreshold : .7;
		const scanDirs = dirs ? dirs.map((d) => path.resolve(workingDir, d)) : [workingDir];
		const parser = new Parser();
		parser.setLanguage(TypeScript.typescript);
		return collectAllFingerprints(scanDirs, parser, workingDir).map((allFingerprints) => (ctx) => {
			const targetFp = allFingerprints.find((fp) => fp.scope.filePath === ctx.filePath && fp.scope.startLine === ctx.startLine);
			if (!targetFp) return okAsync({
				score: 100,
				reason: "指紋未検出"
			});
			const candidates = findSimilarScopes(targetFp, allFingerprints, threshold);
			if (candidates.length === 0) return okAsync({
				score: 100,
				reason: "類似コード未検出"
			});
			const top = candidates[0];
			if (!top) return okAsync({
				score: 100,
				reason: "類似コード未検出"
			});
			return ctx.llm.evaluate({
				prompt: buildComparisonPrompt(ctx.source, top.scope.code, ctx.name, top.scope.name, ctx.filePath, top.scope.filePath),
				responseFormat: llmScoreSchema
			});
		});
	}
};
var rule_default$9 = definition$9;

//#endregion
//#region src/rules/function-contract/rule.ts
const inferenceSchema$2 = Type.Object({ inference: Type.String({ minLength: 1 }) }, { additionalProperties: false });
function stripTypeDoc(typedoc) {
	return typedoc.replace(/\/\*\*|\*\//g, "").replace(/^\s*\*\s?/gm, "").replace(/@\w+\s*/g, "").trim();
}
const definition$8 = {
	meta: {
		scope: "function",
		threshold: 70,
		usesFileTree: true
	},
	create: () => okAsync((ctx) => ctx.llm.evaluate({
		prompt: `以下の関数の実装を読んで、この関数の公開契約を TypeDoc コメントとして簡潔にまとめてください。
関数名、引数、戻り値、主な副作用を読み取り、利用者が期待する振る舞いが伝わる説明にしてください。

出力形式: TypeDoc コメントのみ（\`/** ... */\` 形式）。補足説明や懸念点は不要です。`,
		include: {
			source: true,
			signature: true,
			fileTree: true,
			filePath: true,
			name: true
		},
		responseFormat: inferenceSchema$2
	}).andThen((step1) => ctx.llm.evaluate({
		prompt: `以下は関数の実装コードから推測された振る舞いと、実際の実装コードです。
関数の「名前・引数・戻り値」だけを見た呼び出し元が抱く期待に対して、実装が裏切っていないかをレビューしてください。

## 推測された振る舞い
${stripTypeDoc(step1.inference)}

チェック観点:
- 名前から期待される責務と実装が大きくずれていないか
- 副作用の有無と命名が矛盾していないか（例: getXxx が書き込みや通知送信をしないか）
- 引数や戻り値の扱いが公開契約として自然か

副作用の定義:
- データベースの読み取り・検索はgetXxxにおける副作用に含めない（標準的なパターン）
- 副作用とは: 書き込み、削除、通知送信、外部API呼び出し（変更系）、ログ出力など、呼び出し元が予期しない外部への影響を指す`,
		include: { source: true },
		responseFormat: llmScoreSchema
	})))
};
var rule_default$8 = definition$8;

//#endregion
//#region src/application/rule-execution/ast-extract.ts
function getNameFromDeclaration(node) {
	return node.childForFieldName("name")?.text ?? null;
}
function extractSignature(node, sourceCode) {
	const body = node.childForFieldName("body");
	if (!body) return node.text;
	return sourceCode.slice(node.startIndex, body.startIndex).trimEnd();
}

//#endregion
//#region src/rules/layer-symmetry/rule.ts
const optionsSchema$1 = Type.Object({ dirs: Type.Optional(Type.Array(Type.String(), { minItems: 1 })) });
const FUNCTION_TYPES = new Set([
	"function_declaration",
	"method_definition",
	"arrow_function",
	"function_expression"
]);
function extractName(node) {
	if (node.type === "arrow_function" || node.type === "function_expression") {
		if (node.parent?.type === "variable_declarator") return node.parent.childForFieldName("name")?.text;
		return void 0;
	}
	return node.childForFieldName("name")?.text;
}
function extractFunctionsFromTree(rootNode, filePath, sourceCode) {
	const results = [];
	function walk(node) {
		if (FUNCTION_TYPES.has(node.type)) {
			const name = extractName(node);
			if (name) results.push({
				filePath,
				name,
				signature: extractSignature(node, sourceCode),
				source: node.text,
				startLine: node.startPosition.row + 1,
				endLine: node.endPosition.row + 1
			});
		}
		for (const child of node.children) walk(child);
	}
	walk(rootNode);
	return results;
}
function isTsFile(name) {
	return name.endsWith(".ts") || name.endsWith(".tsx");
}
async function collectTsFiles(dir) {
	const results = [];
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (shouldSkipEntry(entry.name)) continue;
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) results.push(...await collectTsFiles(fullPath));
		else if (isTsFile(entry.name)) results.push(fullPath);
	}
	return results;
}
const step1Schema = Type.Object({ similarFunctions: Type.Array(Type.String(), { description: "同一ロールと判断した関数の識別子リスト。\"filePath:functionName\" 形式。" }) }, { additionalProperties: false });
function buildStep1Prompt(targetName, targetFilePath, targetSignature, functionList, dirTree) {
	return `以下のプロジェクト構造と関数一覧から、対象関数と「同じロール・同じレイヤー」に属する関数を特定してください。

## 判定基準
- ファイルパスのパターン（同じディレクトリ構造、同じサフィックス等）
- 関数名の命名パターン（同じプレフィックス/サフィックス、同じ動詞+名詞パターン等）
- シグネチャの類似性（引数/戻り値の型パターン）
- 同じ種類の処理を行う関数群（CRUD操作、バリデーション、変換処理等）

## ディレクトリ構造
\`\`\`
${dirTree}
\`\`\`

## 対象関数
- 名前: ${targetName}
- ファイル: ${targetFilePath}
- シグネチャ: ${targetSignature}

## 関数一覧
${functionList}

## 出力
- similarFunctions: 対象関数と同ロールの関数を "filePath:functionName" 形式で列挙
  - 対象関数自身は含めないこと
  - 同ロールの関数がない場合は空配列を返すこと`;
}
function buildStep2Prompt(targetName, targetFilePath, targetSource, similarFunctionsSource) {
	return `対象関数と同ロール関数群の記述スタイルの一貫性を評価してください。

## 評価観点
- エラーハンドリングのパターン（try/catch, Result型, null return, throw等）
- 戻り値の型と構造の一貫性
- 引数の取り方（型、順序、命名規則）
- 内部構造の抽象度（直接実装 vs 委譲パターン）
- 命名規則の一貫性

## スコア基準
- 90-100: 同ロール関数と完全に一貫したスタイル
- 70-89: 概ね一貫しているが、些細な不一致がある
- 40-69: 明らかなスタイルの不一致がある
- 0-39: 同ロール関数と大きくスタイルが異なる

## 対象関数: ${targetName} (${targetFilePath})
\`\`\`typescript
${targetSource}
\`\`\`

## 同ロール関数群
${similarFunctionsSource}`;
}
function parseAndCollectFunctions(filePaths, parser, workingDir) {
	const allFunctions = [];
	return filePaths.reduce((acc, filePath) => acc.andThen((fns) => ResultAsync.fromPromise(readFile(filePath, "utf-8"), (e) => e instanceof Error ? e : new Error(String(e))).map((source) => {
		const tree = parser.parse(source);
		const relativePath = path.relative(workingDir, filePath);
		fns.push(...extractFunctionsFromTree(tree.rootNode, relativePath, source));
		return fns;
	})), okAsync(allFunctions));
}
function collectAllFunctions(scanDirs, parser, workingDir) {
	return ResultAsync.fromPromise(Promise.all(scanDirs.map(collectTsFiles)), (e) => e instanceof Error ? e : new Error(String(e))).andThen((fileLists) => parseAndCollectFunctions(fileLists.flat(), parser, workingDir));
}
function resolveSimilarFunctions(step1Result, otherFunctions) {
	if (step1Result.similarFunctions.length === 0) return void 0;
	const similarSet = new Set(step1Result.similarFunctions);
	const matched = otherFunctions.filter((fn) => similarSet.has(`${fn.filePath}:${fn.name}`));
	return matched.length > 0 ? matched : void 0;
}
function formatSimilarSources(fns) {
	return fns.map((fn) => `### ${fn.name} (${fn.filePath})\n\`\`\`typescript\n${fn.source}\n\`\`\``).join("\n\n");
}
function evaluateSymmetry(ctx, otherFunctions, dirTree) {
	const functionList = otherFunctions.map((fn) => `- ${fn.filePath}:${fn.name} — ${fn.signature}`).join("\n");
	const targetSignature = ctx.signature ?? ctx.name;
	return ctx.llm.evaluate({
		prompt: buildStep1Prompt(ctx.name, ctx.filePath, targetSignature, functionList, dirTree),
		responseFormat: step1Schema
	}).andThen((step1Result) => {
		const similarFns = resolveSimilarFunctions(step1Result, otherFunctions);
		if (!similarFns) return okAsync({
			score: 100,
			reason: "同ロール関数が見つからなかったため判定スキップ"
		});
		return ctx.llm.evaluate({
			prompt: buildStep2Prompt(ctx.name, ctx.filePath, ctx.source, formatSimilarSources(similarFns)),
			responseFormat: llmScoreSchema
		});
	});
}
const definition$7 = {
	meta: {
		scope: "function",
		threshold: 70
	},
	optionsSchema: optionsSchema$1,
	create: (workingDir, options) => {
		const rawDirs = options?.["dirs"];
		const dirs = Array.isArray(rawDirs) ? rawDirs.map(String) : void 0;
		const scanDirs = dirs ? dirs.map((d) => path.resolve(workingDir, d)) : [workingDir];
		const parser = new Parser();
		parser.setLanguage(TypeScript.typescript);
		return collectAllFunctions(scanDirs, parser, workingDir).map((collectedFunctions) => (ctx) => {
			const otherFunctions = collectedFunctions.filter((fn) => !(fn.filePath === ctx.filePath && fn.startLine === ctx.startLine));
			if (otherFunctions.length === 0) return okAsync({
				score: 100,
				reason: "比較対象の関数なし"
			});
			const filePaths = [...new Set(collectedFunctions.map((fn) => fn.filePath))];
			const dirTree = filePaths.sort().join("\n");
			return evaluateSymmetry(ctx, otherFunctions, dirTree);
		});
	}
};
var rule_default$7 = definition$7;

//#endregion
//#region src/rules/no-implicit-fallback/rule.ts
const definition$6 = {
	meta: {
		scope: "function",
		threshold: 70
	},
	create: () => okAsync((ctx) => ctx.llm.evaluate({
		prompt: `以下の関数が「no implicit fallback」の原則に違反していないかを検証してください。

## この rule が見たいこと
- 欠損や不正状態を黙って「業務上妥当な値」に変換して先へ進めていないか
- 呼び出し側へ失敗や未確定状態を返すべきところで、都合のよい既定値にすり替えていないか
- 外側入力の未指定値に意味を与える正規化を、application/domain の主要処理が抱え込んでいないか

## 違反として重く見る例
- 申込なしを \`guest\` にする、未設定金額を \`0\` にする、未入力状態を \`default status\` にするなど、業務上意味のある値へ補完する
- 例外や不正値を握りつぶして、成功扱いの既定値を返す
- 欠損を補完した結果、その後の business/application decision が継続できてしまう

## 違反として扱わないもの
- 単なる検索・照会・参照取得の補助関数における「見つからなければ null」
- debug/logging/display のための軽微な既定値
- 単なる表現上の整形であり、業務上の意味を変えないもの

## 高評価の条件
- 前提を満たさない場合は、明示的に失敗させるか未確定状態として返している
- 欠損や不正を、業務上有効な値にすり替えていない
- fallback があっても、それが business/application decision に影響しない
- 外側入力の未指定値は、主要処理に入る前のプレゼン層・adapter 層・腐敗防止層などで正規化されている

## 判定時の注意
- \`??\`, \`||\`, default 引数の有無だけで機械的に減点しないこと
- 構文ではなく、「欠損/不正を業務上妥当な値へ変換しているか」で判定すること
- 表示用整形や探索結果の不在表現と、外側入力の正規化を区別すること
- 外側入力の未指定値に意味を与える処理は、プレゼン層・adapter 層・腐敗防止層などで済ませるべきであり、application/domain の主要処理に持ち込むべきではない
- application/domain の主要処理で \`??\` や default 引数などにより入力を確定させている場合は、たとえ制御用入力であっても減点対象になりうる`,
		include: {
			source: true,
			signature: true,
			filePath: true
		},
		responseFormat: llmScoreSchema
	}))
};
var rule_default$6 = definition$6;

//#endregion
//#region src/rules/no-nonstandard-code/rule.ts
const findingSchema = Type.Object({
	code: Type.String({
		minLength: 1,
		description: "検出した非標準コード"
	}),
	standard: Type.String({
		minLength: 1,
		description: "標準的な書き方"
	}),
	score: Type.Integer({
		minimum: 0,
		maximum: 100,
		description: "この非標準パターンのスコア（0が最も悪い）"
	}),
	reason: Type.String({
		minLength: 1,
		description: "判定理由"
	})
}, { additionalProperties: false });
const findingsResponseSchema = Type.Object({ findings: Type.Array(findingSchema, { description: "検出された非標準パターンの一覧。なければ空配列。" }) }, { additionalProperties: false });
function toScore(response) {
	if (response.findings.length === 0) return {
		score: 100,
		reason: "非標準なコードは検出されませんでした"
	};
	const score = Math.min(...response.findings.map((f) => f.score));
	const reason = response.findings.map((f) => `${f.code} → ${f.standard} (${f.score}点: ${f.reason})`).join("\n");
	return {
		score,
		reason
	};
}
const PROMPT = `以下の関数が「標準的なコード」だけで書かれているかを検証してください。

## 前提
- ランタイム: 最新LTS Node.js / モダンブラウザ (ES2024+)
- TypeScript: 5.x 以降
- 最新の標準APIが利用可能であることを前提とする

## 「標準的なコード」の定義
- 読んだ開発者の90%が最初に思いつく書き方である
- その言語/ランタイムの公式ドキュメントで推奨されている方法である
- 特別な前提知識なしに意図が読み取れる

## 検証の対象レベル
- 構文・イディオム: 暗黙の型変換や特殊な演算子の使用
- API選択: 同じ結果を得られるよりメジャーなAPIがあるか
- 制御フロー: 不必要な再帰、過剰に複雑なチェーン、意図が読み取りにくい分岐
- 危険なAPI使用: セキュリティリスクや予期せぬ副作用があるAPI

## 重要なルール
- コメントで正当化されていてもダメ。非標準は非標準。
- 「動く」ことは免罪符にならない。標準的な方法で同じことが達成できるなら、そちらを使うべき。
- hackを正当化する理由は存在しない。

## スコアリング基準
- 0点: 任意コード実行（eval, Functionコンストラクタ）
- 20-40点: 暗黙の型変換、ビット演算hack、オブジェクト形状の動的破壊（delete）
- 50-70点: 非慣用的なAPI選択（Object.assign等）、不必要に複雑な制御フロー
- 80-90点: 軽微な非標準（動作・型安全性に問題はないが、より一般的な書き方がある）
- findingsがない場合は空配列を返してください`;
const definition$5 = {
	meta: {
		scope: "function",
		threshold: 70
	},
	create: () => okAsync((ctx) => ctx.llm.evaluate({
		prompt: PROMPT,
		include: {
			source: true,
			filePath: true
		},
		responseFormat: findingsResponseSchema
	}).map(toScore))
};
var rule_default$5 = definition$5;

//#endregion
//#region src/rules/no-invalid-state-type/rule.ts
const definition$4 = {
	meta: {
		scope: ["type", "interface"],
		threshold: 70
	},
	create: () => okAsync((ctx) => ctx.llm.evaluate({
		prompt: `以下の type / interface 定義が「no invalid state type」の原則に違反していないかを検証してください。

## この rule が見たいこと
- この型が、不正な状態や未検証状態をそのまま表現できてしまわないか
- 型の利用者が、値を作れた時点で「妥当な状態だ」と誤解してしまう設計になっていないか
- 未確定状態を表す型が、そのまま completed / validated / normalized 済みの型として主要処理に入っていないか

## 違反として重く見る観点
- 必須な属性が optional/nullish になっていないか
- 複数フィールド間の整合制約を型で表現できていないか
- 生の primitive だけで意味の違う値を混同できないか
- 中間状態や未検証状態を、完成済みの型として表現していないか

## 違反例
- 必須なのに \`foo?: string\` や \`foo: string | null\` で欠損を許す
- \`status\` と \`shippedAt\` のように相互制約があるのに、単一interfaceで矛盾した組み合わせを許す
- \`UserId\`, \`EmailAddress\`, \`Money\` など意味が異なる値を、ただの \`string\` / \`number\` で混同できる
- \`DraftUser\` や \`UnvalidatedOrder\` のような中間状態を、完成済みの \`User\` / \`Order\` と同じ型で表す

## 高評価の条件
- 型を生成できる時点で、妥当な状態だけを表現できる
- 必要なら判別共用体やネストした型で整合制約を表している
- 意味の違う値は、少なくとも型レベルで区別する意図がある
- 未確定状態を表す型が存在する場合でも、それは入力途中・検証前・正規化前の型として閉じ込められている

## 判定時の注意
- 未確定状態を表す型自体は必ずしも違反ではない
- ただし、その型が completed / validated / normalized 済みのものとして扱われるなら違反として重く見ること
- application/domain の主要処理に入る時点では、型は正規化済みであるべきという観点で判定すること
- 単に primitive を使っているだけで自動的に違反にしないこと。意味の取り違えが現実的に起きるかを重視すること
- 構文ではなく、「この型が不正状態を表現可能か」を判定すること`,
		include: {
			source: true,
			filePath: true,
			name: true,
			scopeType: true
		},
		responseFormat: llmScoreSchema
	}))
};
var rule_default$4 = definition$4;

//#endregion
//#region src/rules/ssot-placement/rule.ts
const definition$3 = {
	meta: {
		scope: "exported-function",
		threshold: 70,
		usesFileTree: true
	},
	create: () => okAsync((ctx) => ctx.llm.evaluate({
		prompt: `以下のエクスポートされた関数が、現在のファイルに適切に配置されているかを評価してください。

## 評価観点
1. **責務の一致**: 関数の責務とファイル/ディレクトリの命名規則が一致しているか
2. **レイヤーの適切さ**: プロジェクトのアーキテクチャ構造（ディレクトリ階層）に照らして、この関数が正しいレイヤーにいるか
3. **凝集度**: 同一ファイル内の他の関数（ファイルパスから推測される責務）と関連性があるか

## 判定基準
- 90-100: 完全に適切な配置
- 70-89: 概ね適切だが、より良い場所がありうる
- 40-69: やや不適切。別のファイル/ディレクトリが自然
- 0-39: 明らかに不適切な配置`,
		include: {
			source: true,
			signature: true,
			name: true,
			filePath: true,
			fileTree: true
		},
		responseFormat: llmScoreSchema
	}))
};
var rule_default$3 = definition$3;

//#endregion
//#region src/rules/ssot-violation/rule.ts
const inferenceSchema$1 = Type.Object({
	responsibility: Type.String({ minLength: 1 }),
	abstractionLevel: Type.Union([
		Type.Literal("low-level-utility"),
		Type.Literal("business-logic"),
		Type.Literal("orchestration")
	])
}, { additionalProperties: false });
const canonicalSchema = Type.Object({
	canonicalPath: Type.String({ minLength: 1 }),
	confidence: Type.Integer({
		minimum: 0,
		maximum: 100
	}),
	reason: Type.String({ minLength: 1 })
}, { additionalProperties: false });
const optionsSchema = Type.Object({ dirs: Type.Optional(Type.Array(Type.String(), { minItems: 1 })) });
function parseDirs(options) {
	const raw = options?.["dirs"];
	return Array.isArray(raw) ? raw.map(String) : void 0;
}
function filterFileTree(fileTree, dirs) {
	if (!dirs || dirs.length === 0) return fileTree;
	return fileTree.split("\n").filter((line) => dirs.some((d) => line.startsWith(d))).join("\n");
}
const definition$2 = {
	meta: {
		scope: "exported-function",
		threshold: 70,
		usesFileTree: true
	},
	optionsSchema,
	create: (_workingDir, options) => {
		const dirs = parseDirs(options);
		return okAsync((ctx) => {
			const fileTree = filterFileTree(ctx.fileTree ?? "", dirs);
			return ctx.llm.evaluate({
				prompt: `以下の関数の実装を読んで、2点を分析してください。

1. **responsibility**: この関数の核心的な責務を1-2文で要約してください。
2. **abstractionLevel**: 以下から1つ選んでください。
   - \`low-level-utility\`: データ変換、パーサー、AST操作など、特定のドメインに依存しない低レベル処理
   - \`business-logic\`: ドメイン固有のルールや判定を実装する処理
   - \`orchestration\`: 複数のサービスや処理を組み合わせて一連のワークフローを統合する処理`,
				include: {
					source: true,
					signature: true,
					name: true
				},
				responseFormat: inferenceSchema$1
			}).andThen((step1) => ctx.llm.evaluate({
				prompt: `以下の関数分析に基づき、この関数の「正規の居場所」をファイルツリーから1つだけ特定してください。

## 「正規の居場所」とは
この責務のコードを探すとき、開発者が最初に見に行くべきファイル。
その責務の Single Source of Truth となるべき場所。

## 判断基準
- 関数の責務の本質と、ファイルが担う責務領域との一致度で判断すること。
- ファイル名のキーワードが関数名と表面的に一致するだけでは根拠にならない。
- 抽象レベルの整合性を重視すること: low-level-utility は .lib.ts や utils/ に、orchestration は .service.ts のメインサービスに配置されるべき。
- confidence は「このファイルが正規の居場所であることの確信度」。迷いがあるなら低くすること。

## 重要な制約
- canonicalPath はファイルツリー内の既存ファイルから選ぶこと。
- reason に判断根拠を簡潔に書くこと。

## 関数の分析結果
- 責務: ${step1.responsibility}
- 抽象レベル: ${step1.abstractionLevel}

## ファイルツリー

\`\`\`
${fileTree}
\`\`\``,
				responseFormat: canonicalSchema
			})).andThen((step2) => {
				const isMatch = step2.canonicalPath === ctx.filePath;
				return ok({
					score: isMatch ? 100 : 100 - step2.confidence,
					reason: isMatch ? `正規の居場所 ${step2.canonicalPath} と一致 (confidence: ${step2.confidence})。理由: ${step2.reason}` : `正規の居場所: ${step2.canonicalPath} (confidence: ${step2.confidence})。現在のファイル: ${ctx.filePath}。理由: ${step2.reason}`
				});
			});
		});
	}
};
var rule_default$2 = definition$2;

//#endregion
//#region src/rules/strict-function-boundary/rule.ts
const definition$1 = {
	meta: {
		scope: "function",
		threshold: 70
	},
	create: () => okAsync((ctx) => ctx.llm.evaluate({
		prompt: `以下の関数が「strict function boundary」の原則に違反していないかを検証してください。

## この rule が見たいこと
- 関数が、契約として曖昧な入力/出力を受け入れたまま business/application decision を行っていないか
- 呼び出し側が曖昧な値を渡したり、曖昧な結果を受け取ったまま先に進めてしまう設計になっていないか
- application/domain の主要処理に入る時点で、入力がすでに normalized / validated 済みになっているか

## 違反として重く見る例
- application service / use case / domain logic がオプショナル引数や \`undefined\` を受けたまま処理を進める
- business/application decision を行う関数が \`Partial<T>\` や広すぎる union 型を受け入れる
- 成功系の戻り値なのに \`Foo | null\` や \`Result | undefined\` のような曖昧な返り値で、呼び出し側に業務判断を押し戻す
- 関数の契約が広すぎるために、内部で前提確認や分岐が増えている
- application/domain の主要処理が、外側入力の optional 値を \`??\` や default 引数で確定している
- normalized されるべき execution option や設定入力を、境界で閉じずに内部へ持ち込んでいる

## 違反として扱わないもの
- parser helper / AST traversal / lookup helper のように、「見つからない」を \`null\` や \`undefined\` で返すこと自体が自然な関数
- collection search や name extraction のような探索系 utility
- 単なるデータ変換・補助関数で、business/application decision を担っていないもの

## 高評価の条件
- business/application decision を担う関数の引数と返り値が、その責務に対して具体的で最小限である
- 曖昧な状態を契約に持ち込まず、必要ならより外側で正規化・分岐済みである
- application/domain の主要処理は、境界で確定済みの入力だけを受け取り、内部で optional 値の意味づけをしない

## 判定時の注意
- 構文パターンだけでなく、関数の責務を見ること
- 単に union 型や nullable があるだけでは違反にしないこと
- 「探索結果の不在」と「契約の曖昧さ」を区別し、後者だけを減点すること`,
		include: {
			source: true,
			signature: true,
			filePath: true
		},
		responseFormat: llmScoreSchema
	}))
};
var rule_default$1 = definition$1;

//#endregion
//#region src/rules/test-validity/rule.ts
const inferenceSchema = Type.Object({ inference: Type.String({ minLength: 1 }) }, { additionalProperties: false });
function isTestFile(filePath) {
	return /\.(test|spec)\.[tj]sx?$/.test(filePath);
}
const definition = {
	meta: {
		scope: "test-case",
		threshold: 70
	},
	create: () => okAsync((ctx) => {
		if (!isTestFile(ctx.filePath)) return okAsync({
			score: 100,
			reason: "Not a test file, skipping."
		});
		return ctx.llm.evaluate({
			prompt: `以下のテスト名から、このテストで検証すべき具体的なアサーション（期待動作）を推論してください。
テストの実装コードは見ずに、テスト名とファイルパスのコンテキストのみから推測してください。

出力形式: テストが検証すべき内容を箇条書きで記述してください。補足説明は不要です。`,
			include: {
				name: true,
				filePath: true
			},
			responseFormat: inferenceSchema
		}).andThen((step1) => ctx.llm.evaluate({
			prompt: `以下は、テスト名から推論された「期待される検証内容」と、実際のテストコードです。
2つの観点で評価してください。

## 推論された期待検証内容
${step1.inference}

## 評価観点

### 1. 必要十分性
テスト名の主張を、アサーションが証明しているか。
- テスト名の主張が偽である実装（例: エラーを返さない実装）を、このテストが検出できるか
- テスト名と無関係なアサーションしかない場合は不十分

### 2. 変更耐性
アサーションが振る舞い（入出力・戻り値・状態変化）を検証しているか。
- 良い例: 戻り値の検証、例外の検証、observable な状態変化の検証
- 悪い例: 内部変数の直接参照、プライベートメソッドの呼び出し回数、実装固有のマジックナンバー

## 評価しないこと
- パターン数や境界値の網羅性（1つの代表的なケースで主張を証明できていれば十分）
- テストスイート全体のカバレッジ設計`,
			include: { source: true },
			responseFormat: llmScoreSchema
		}));
	})
};
var rule_default = definition;

//#endregion
//#region src/rules/builtin-rules.ts
const builtinRules = [
	{
		id: "code-duplication",
		definition: rule_default$9
	},
	{
		id: "function-contract",
		definition: rule_default$8
	},
	{
		id: "layer-symmetry",
		definition: rule_default$7
	},
	{
		id: "no-implicit-fallback",
		definition: rule_default$6
	},
	{
		id: "no-nonstandard-code",
		definition: rule_default$5
	},
	{
		id: "no-invalid-state-type",
		definition: rule_default$4
	},
	{
		id: "ssot-placement",
		definition: rule_default$3
	},
	{
		id: "ssot-violation",
		definition: rule_default$2
	},
	{
		id: "strict-function-boundary",
		definition: rule_default$1
	},
	{
		id: "test-validity",
		definition: rule_default
	}
];

//#endregion
export { builtinRules, extractSignature, getNameFromDeclaration, shouldSkipEntry };