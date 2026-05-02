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
bun run test                   # Run all tests (including LLM integration)
bun run test:watch             # Watch mode
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
- **Testing**: TDD style. Unit tests mock DI deps. Rule tests call real LLMs

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

- **PR**: `ci.yml` runs format check, typecheck, lint, build, unit tests
- **Main push**: `release.yml` runs CI, then syncs built dist to `release` branch
- LLM integration tests are excluded from CI (require API access)
