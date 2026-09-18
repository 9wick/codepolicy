import { inject, injectable } from '@needle-di/core';
import { okAsync, type ResultAsync } from 'neverthrow';

import type { LookupOutcome } from '../../infrastructure/cache/cache-store';
import type { ScopeContext } from '../../rules/rule-types';
import type { DecisionSnapshot } from '../../shared/decision-types';
import { codepolicyError, type CodepolicyError } from '../../shared/errors';
import { CreateLogger } from '../../shared/logger';
import type {
  LintResult,
  ModelReasoningEffort,
  ResolvedRule,
  RuleVerdict,
  ScopeUnit,
  TokenUsage,
} from '../../shared/types';
import { WorkingDir } from '../config/config-loader.service';

import { buildCacheInput, buildResultFromCache } from './cache-helpers';
import { createLlmHelper } from './create-llm-helper';
import { toDisplayVerdict } from './decision-judge';
import { EvalCacheService, type CacheKeyInput } from './eval-cache.service';
import { runDecision } from './run-decision';
import { generateFileTree } from './file-tree.lib';

export type EvaluationOptions = {
  noCache?: boolean;
  reasoningEffort?: ModelReasoningEffort;
  mode?: 'file';
};

export type EvaluationData = RuleVerdict & {
  usage: TokenUsage;
  durationMs: number;
  decision?: DecisionSnapshot;
};

export type PreparedEvaluator = (
  context: ScopeContext,
  model: string,
  reasoningEffort: ModelReasoningEffort | undefined,
) => ResultAsync<EvaluationData, Error>;

export type EvaluationResult = LintResult & { decision?: DecisionSnapshot };

function toScopeContext(scope: ScopeUnit, fileTree: string | undefined): ScopeContext {
  return {
    source: scope.code,
    filePath: scope.filePath,
    scopeType: scope.scopeType,
    name: scope.name,
    signature: scope.signature,
    fileTree,
    startLine: scope.startLine,
    endLine: scope.endLine,
  };
}

@injectable()
export class RuleEvaluationService {
  constructor(
    private cache = inject(EvalCacheService),
    private workingDir = inject(WorkingDir),
    private log = inject(CreateLogger)('RuleEvaluation'),
  ) {}

  evaluateFile(
    scope: ScopeUnit,
    rule: ResolvedRule,
    options: EvaluationOptions,
  ): ResultAsync<EvaluationResult, CodepolicyError> {
    const tree = rule.kind === 'decision' ? generateFileTree(this.workingDir) : okAsync(undefined);
    return this.prepare(rule)
      .andThen((evaluator) => tree.map((fileTree) => ({ evaluator, fileTree })))
      .andThen(({ evaluator, fileTree }) =>
        this.evaluate(scope, rule, fileTree, evaluator, { ...options, mode: 'file' }),
      );
  }

  prepare(rule: ResolvedRule): ResultAsync<PreparedEvaluator, CodepolicyError> {
    if (rule.kind === 'decision') {
      return okAsync((ctx, model) =>
        runDecision(ctx, rule.definition, model).map((evaluation) => ({
          ...toDisplayVerdict(evaluation.result),
          usage: evaluation.usage,
          durationMs: evaluation.durationMs,
          decision: {
            result: evaluation.result,
            requestedModel: evaluation.requestedModel,
            responseModel: evaluation.responseModel,
          },
        })),
      );
    }
    return rule
      .create(this.workingDir, rule.options)
      .mapErr((cause) =>
        codepolicyError(
          'RULE_INIT_ERROR',
          `Rule init failed for ${rule.id}: ${cause.message}`,
          cause,
        ),
      )
      .map(
        (evaluate): PreparedEvaluator =>
          (ctx, model, reasoningEffort) => {
            const helper = createLlmHelper(ctx, model, this.workingDir, reasoningEffort);
            const start = performance.now();
            return evaluate({ ...ctx, llm: helper }).map((verdict) => ({
              ...verdict,
              usage: helper.getUsage(),
              durationMs: Math.round(performance.now() - start),
            }));
          },
      );
  }

  evaluate(
    scope: ScopeUnit,
    rule: ResolvedRule,
    fileTree: string | undefined,
    evaluator: PreparedEvaluator,
    options: EvaluationOptions,
  ): ResultAsync<EvaluationResult, CodepolicyError> {
    const run = () => this.execute(scope, rule, fileTree, evaluator, options.reasoningEffort);
    if (options.noCache || rule.cacheable === false) return run();
    const input = buildCacheInput(scope, rule, fileTree, options.reasoningEffort, options.mode);
    const start = performance.now();
    return this.cache
      .lookup(input)
      .andThen((outcome) => this.afterLookup(outcome, scope, rule, input, start, run));
  }

  private execute(
    scope: ScopeUnit,
    rule: ResolvedRule,
    fileTree: string | undefined,
    evaluator: PreparedEvaluator,
    reasoningEffort: ModelReasoningEffort | undefined,
  ): ResultAsync<EvaluationResult, CodepolicyError> {
    this.log.info('Evaluating...');
    return evaluator(toScopeContext(scope, fileTree), rule.agent, reasoningEffort)
      .mapErr((cause) => codepolicyError('LLM_API_ERROR', 'Rule execution failed.', cause))
      .map((evaluation) => {
        this.logEvaluation(evaluation);
        return { ...evaluation, filePath: scope.filePath, scopeName: scope.name, rule };
      });
  }

  private afterLookup(
    outcome: LookupOutcome,
    scope: ScopeUnit,
    rule: ResolvedRule,
    input: CacheKeyInput,
    start: number,
    run: () => ResultAsync<EvaluationResult, CodepolicyError>,
  ): ResultAsync<EvaluationResult, CodepolicyError> {
    if (outcome.kind === 'hit') {
      const durationMs = Math.round(performance.now() - start);
      this.log.info(
        `${outcome.entry.verdict.toUpperCase()} [cache hit | ${(durationMs / 1000).toFixed(1)}sec]`,
      );
      const result = {
        ...buildResultFromCache(scope, rule, outcome.entry, durationMs),
        decision: outcome.entry.decision,
      };
      if (result.decision)
        this.log.debug(
          JSON.stringify({ ...result.decision, usage: result.usage, durationMs, cacheHit: true }),
        );
      return okAsync(result);
    }
    if (outcome.kind === 'corrupted') {
      this.log.warn(`Cache entry corrupted, re-evaluating: ${outcome.cause.message}`);
    }
    return run().andThen((result) =>
      this.cache
        .save(input, result)
        .map(() => result)
        .orElse((cause) => {
          this.log.warn(`Failed to save cache: ${cause.message}`);
          return okAsync<EvaluationResult, CodepolicyError>(result);
        }),
    );
  }

  private logEvaluation(evaluation: EvaluationData): void {
    const { usage, durationMs, verdict } = evaluation;
    this.log.info(
      `${verdict.toUpperCase()} [${(durationMs / 1000).toFixed(1)}sec | token in:${usage.inputTokens.toLocaleString()} out:${usage.outputTokens.toLocaleString()}]`,
    );
    const details: string[] = [];
    if (usage.cacheReadInputTokens > 0 || usage.cacheCreationInputTokens > 0) {
      details.push(
        `cache: read=${usage.cacheReadInputTokens.toLocaleString()} create=${usage.cacheCreationInputTokens.toLocaleString()}`,
      );
    }
    if (usage.reasoningTokens > 0)
      details.push(`reasoning: ${usage.reasoningTokens.toLocaleString()}`);
    if (details.length > 0) this.log.debug(`  ${details.join(' | ')}`);
  }
}
