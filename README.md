# codepolicy

LLM-powered semantic linter for CI pipelines. Catches design violations that static analysis can't — naming inconsistencies, misplaced responsibilities, implicit fallbacks, and more.

```
lint → type-check → test → codepolicy
```

## Install

```bash
# npm
npm install -D codepolicy

# bun
bun add -D codepolicy

# pnpm
pnpm add -D codepolicy
```

Requires Node.js >= 22.

## Quick Start

1. Create `.codepolicy.yml` in your project root:

```yaml
filter: diff

rules:
  function-contract: error
  ssot-violation: warn

ignore:
  - dist/**
```

2. Run:

```bash
npx codepolicy
```

Output:

```
✗ codepolicy failed

  src/user/repository.ts > getUserById()
    [function-contract] score: 42
    getUser() の実装内部でログの書き込みが行われています。
    名前から期待される読み取り専用の操作と一致しません。
```

## Configuration

Default config file: `.codepolicy.yml`

```yaml
# Filter mode: "diff" (git changes only) or "all" (entire codebase)
filter: diff

# Default LLM model for all rules (required)
agent: github-copilot/gpt-4.1

# Max parallel LLM evaluations
concurrency: 5

# Custom rule file paths
rulePaths:
  - ./.codepolicy/my-rule.ts

# Rule settings: "error" | "warn" | "off" or object form
rules:
  function-contract: error
  ssot-violation:
    level: warn
    threshold: 60    # override default threshold (0-100)
  test-validity: off

# Glob patterns to ignore
ignore:
  - dist/**
  - node_modules/**

# Per-file overrides
overrides:
  - files: ["**/*.test.ts"]
    rules:
      function-contract: off
      test-validity: error
```

## Built-in Rules

9 rules ship with codepolicy. All default to threshold 70.

