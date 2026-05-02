import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { errAsync, ok, okAsync } from 'neverthrow';
import type { Result, ResultAsync } from 'neverthrow';

import type { CodepolicyError } from '../../shared/errors';
import { codepolicyError } from '../../shared/errors';
import type {
  ChangedFile,
  LintOutput,
  OverrideEntry,
  ResolvedRule,
  ScopeUnit,
  CodepolicyConfig,
} from '../../shared/types';
import type { RuleModule } from '../../rules/rule-types';
import type { RuleCreateFn } from '../../rules/rule-types';

import { LintPipeline, type LintOptions } from './lint-pipeline.service';

// --- Factories ---

const defaultOptions: LintOptions = {
  configPath: undefined,
  ruleId: undefined,
  agent: undefined,
  concurrency: undefined,
  reasoningEffort: undefined,
  base: undefined,
  noCache: undefined,
};

const makeCreateFn = (score = 90, reason = 'Good code'): RuleCreateFn => {
  return () => okAsync(() => okAsync({ score, reason }));
};

const makeResolvedRule = (
  id: string,
  scope: 'function' | 'test-case' | 'file' = 'function',
  threshold = 70,
  score = 90,
  reason = 'Good code',
): ResolvedRule => ({
  id,
  scope,
  agent: 'claude',
  threshold,
  level: 'error',
  create: makeCreateFn(score, reason),
});

const makeConfig = (ruleIds: string[]): CodepolicyConfig => ({
  filter: 'diff',
  agent: 'claude',
  rules: Object.fromEntries(ruleIds.map((id) => [id, 'error' as const])),
});

const makeScope = (
  name = 'myFunction',
  scopeType: 'function' | 'test-case' | 'file' = 'function',
  filePath = 'src/foo.ts',
): ScopeUnit => ({
  filePath,
  scopeType,
  name,
  code: 'function myFunction() {}',
  startLine: 1,
  endLine: 3,
});

// --- Mock builders ---

type EvalCacheLike = {
  lookup: (input: unknown) => ResultAsync<unknown, CodepolicyError>;
  save: (input: unknown, score: unknown) => ResultAsync<void, CodepolicyError>;
};

type MockDeps = {
  configLoader?: { load: () => ResultAsync<CodepolicyConfig, CodepolicyError> };
  ruleResolver?: { resolve: (...args: unknown[]) => Result<ResolvedRule[], CodepolicyError> };
  externalRuleLoader?: {
    load: (rulePaths: string[], configDir: string) => ResultAsync<RuleModule[], CodepolicyError>;
  };
  gitDiffService?: {
    getChangedFiles: (base?: string) => ResultAsync<ChangedFile[], CodepolicyError>;
  };
  scopeExtractor?: {
    extract: (files: ChangedFile[]) => ResultAsync<ScopeUnit[], CodepolicyError>;
  };
  workingDir?: string;
  evalCache?: EvalCacheLike;
};

const noopCache: EvalCacheLike = {
  lookup: () => okAsync({ kind: 'miss' }),
  save: () => okAsync(undefined),
};

function buildDefaultDeps() {
  return {
    configLoader: { load: () => okAsync(makeConfig(['rule-a'])) },
    ruleResolver: { resolve: () => ok([makeResolvedRule('rule-a')]) },
    externalRuleLoader: { load: () => okAsync([]) },
    gitDiffService: {
      getChangedFiles: () =>
        okAsync([{ filePath: 'src/foo.ts', lineRanges: [{ start: 1, end: 10 }] }]),
    },
    scopeExtractor: { extract: () => okAsync([makeScope()]) },
    workingDir: '/project',
    logContextStore: {
      run: (_ctx: unknown, fn: () => unknown) => fn(),
      getContext: () => undefined,
    },
    log: { info: () => {}, warn: () => {}, debug: () => {} },
    evalCache: noopCache,
  };
}

