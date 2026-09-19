import { inject, injectable } from '@needle-di/core';
import { ResultAsync, errAsync, ok, okAsync } from 'neverthrow';
import pLimit from 'p-limit';

import { ConfigLoader } from '../config/config-loader.service';
import type { CodepolicyError } from '../../shared/errors';
import { codepolicyError } from '../../shared/errors';
import { GitDiffService } from '../../infrastructure/git/git-diff.service';
import { ExternalRuleLoader } from '../../rules/external-rule-loader.service';
import { loadRuleModules } from '../../rules/load-rule-modules';
import { RuleResolver } from '../../rules/rule-resolver.service';
import type {
  ChangedFile,
  LintErrorEntry,
  LintOutput,
  LintResult,
  ModelReasoningEffort,
  OverrideEntry,
  ResolvedRule,
  RuleScope,
  ScopeUnit,
  CodepolicyConfig,
} from '../../shared/types';
import { CreateLogger, LogContextStore } from '../../shared/logger';
import { WorkingDir } from '../config/config-loader.service';
import { resolveConfigDir } from '../config/config-path';

import { generateFileTree } from './file-tree.lib';
import { applyOverrides } from './override-resolver';
import { ScopeExtractor } from './scope-extractor.service';
import { loadAllFiles } from './target-files.lib';
import { validateExecution } from './execution-compatibility';
import { RuleEvaluationService, type PreparedEvaluator } from './rule-evaluation.service';

// CLI から受け取る生の入力。すべて optional で「未指定」を表す。
export type LintOptions = {
  configPath?: string;
  ruleId?: string;
  agent?: string;
  concurrency?: number;
  reasoningEffort?: ModelReasoningEffort;
  base?: string;
  noCache?: boolean;
};

// 内部処理に渡す確定済み設定。null は「明示的に無効」、各値は default 解決済み。
type EffectiveSettings = {
  ruleId: string | null;
  agent: string | null;
  concurrency: number;
  reasoningEffort: ModelReasoningEffort | null;
  base: string | null;
  cacheDisabled: boolean;
};

function resolveSettings(options: LintOptions, config: CodepolicyConfig): EffectiveSettings {
  return {
    ruleId: options.ruleId ?? null,
    agent: options.agent ?? null,
    concurrency: options.concurrency ?? config.concurrency ?? 10,
    reasoningEffort: options.reasoningEffort ?? null,
    base: options.base ?? config.base ?? null,
    cacheDisabled: options.noCache === true,
  };
}

type ScopeRulePair = [ScopeUnit, ResolvedRule];

function matchesScope(scope: ScopeUnit, ruleScope: RuleScope | RuleScope[]): boolean {
  if (Array.isArray(ruleScope)) {
    return ruleScope.some((singleScope) => matchesScope(scope, singleScope));
  }
  if (ruleScope === 'exported-function') {
    return scope.scopeType === 'function' && scope.isExported === true;
  }
  return scope.scopeType === ruleScope;
}

function buildPairs(
  scopes: ScopeUnit[],
  rules: ResolvedRule[],
  overrides: OverrideEntry[],
): ScopeRulePair[] {
  const pairs: ScopeRulePair[] = [];
  for (const scope of scopes) {
    for (const rule of rules) {
      if (!matchesScope(scope, rule.scope)) continue;
      const effectiveRule = applyOverrides(rule, scope.filePath, overrides);
      if (effectiveRule !== null && effectiveRule.level !== 'off') {
        pairs.push([scope, effectiveRule]);
      }
    }
  }
  return pairs;
}

function filterByRuleId(rules: ResolvedRule[], ruleId: string | null): ResolvedRule[] {
  if (ruleId === null) return rules;
  return rules.filter((r) => r.id === ruleId);
}

function applyAgentOverride(rules: ResolvedRule[], agent: string | null): ResolvedRule[] {
  if (agent === null) return rules;
  return rules.map((rule) => ({ ...rule, agent }));
}

type LoadedConfigAndRules = {
  config: CodepolicyConfig;
  resolvedRules: ResolvedRule[];
};

