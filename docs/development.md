# Development Guide

## Setup

```bash
git clone https://github.com/9wick/codepolicy.git
cd codepolicy
bun install
```

## Scripts

```bash
bun run dev                    # Run CLI from source
bun run build                  # Build (schema:generate + tsdown)
bun run test                   # Internal tests only (no inference API calls)
bun run test:watch             # Internal tests in watch mode
bun run test:infra -- typesafe # Live TypeSafe adapter contract (one test)
bun run test:infra -- opencode # Live OpenCode adapter contract (one test)
bun run test:rules             # Rule accuracy evaluation (paid, many requests)
bun run format                 # Format with Biome
bun run lint                   # Lint with oxlint + ESLint
bun run typecheck              # TypeScript type check
bun run prepush                # Full check: format → typecheck → lint → build → test
```

## Architecture

```
src/
├── cli/                       # CLI entry point and commands (citty)
│   ├── entry.ts               # Main entry
│   └── commands/              # Subcommands (rule, validate, model)
├── application/
│   ├── config/                # Config loading and validation
│   ├── rule-execution/        # Lint pipeline, scope extraction, LLM helper
│   └── output/                # Result formatting
├── infrastructure/
│   ├── llm/                   # LLM provider adapters (Anthropic, Codex, OpenCode)
│   └── git/                   # Git diff parsing
├── rules/                     # Built-in rule implementations
│   ├── rule-types.ts          # RuleModule/RuleContext type definitions
│   ├── builtin-rules.ts       # Rule registry
│   └── <rule-id>/rule.ts      # Individual rules + tests
└── shared/                    # DI container, logger, types, errors
```

### Key Patterns

- **DI**: needle-di with `@injectable()` and `inject()`. Container managed in `src/shared/container.ts`
- **Error handling**: Railway Oriented Programming with `neverthrow` (`Result`, `ResultAsync`)
- **Type safety**: No `as`, no `any`, no `throw`, no `!` assertions. Enforced by ESLint rules
- **Testing**: TDD style. Internal tests mock external boundaries; live infra tests verify production adapters against the same contract assertions. Rule accuracy evaluations are run separately.

### Lint Pipeline Flow

1. Load config (`.codepolicy.yml`)
2. Resolve rules (built-in + external via `rulePaths`)
3. Get target files (git diff or all files)
4. Extract scopes (AST via tree-sitter)
5. Match scopes × rules
6. Evaluate in parallel (p-limit) — each scope/rule pair sent to LLM
7. Collect scores, compare against thresholds
8. Output results, exit with code 1 if any failures

### Adding a Built-in Rule

1. Create `src/rules/<rule-id>/rule.ts` implementing `RuleModule`
2. Create `src/rules/<rule-id>/rule.test.ts` using `ruleTester`
3. Register in `src/rules/builtin-rules.ts`
4. Run `bun run prepush`

## CI

### Jev PoC

新規5ルールの宣言は `src/rules/jev-*/rule.ts`、登録は `builtin-decision-rules.ts`。既存の公開カスタムルールAPIは変更しない。`DecisionProvider`が数値応答を受け、application側で検証・分類・固定書式へ変換する。SDK型と認証はinfrastructure側に閉じる。

内部完結テストは、閾値境界・不正な回答・実SDKを使ったHTTP差し替え・pipeline・CLI・測定ハーネスを検証する。`*.infra.test.ts` は本番アダプターと実サービスの契約を確認する専用テスト。`src/rules/*/rule.test.ts` は判定精度の評価であり、infra契約テストとは別物。収集パターンは `vitest.shared.config.ts` に集約し、通常test・CI・公開前チェックから実APIの両スイートを除外する。詳細は [Jev PoC](benchmark/README.md)。

`bun run benchmark:jev --check`はAPIやファイル書き込みなしで測定構成を確認する。実測は`bun run benchmark:jev`。`bun prepush`は`precommit`（内部完結テストのみ）を呼ぶ別名であり、commit/pushは実行しない。実API契約・精度評価の成功を証明するコマンドではない。

- **PR**: `ci.yml` runs format check, typecheck, lint, build, unit tests
- **Main push**: `release.yml` runs CI, then syncs built dist to `release` branch
- LLM integration tests are excluded from CI (require API access)