| Rule | Scope | What it checks |
|------|-------|----------------|
| [function-contract](docs/rules.md#function-contract) | function | Function name/signature matches its actual behavior |
| [strict-function-boundary](docs/rules.md#strict-function-boundary) | function | Business functions don't accept ambiguous inputs |
| [no-implicit-fallback](docs/rules.md#no-implicit-fallback) | function | Missing values aren't silently replaced with defaults |
| [no-invalid-state-type](docs/rules.md#no-invalid-state-type) | type | Type definitions don't allow impossible states |
| [code-duplication](docs/rules.md#code-duplication) | function | Semantically duplicate functions are detected |
| [layer-symmetry](docs/rules.md#layer-symmetry) | function | Same-role functions follow consistent patterns |
| [ssot-placement](docs/rules.md#ssot-placement) | exported-function | Functions are in architecturally correct files |
| [ssot-violation](docs/rules.md#ssot-violation) | exported-function | Functions live at their Single Source of Truth |
| [test-validity](docs/rules.md#test-validity) | test-case | Test assertions actually prove the test name's claim |

See [docs/rules.md](docs/rules.md) for detailed descriptions with pass/fail examples.

## LLM Providers

The model is auto-detected from the name:

| Pattern | Provider | Requirements |
|---------|----------|-------------|
| `provider/model` (contains `/`) | OpenCode | `opencode` CLI installed |
| `claude-*` | Anthropic | `ANTHROPIC_API_KEY` |
| `gpt-*`, `o1-*`, `o3-*`, `codex-*` | OpenAI Codex | `OPENAI_API_KEY` |

Examples: `anthropic/claude-sonnet-4-5`, `claude-sonnet-4-6`, `github-copilot/gpt-4.1`

## CLI Reference

```bash
# Run lint (default command)
codepolicy [options]
  --config, -c <path>        Config file (default: .codepolicy.yml)
  --filter <mode>            "diff" or "all"
  --rule <id>                Run specific rule only
  --agent <model>            Override model for all rules
  --concurrency <n>          Parallel evaluations (default: 10)
  --reasoning-effort <level> Codex reasoning: minimal|low|medium|high|xhigh
  --verbose                  Show detailed LLM logs
  --no-cache                 Disable evaluation result cache

# Rule commands
codepolicy rule list             List active rules
codepolicy rule show <id>        Show rule details
codepolicy rule run <id> <file>  Run one rule on one file

# Utilities
codepolicy validate              Validate config file
codepolicy model list            List available models
```

---

## Performance Tuning

Each LLM evaluation takes 5–30 seconds. Without tuning, a 500-file project can take an hour. Two mechanisms minimize repeated work:

### Result cache (default: on)

codepolicy persists each `(scope, rule)` evaluation to `<workingDir>/.codepolicy/cache/`. Subsequent runs reuse the stored score when:

- the scope's source code is unchanged
- the rule's prompt / responseFormat / options haven't changed (auto-detected via rule body hash)
- the model + reasoning effort + file tree are unchanged

After the first full run, incremental runs typically complete in seconds.

```bash
# Disable cache for a single run (debug or re-evaluation)
codepolicy --no-cache

# Recommended: gitignore the cache and persist between CI runs
echo '.codepolicy/' >> .gitignore
```

GitHub Actions example:

```yaml
- uses: actions/cache@v4
  with:
    path: .codepolicy/cache
    key: codepolicy-${{ hashFiles('.codepolicy.yml') }}-${{ github.sha }}
    restore-keys: codepolicy-${{ hashFiles('.codepolicy.yml') }}-
```

### Concurrency

LLM calls are I/O-bound. Default `concurrency: 10` is conservative. If your provider's rate limit allows, push to 30–50:

```yaml
# .codepolicy.yml
concurrency: 30
```

### Prompt cache (provider-side)

codepolicy puts the rule prompt and output format at the start of every user prompt. When the same rule evaluates many scopes, this prefix is shared across calls and benefits from automatic prompt caching on providers like OpenAI / Azure OpenAI / GitHub Copilot. For the OpenCode adapter, codepolicy also enables `setCacheKey: true` for `copilot`, `openai`, `anthropic`, and `openrouter` providers, which improves cache routing affinity.

---

## Custom Rules

Create a `.ts` file that exports a `RuleModule`:

```typescript
import { Type } from '@sinclair/typebox';
import { okAsync } from 'neverthrow';
import type { RuleModule } from 'codepolicy';

const schema = Type.Object({
  score: Type.Number({ minimum: 0, maximum: 100 }),
  reason: Type.String(),
}, { additionalProperties: false });

const myRule: RuleModule = {
  id: 'my-rule',
  definition: {
    meta: { scope: 'function', threshold: 70 },
    create: () =>
      okAsync((ctx) =>
        ctx.llm
          .evaluate({
            prompt: `Check if this function follows our naming conventions.`,
            include: { source: true, name: true, filePath: true },
            responseFormat: schema,
          })
      ),
  },
};

export default myRule;
```

Register in `.codepolicy.yml`:

```yaml
rulePaths:
  - ./.codepolicy/my-rule.ts

rules:
  my-rule: error
```

### RuleContext

Rules receive a `RuleContext` with:

| Field | Type | Description |
|-------|------|-------------|
| `source` | `string` | Source code of the scope |
| `filePath` | `string` | Relative file path |
| `scopeType` | `string` | `function`, `file`, `type`, `test-case`, etc. |
| `name` | `string` | Scope name (function name, type name, etc.) |
| `signature` | `string?` | Function signature (if applicable) |
| `fileTree` | `string?` | Directory tree of the project |
| `llm` | `LlmHelper` | LLM evaluation helper |

### Available Scopes

| Scope | Extracts |
|-------|----------|
| `function` | Each function in the file |
| `exported-function` | Exported functions only |
| `file` | Entire file |
| `type` | Type aliases |
| `interface` | Interface declarations |
| `test-case` | Individual test cases (`it`/`test` blocks) |

---

## Development

See [docs/development.md](docs/development.md) for development setup, architecture, and contributing guidelines.

## License

MIT