function createPipeline(deps: MockDeps): LintPipeline {
  const defaults = buildDefaultDeps();
  const merged = { ...defaults, ...deps };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock injection bypasses DI container
  return new (LintPipeline as any)(
    merged.configLoader,
    merged.ruleResolver,
    merged.externalRuleLoader,
    merged.gitDiffService,
    merged.scopeExtractor,
    merged.workingDir,
    merged.logContextStore,
    merged.log,
    merged.evalCache,
  );
}

// --- Tests ---

describe('LintPipeline', () => {
  it('正常系: 全ルールパス（violation 0件）', async () => {
    const pipeline = createPipeline({
      ruleResolver: {
        resolve: () => ok([makeResolvedRule('rule-a', 'function', 70, 90, 'Good code')]),
      },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);

    const { results } = result._unsafeUnwrap();
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(true);
    expect(results[0]!.score).toBe(90);
    expect(results[0]!.reason).toBe('Good code');
    expect(results[0]!.filePath).toBe('src/foo.ts');
    expect(results[0]!.scopeName).toBe('myFunction');
    expect(results[0]!.rule.id).toBe('rule-a');
    expect(results[0]!.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
    expect(typeof results[0]!.durationMs).toBe('number');
  });

  it('正常系: violation あり（スコアがthreshold未満）', async () => {
    const pipeline = createPipeline({
      ruleResolver: {
        resolve: () => ok([makeResolvedRule('rule-a', 'function', 70, 30, 'Too complex')]),
      },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);

    const { results } = result._unsafeUnwrap();
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.score).toBe(30);
    expect(results[0]!.reason).toBe('Too complex');
  });

  it('ruleIdフィルタ: 指定したルールのみ実行される', async () => {
    const resolvedRules = [
      makeResolvedRule('rule-a', 'function', 70, 80, 'OK'),
      makeResolvedRule('rule-b', 'function', 70, 80, 'OK'),
    ];
    const scopes = [makeScope()];

    let createCallCount = 0;
    const trackedRuleB: ResolvedRule = {
      ...makeResolvedRule('rule-b', 'function', 70, 80, 'OK'),
      create: () => {
        createCallCount++;
        return okAsync(() => okAsync({ score: 80, reason: 'OK' }));
      },
    };

    const pipeline = createPipeline({
      ruleResolver: { resolve: () => ok([resolvedRules[0]!, trackedRuleB]) },
      scopeExtractor: { extract: () => okAsync(scopes) },
    });

    const result = await pipeline.run({ ...defaultOptions, ruleId: 'rule-b' });
    expect(result.isOk()).toBe(true);

    const { results } = result._unsafeUnwrap();
    expect(results).toHaveLength(1);
    expect(results[0]!.rule.id).toBe('rule-b');
    expect(createCallCount).toBe(1);
  });

  it('diffなし: 空の LintOutput を返す', async () => {
    const pipeline = createPipeline({
      gitDiffService: { getChangedFiles: () => okAsync([]) },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ results: [], errors: [] });
  });

  it('filter=all: workingDir 配下の TypeScript ファイルを対象にする', async () => {
    const pipeline = createPipeline({
      configLoader: {
        load: () =>
          okAsync({
            filter: 'all',
            agent: 'claude',
            rules: { 'rule-a': 'error' },
            ignore: ['ignored/**'],
          }),
      },
      gitDiffService: {
        getChangedFiles: () => {
          throw new Error('git diff should not be used for filter=all');
        },
      },
      scopeExtractor: {
        extract: () => okAsync([makeScope('userService', 'function', 'user-service.ts')]),
      },
      workingDir: path.resolve(import.meta.dirname, '../../../samples/basic'),
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().results).toHaveLength(1);
    expect(result._unsafeUnwrap().results[0]!.filePath).toBe('user-service.ts');
  });

  it('config rulePaths: builtin に external rules を加えて解決する', async () => {
    const externalRule = {
      id: 'plain-language',
      definition: {
        meta: { scope: 'file' as const, threshold: 70 },
        create: makeCreateFn(),
      },
    };

    const pipeline = createPipeline({
      configLoader: {
        load: () =>
          okAsync({
            filter: 'diff',
            agent: 'claude',
            rulePaths: ['./tools/codepolicy-rules/plain-language.mjs'],
            rules: { 'plain-language': 'error' },
          }),
      },
      externalRuleLoader: {
        load: (rulePaths) => {
          expect(rulePaths).toEqual(['./tools/codepolicy-rules/plain-language.mjs']);
          return okAsync([externalRule]);
        },
      },
      ruleResolver: {
        resolve: (...args) => {
          const rules = args[1] as RuleModule[];
          // 実際の RuleResolver と同様に config.rules で指定されたものだけ解決する。
          // テストは「ロードされた external rule が解決パイプラインを通って lint 出力に出る」ことを観測。
          const target = rules.find((rule) => rule.id === 'plain-language');
          if (!target) return ok([]);
          return ok([
            {
              id: target.id,
              scope: target.definition.meta.scope,
              agent: 'test-agent',
              threshold: target.definition.meta.threshold,
              level: 'error' as const,
              create: target.definition.create,
            },
          ]);
        },
      },
      scopeExtractor: {
        extract: () => okAsync([makeScope('src/rules/foo.ts', 'file', 'src/rules/foo.ts')]),
      },
    });

    const result = await pipeline.run(defaultOptions);
    if (result.isErr()) {
      throw new Error(`pipeline failed: ${result.error.code} ${result.error.message}`);
    }

    // external rule が最終的な lint 出力で評価されたことを観測
    const ruleIds = result.value.results.map((r) => r.rule.id);
    expect(ruleIds).toContain('plain-language');
  });

  it('エラー伝播: configLoader エラーが正しく返される', async () => {
    const configError = codepolicyError('CONFIG_NOT_FOUND', 'Config file not found');

    const pipeline = createPipeline({
      configLoader: { load: () => errAsync(configError) },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isErr()).toBe(true);

    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe('CONFIG_NOT_FOUND');
    expect(error.message).toBe('Config file not found');
  });

  it('複数scope × 複数rule の直積が正しく生成される', async () => {
    const resolvedRules = [
      makeResolvedRule('rule-a', 'function'),
      makeResolvedRule('rule-b', 'function'),
    ];
    const scopes = [
      makeScope('fnA', 'function', 'src/a.ts'),
      makeScope('fnB', 'function', 'src/b.ts'),
    ];

    const pipeline = createPipeline({
      ruleResolver: { resolve: () => ok(resolvedRules) },
      scopeExtractor: { extract: () => okAsync(scopes) },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);
    const { results } = result._unsafeUnwrap();

    // 全ペアの (filePath, scopeName, ruleId) を集合として検証
    const pairs = results.map((r) => `${r.filePath}:${r.scopeName}:${r.rule.id}`).sort();
    expect(pairs).toEqual([
      'src/a.ts:fnA:rule-a',
      'src/a.ts:fnA:rule-b',
      'src/b.ts:fnB:rule-a',
      'src/b.ts:fnB:rule-b',
    ]);
  });

  it('scopeType が一致しない scope × rule のペアは生成されない (一致ケースとの対比)', async () => {
    const fnRule = makeResolvedRule('fn-rule', 'function');
    const fileRule = makeResolvedRule('file-rule', 'file');
    const scopes = [makeScope('main.ts', 'file', 'src/main.ts')];

    const pipeline = createPipeline({
      ruleResolver: { resolve: () => ok([fnRule, fileRule]) },
      scopeExtractor: { extract: () => okAsync(scopes) },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);
    const { results, errors } = result._unsafeUnwrap();

    // 一致した file scope x file rule のみペアになる
    expect(errors).toEqual([]);
    expect(results).toHaveLength(1);
    expect(results[0]!.rule.id).toBe('file-rule');
    expect(results[0]!.filePath).toBe('src/main.ts');
    // fn-rule は scopeType 不一致なので結果に出ない
    const ruleIds = results.map((r) => r.rule.id);
    expect(ruleIds).not.toContain('fn-rule');
  });

  it('threshold境界値: スコアとthresholdが等しい場合はpassedになる', async () => {
    const resolvedRules = [makeResolvedRule('rule-a', 'function', 70, 70, 'Exactly at threshold')];

    const pipeline = createPipeline({
      ruleResolver: { resolve: () => ok(resolvedRules) },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);

    const { results } = result._unsafeUnwrap();
    expect(results[0]!.passed).toBe(true);
    expect(results[0]!.score).toBe(70);
  });

  // --- Override integration tests ---

  it('override: マッチするファイルのルールが off になり結果が生成されない', async () => {
    const overrides: OverrideEntry[] = [{ files: ['**/*.test.ts'], rules: { 'rule-a': 'off' } }];
    const config: CodepolicyConfig = { ...makeConfig(['rule-a']), overrides };

    const pipeline = createPipeline({
      configLoader: { load: () => okAsync(config) },
      ruleResolver: { resolve: () => ok([makeResolvedRule('rule-a', 'function', 70, 90)]) },
      scopeExtractor: {
        extract: () => okAsync([makeScope('testFn', 'function', 'src/foo.test.ts')]),
      },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ results: [], errors: [] });
  });

  it('override: マッチするファイルの threshold が変更される', async () => {
    const overrides: OverrideEntry[] = [
      { files: ['**/*.test.ts'], rules: { 'rule-a': { level: 'error', threshold: 50 } } },
    ];
    const config: CodepolicyConfig = { ...makeConfig(['rule-a']), overrides };

    const pipeline = createPipeline({
      configLoader: { load: () => okAsync(config) },
      ruleResolver: {
        resolve: () => ok([makeResolvedRule('rule-a', 'function', 70, 60, 'Moderate')]),
      },
      scopeExtractor: {
        extract: () => okAsync([makeScope('testFn', 'function', 'src/foo.test.ts')]),
      },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);

    const { results } = result._unsafeUnwrap();
    expect(results).toHaveLength(1);
    // score=60 >= overridden threshold=50 → passed
    expect(results[0]!.passed).toBe(true);
    expect(results[0]!.rule.threshold).toBe(50);
  });

  it('override: マッチしないファイルにはベース設定が適用される', async () => {
    const overrides: OverrideEntry[] = [{ files: ['**/*.test.ts'], rules: { 'rule-a': 'off' } }];
    const config: CodepolicyConfig = { ...makeConfig(['rule-a']), overrides };

    const pipeline = createPipeline({
      configLoader: { load: () => okAsync(config) },
      ruleResolver: { resolve: () => ok([makeResolvedRule('rule-a', 'function', 70, 90)]) },
      scopeExtractor: {
        extract: () => okAsync([makeScope('prodFn', 'function', 'src/foo.ts')]),
      },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);

    const { results } = result._unsafeUnwrap();
    expect(results).toHaveLength(1);
    expect(results[0]!.rule.id).toBe('rule-a');
    expect(results[0]!.passed).toBe(true);
  });

  // --- base option tests ---

  it('base指定時: その base からの差分ファイルが lint 対象になる', async () => {
    const pipeline = createPipeline({
      gitDiffService: {
        getChangedFiles: (base?: string) => {
          if (base === 'origin/main') {
            return okAsync([{ filePath: 'src/new.ts', lineRanges: [{ start: 1, end: 5 }] }]);
          }
          return okAsync([]);
        },
      },
      scopeExtractor: {
        extract: () => okAsync([makeScope('newFn', 'function', 'src/new.ts')]),
      },
    });

    const result = await pipeline.run({ ...defaultOptions, base: 'origin/main' });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().results).toHaveLength(1);
    expect(result._unsafeUnwrap().results[0]!.filePath).toBe('src/new.ts');
  });

  // base 解決ロジックを「どの base 値で diff したか」として観測可能にするための mock。
  // 入力 base に応じて異なるファイルを返すことで、出力 (results[].filePath) から
  // どの base が実際に使われたかを判定できる。
  const baseRoutingDiff = {
    getChangedFiles: (base?: string) =>
      okAsync([
        { filePath: `diff-from-${base ?? 'no-base'}.ts`, lineRanges: [{ start: 1, end: 3 }] },
      ]),
  };

  it('base優先順位: CLI base が config base より優先される', async () => {
    const pipeline = createPipeline({
      configLoader: {
        load: () =>
          okAsync({
            filter: 'diff',
            agent: 'claude',
            base: 'origin/develop',
            rules: { 'rule-a': 'error' },
          }),
      },
      gitDiffService: baseRoutingDiff,
      scopeExtractor: {
        extract: (files) =>
          okAsync([makeScope('fn', 'function', files[0]?.filePath ?? 'unknown.ts')]),
      },
    });

    const result = await pipeline.run({ ...defaultOptions, base: 'origin/main' });
    expect(result._unsafeUnwrap().results[0]!.filePath).toBe('diff-from-origin/main.ts');
  });

  it('base優先順位: CLI base なし + config base あり → config が使用される', async () => {
    const pipeline = createPipeline({
      configLoader: {
        load: () =>
          okAsync({
            filter: 'diff',
            agent: 'claude',
            base: 'origin/develop',
            rules: { 'rule-a': 'error' },
          }),
      },
      gitDiffService: baseRoutingDiff,
      scopeExtractor: {
        extract: (files) =>
          okAsync([makeScope('fn', 'function', files[0]?.filePath ?? 'unknown.ts')]),
      },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result._unsafeUnwrap().results[0]!.filePath).toBe('diff-from-origin/develop.ts');
  });

  it('base優先順位: CLI base なし + config base なし → base 引数なし', async () => {
    const pipeline = createPipeline({
      gitDiffService: baseRoutingDiff,
      scopeExtractor: {
        extract: (files) =>
          okAsync([makeScope('fn', 'function', files[0]?.filePath ?? 'unknown.ts')]),
      },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result._unsafeUnwrap().results[0]!.filePath).toBe('diff-from-no-base.ts');
  });

  it('filter=all + base指定: base が無視されて全ファイルスキャンになる', async () => {
    // gitDiffService が呼ばれた場合は識別可能なファイル名を出す (filter=all なら呼ばれない)
    const pipeline = createPipeline({
      configLoader: {
        load: () =>
          okAsync({
            filter: 'all',
            agent: 'claude',
            base: 'origin/main',
            rules: { 'rule-a': 'error' },
            ignore: ['ignored/**'],
          }),
      },
      gitDiffService: {
        getChangedFiles: () =>
          okAsync([{ filePath: 'GIT_DIFF_USED.ts', lineRanges: [{ start: 1, end: 3 }] }]),
      },
      scopeExtractor: {
        extract: (files) => okAsync(files.map((f) => makeScope('fn', 'function', f.filePath))),
      },
      workingDir: path.resolve(import.meta.dirname, '../../../samples/basic'),
    });

    const result = await pipeline.run({ ...defaultOptions, base: 'origin/main' });
    const filePaths = result._unsafeUnwrap().results.map((r) => r.filePath);
    // gitDiffService の戻り値が混ざっていれば filter=all の意味が崩れている
    expect(filePaths).not.toContain('GIT_DIFF_USED.ts');
    // workingDir 配下の TypeScript ファイルがスキャンされていることを確認
    expect(filePaths.length).toBeGreaterThan(0);
  });

  it('override: ベースで off のルールが override で有効化される', async () => {
    const overrides: OverrideEntry[] = [{ files: ['**/*.test.ts'], rules: { 'rule-a': 'error' } }];
    const config: CodepolicyConfig = { ...makeConfig(['rule-a']), overrides };

    const offRule: ResolvedRule = {
      ...makeResolvedRule('rule-a', 'function', 70, 85, 'Good'),
      level: 'off',
    };

    const pipeline = createPipeline({
      configLoader: { load: () => okAsync(config) },
      ruleResolver: { resolve: () => ok([offRule]) },
      scopeExtractor: {
        extract: () => okAsync([makeScope('testFn', 'function', 'src/foo.test.ts')]),
      },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);

    const { results } = result._unsafeUnwrap();
    expect(results).toHaveLength(1);
    expect(results[0]!.rule.id).toBe('rule-a');
    expect(results[0]!.rule.level).toBe('error');
    expect(results[0]!.passed).toBe(true);
  });

  it('エラー耐性: 1つの evaluator がエラーでも他の評価は継続する', async () => {
    const failingCreateFn: RuleCreateFn = () =>
      okAsync(() => errAsync(new Error('LLM API timeout')));
    const successCreateFn: RuleCreateFn = () =>
      okAsync(() => okAsync({ score: 85, reason: 'Good' }));

    const resolvedRules: ResolvedRule[] = [
      { ...makeResolvedRule('rule-fail', 'function', 70), create: failingCreateFn },
      { ...makeResolvedRule('rule-ok', 'function', 70), create: successCreateFn },
    ];

    const pipeline = createPipeline({
      ruleResolver: { resolve: () => ok(resolvedRules) },
      scopeExtractor: { extract: () => okAsync([makeScope()]) },
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);

    const output: LintOutput = result._unsafeUnwrap();
    expect(output.results).toHaveLength(1);
    expect(output.results[0]!.rule.id).toBe('rule-ok');
    expect(output.results[0]!.passed).toBe(true);

    expect(output.errors).toHaveLength(1);
    expect(output.errors[0]!.rule.id).toBe('rule-fail');
    expect(output.errors[0]!.error.code).toBe('LLM_API_ERROR');
  });
});

describe('LintPipeline cache integration', () => {
  it('execution order is scope-bundled (rules for the same scope come back-to-back)', async () => {
    const order: string[] = [];
    const ruleA = makeResolvedRule('rule-a');
    const ruleB = makeResolvedRule('rule-b');
    const trackedA: ResolvedRule = {
      ...ruleA,
      ruleVersion: 'a',
      create: () =>
        okAsync((ctx) => {
          order.push(`a:${ctx.name}`);
          return okAsync({ score: 90, reason: 'ok' });
        }),
    };
    const trackedB: ResolvedRule = {
      ...ruleB,
      ruleVersion: 'b',
      create: () =>
        okAsync((ctx) => {
          order.push(`b:${ctx.name}`);
          return okAsync({ score: 90, reason: 'ok' });
        }),
    };
    const scopes = [
      makeScope('foo', 'function', 'src/foo.ts'),
      makeScope('bar', 'function', 'src/bar.ts'),
    ];

    const pipeline = createPipeline({
      ruleResolver: { resolve: () => ok([trackedA, trackedB]) },
      scopeExtractor: { extract: () => okAsync(scopes) },
      evalCache: noopCache,
    });

    await pipeline.run({ ...defaultOptions, concurrency: 1 });

    expect(order).toEqual(['a:foo', 'b:foo', 'a:bar', 'b:bar']);
  });

  it('cache hit: skips evaluator and returns cached score', async () => {
    let evaluatorCalls = 0;
    const trackedRule: ResolvedRule = {
      ...makeResolvedRule('cached-rule'),
      ruleVersion: 'v1',
      create: () => {
        return okAsync(() => {
          evaluatorCalls++;
          return okAsync({ score: 90, reason: 'fresh' });
        });
      },
    };

    const cache: EvalCacheLike = {
      lookup: () =>
        okAsync({
          kind: 'hit',
          entry: {
            score: 77,
            reason: 'from-cache',
            savedAt: '2026-01-01T00:00:00Z',
            codepolicyVersion: '0.0.1',
          },
        }),
      save: () => okAsync(undefined),
    };

    const pipeline = createPipeline({
      ruleResolver: { resolve: () => ok([trackedRule]) },
      evalCache: cache,
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);
    const { results } = result._unsafeUnwrap();
    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBe(77);
    expect(results[0]!.reason).toBe('from-cache');
    expect(results[0]!.passed).toBe(true);
    expect(evaluatorCalls).toBe(0);
  });

  it('cache miss: runs evaluator and saves the result', async () => {
    let saveCalls = 0;
    const trackedRule: ResolvedRule = {
      ...makeResolvedRule('miss-rule'),
      ruleVersion: 'v2',
      create: () => okAsync(() => okAsync({ score: 88, reason: 'evaluated' })),
    };

    const cache: EvalCacheLike = {
      lookup: () => okAsync({ kind: 'miss' }),
      save: () => {
        saveCalls++;
        return okAsync(undefined);
      },
    };

    const pipeline = createPipeline({
      ruleResolver: { resolve: () => ok([trackedRule]) },
      evalCache: cache,
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);
    const { results } = result._unsafeUnwrap();
    expect(results[0]!.score).toBe(88);
    expect(results[0]!.reason).toBe('evaluated');
    expect(saveCalls).toBe(1);
  });

  it('cacheable: false rules skip lookup and save', async () => {
    let lookupCalls = 0;
    let saveCalls = 0;
    const uncachedRule: ResolvedRule = {
      ...makeResolvedRule('uncached-rule'),
      ruleVersion: 'v3',
      cacheable: false,
      create: () => okAsync(() => okAsync({ score: 95, reason: 'fresh-only' })),
    };

    const cache: EvalCacheLike = {
      lookup: () => {
        lookupCalls++;
        return okAsync({ kind: 'miss' });
      },
      save: () => {
        saveCalls++;
        return okAsync(undefined);
      },
    };

    const pipeline = createPipeline({
      ruleResolver: { resolve: () => ok([uncachedRule]) },
      evalCache: cache,
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().results[0]!.score).toBe(95);
    expect(lookupCalls).toBe(0);
    expect(saveCalls).toBe(0);
  });

  it('noCache=true: skips lookup and save even for cacheable rules', async () => {
    let lookupCalls = 0;
    let saveCalls = 0;
    const rule: ResolvedRule = {
      ...makeResolvedRule('cacheable-rule'),
      ruleVersion: 'v9',
      create: () => okAsync(() => okAsync({ score: 80, reason: 'fresh' })),
    };

    const cache: EvalCacheLike = {
      lookup: () => {
        lookupCalls++;
        return okAsync({ kind: 'miss' });
      },
      save: () => {
        saveCalls++;
        return okAsync(undefined);
      },
    };

    const pipeline = createPipeline({
      ruleResolver: { resolve: () => ok([rule]) },
      evalCache: cache,
    });

    const result = await pipeline.run({ ...defaultOptions, noCache: true });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().results[0]!.score).toBe(80);
    expect(lookupCalls).toBe(0);
    expect(saveCalls).toBe(0);
  });

  it('corrupted cache entry: re-evaluates and continues', async () => {
    let evaluatorCalls = 0;
    const rule: ResolvedRule = {
      ...makeResolvedRule('corrupt-rule'),
      ruleVersion: 'v4',
      create: () =>
        okAsync(() => {
          evaluatorCalls++;
          return okAsync({ score: 85, reason: 'recovered' });
        }),
    };

    const cache: EvalCacheLike = {
      lookup: () => okAsync({ kind: 'corrupted', cause: new Error('invalid JSON') }),
      save: () => okAsync(undefined),
    };

    const pipeline = createPipeline({
      ruleResolver: { resolve: () => ok([rule]) },
      evalCache: cache,
    });

    const result = await pipeline.run(defaultOptions);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().results[0]!.score).toBe(85);
    expect(evaluatorCalls).toBe(1);
  });
});