@injectable()
export class LintPipeline {
  constructor(
    private configLoader = inject(ConfigLoader),
    private ruleResolver = inject(RuleResolver),
    private externalRuleLoader = inject(ExternalRuleLoader),
    private gitDiffService = inject(GitDiffService),
    private scopeExtractor = inject(ScopeExtractor),
    private workingDir = inject(WorkingDir),
    private logContextStore = inject(LogContextStore),
    private log = inject(CreateLogger)('LintPipeline'),
    private evaluation = inject(RuleEvaluationService),
  ) {}

  run(options: LintOptions): ResultAsync<LintOutput, CodepolicyError> {
    this.log.info('Loading config...');
    return this.loadConfigAndRules(options).andThen(({ config, resolvedRules }) => {
      const settings = resolveSettings(options, config);
      const filtered = filterByRuleId(resolvedRules, settings.ruleId);
      const effectiveRules = applyAgentOverride(filtered, settings.agent);
      this.logSettingsSummary(effectiveRules, settings);
      if (effectiveRules.length === 0) {
        return ok<LintOutput, CodepolicyError>({ results: [], errors: [] });
      }
      const validation = validateExecution(effectiveRules, settings.reasoningEffort ?? undefined);
      if (validation.isErr()) return errAsync<LintOutput, CodepolicyError>(validation.error);
      return this.extractAndEvaluate(config, effectiveRules, settings);
    });
  }

  private logSettingsSummary(rules: ResolvedRule[], settings: EffectiveSettings): void {
    this.log.info(`Resolved ${rules.length} rule(s): ${rules.map((r) => r.id).join(', ')}`);
    if (settings.agent !== null) this.log.info(`Applying model override: ${settings.agent}`);
    if (settings.concurrency !== 10) this.log.info(`Concurrency: ${settings.concurrency}`);
    if (settings.reasoningEffort !== null) {
      this.log.info(`Applying reasoning effort override: ${settings.reasoningEffort}`);
    }
    if (settings.base !== null) this.log.info(`Using base ref: ${settings.base}`);
  }

  private loadConfigAndRules(
    options: LintOptions,
  ): ResultAsync<LoadedConfigAndRules, CodepolicyError> {
    return this.configLoader
      .load(options.configPath)
      .andThen((config) => this.resolveLoadedRules(config, options));
  }

  private resolveLoadedRules(
    config: CodepolicyConfig,
    options: LintOptions,
  ): ResultAsync<LoadedConfigAndRules, CodepolicyError> {
    const configDir = resolveConfigDir(this.workingDir, options.configPath);
    return loadRuleModules(config, this.externalRuleLoader, configDir).andThen((ruleModules) =>
      this.ruleResolver.resolve(config, ruleModules).map((resolvedRules) => ({
        config,
        resolvedRules: filterByRuleId(resolvedRules, options.ruleId ?? null),
      })),
    );
  }

  private extractAndEvaluate(
    config: CodepolicyConfig,
    resolvedRules: ResolvedRule[],
    settings: EffectiveSettings,
  ): ResultAsync<LintOutput, CodepolicyError> {
    return this.getTargetFiles(config, settings.base)
      .andThen((changedFiles) => {
        this.log.info(`Files: ${changedFiles.length} target (filter: ${config.filter})`);
        this.log.debug(`Target files: ${changedFiles.map((f) => f.filePath).join(', ')}`);
        if (changedFiles.length === 0) {
          return ok<ScopeUnit[], CodepolicyError>([]);
        }
        return this.scopeExtractor.extract(changedFiles, resolvedRules);
      })
      .andThen((scopes) => {
        this.logScopeSummary(scopes);
        return this.buildAndEvaluate(scopes, resolvedRules, config.overrides ?? [], settings);
      });
  }

  private getTargetFiles(
    config: CodepolicyConfig,
    base: string | null,
  ): ResultAsync<ChangedFile[], CodepolicyError> {
    if (config.filter === 'all') {
      if (base !== null) {
        this.log.info('filter=all: --base is ignored when scanning all files.');
      }
      return loadAllFiles(this.workingDir, config.ignore ?? []);
    }
    return this.gitDiffService.getChangedFiles(base ?? undefined);
  }

  private logScopeTypeBreakdown(label: string, scopes: ScopeUnit[]): void {
    const counts = new Map<string, number>();
    for (const s of scopes) {
      counts.set(s.scopeType, (counts.get(s.scopeType) ?? 0) + 1);
    }
    const breakdown = [...counts.entries()].map(([type, count]) => `${type}: ${count}`).join(', ');
    this.log.info(`${label}: ${scopes.length} (${breakdown})`);
  }

  private logScopeSummary(scopes: ScopeUnit[]): void {
    this.logScopeTypeBreakdown('Extracted', scopes);
    this.log.debug(`Scopes: ${scopes.map((s) => `${s.filePath}:${s.name}`).join(', ')}`);
  }

  private logChecksSummary(pairs: ScopeRulePair[]): void {
    this.logScopeTypeBreakdown(
      'Checks',
      pairs.map(([scope]) => scope),
    );
  }

  private createEvaluators(
    resolvedRules: ResolvedRule[],
  ): ResultAsync<Map<string, PreparedEvaluator>, CodepolicyError> {
    const evaluators = new Map<string, PreparedEvaluator>();
    let chain: ResultAsync<void, CodepolicyError> = okAsync(undefined);
    for (const rule of resolvedRules) {
      chain = chain.andThen(() =>
        this.evaluation.prepare(rule).map((evaluator) => {
          evaluators.set(rule.id, evaluator);
        }),
      );
    }
    return chain.map(() => evaluators);
  }

  private buildAndEvaluate(
    scopes: ScopeUnit[],
    resolvedRules: ResolvedRule[],
    overrides: OverrideEntry[],
    settings: EffectiveSettings,
  ): ResultAsync<LintOutput, CodepolicyError> {
    const pairs = buildPairs(scopes, resolvedRules, overrides);
    this.logChecksSummary(pairs);
    if (pairs.length === 0) return okAsync({ results: [], errors: [] });

    const validation = validateExecution(
      pairs.map(([, rule]) => rule),
      settings.reasoningEffort ?? undefined,
    );
    if (validation.isErr()) return errAsync(validation.error);

    return this.createEvaluators(resolvedRules)
      .andThen((evaluatorMap) =>
        generateFileTree(this.workingDir).map((fileTree) => [fileTree, evaluatorMap] as const),
      )
      .andThen(([fileTree, evaluatorMap]) =>
        this.evaluateWithPool(pairs, fileTree, evaluatorMap, settings),
      );
  }

  private evaluateWithPool(
    pairs: ScopeRulePair[],
    fileTree: string | undefined,
    evaluatorMap: Map<string, PreparedEvaluator>,
    settings: EffectiveSettings,
  ): ResultAsync<LintOutput, CodepolicyError> {
    const limit = pLimit(settings.concurrency);

    const settledPromises = pairs.map(([scope, rule]) =>
      limit(async () => {
        const outcome = await this.evaluateOne(scope, rule, fileTree, evaluatorMap, settings);
        return { scope, rule, outcome };
      }),
    );

    return ResultAsync.fromSafePromise(Promise.all(settledPromises)).map((settled) => {
      const results: LintResult[] = [];
      const errors: LintErrorEntry[] = [];
      for (const { scope, rule, outcome } of settled) {
        if (outcome.isOk()) {
          results.push(outcome.value);
        } else {
          this.log.warn(`Skipped: ${outcome.error.message}`);
          errors.push({
            filePath: scope.filePath,
            scopeName: scope.name,
            rule,
            error: outcome.error,
          });
        }
      }
      return { results, errors };
    });
  }

  private evaluateOne(
    scope: ScopeUnit,
    rule: ResolvedRule,
    fileTree: string | undefined,
    evaluatorMap: Map<string, PreparedEvaluator>,
    settings: EffectiveSettings,
  ): ResultAsync<LintResult, CodepolicyError> {
    return this.logContextStore.run(
      { rule: rule.id, scope: `${scope.filePath}:${scope.name}` },
      () => {
        const evaluator = evaluatorMap.get(rule.id);
        if (!evaluator) {
          return errAsync(
            codepolicyError('RULE_INIT_ERROR', `Evaluator not found for rule: ${rule.id}`),
          );
        }
        return this.evaluation.evaluate(scope, rule, fileTree, evaluator, {
          noCache: settings.cacheDisabled,
          reasoningEffort: settings.reasoningEffort ?? undefined,
        });
      },
    );
  }
}
