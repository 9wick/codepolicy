import { createHash } from 'node:crypto';

import { errAsync, okAsync, type ResultAsync } from 'neverthrow';

import {
  RuleEvaluationService,
  type EvaluationResult,
} from '../application/rule-execution/rule-evaluation.service';
import { RuleResolver } from '../rules/rule-resolver.service';
import type { RegisteredRule } from '../rules/decision-rule-types';
import type { ScopeContext } from '../rules/rule-types';
import type { DecisionEvaluation } from '../shared/decision-types';
import { getAppContainer } from '../shared/container';
import type { RuleVerdict, TokenUsage, VerdictLabel } from '../shared/types';

export type PocCase = {
  readonly id: string;
  readonly split: 'development' | 'evaluation';
  readonly expected: 'pass' | 'violation';
  readonly expectationReason: string;
  readonly context: ScopeContext;
};

export type PocOutcome =
  | { kind: 'text'; readonly result: RuleVerdict; readonly usage: TokenUsage }
  | { kind: 'decision'; readonly result: DecisionEvaluation }
  | { kind: 'error'; readonly message: string };

export type PocRecord = {
  readonly caseId: string;
  readonly ruleId: string;
  readonly split: PocCase['split'];
  readonly expected: PocCase['expected'];
  readonly expectationReason: string;
  readonly fixtureHash: string;
  readonly ruleHash: string;
  readonly model: string;
  readonly sdkVersion: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly outcome: PocOutcome;
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function evaluate(
  testCase: PocCase,
  rule: RegisteredRule,
  model: string,
): ResultAsync<PocOutcome, Error> {
  const container = getAppContainer();
  const resolved = container
    .get(RuleResolver)
    .resolve({ filter: 'all', agent: model, rules: { [rule.id]: 'error' } }, [rule]);
  if (resolved.isErr()) return errAsync(new Error(resolved.error.message));
  const effective = resolved.value[0];
  if (!effective) return errAsync(new Error(`Rule not resolved: ${rule.id}`));
  const evaluation = container.get(RuleEvaluationService);
  const ctx = testCase.context;
  return evaluation
    .prepare(effective)
    .andThen((evaluator) =>
      evaluation.evaluate(
        {
          filePath: ctx.filePath,
          code: ctx.source,
          scopeType: ctx.scopeType,
          name: ctx.name,
          signature: ctx.signature,
          startLine: ctx.startLine,
          endLine: ctx.endLine,
        },
        effective,
        ctx.fileTree,
        evaluator,
        { noCache: true },
      ),
    )
    .mapErr((cause) => (cause.cause instanceof Error ? cause.cause : new Error(cause.message)))
    .map(toPocOutcome);
}

function toPocOutcome(evaluation: EvaluationResult): PocOutcome {
  if (evaluation.decision)
    return {
      kind: 'decision',
      result: {
        ...evaluation.decision,
        usage: evaluation.usage,
        durationMs: evaluation.durationMs,
      },
    };
  return {
    kind: 'text',
    result: {
      verdict: evaluation.verdict,
      reasoning: evaluation.reasoning,
      citations: evaluation.citations,
    },
    usage: evaluation.usage,
  };
}

export function evaluatePocCase(
  testCase: PocCase,
  rule: RegisteredRule,
  model: string,
): ResultAsync<PocRecord, Error> {
  if (
    !testCase.id.trim() ||
    !testCase.expectationReason.trim() ||
    !testCase.context.source.trim()
  ) {
    return errAsync(new Error('A PoC fixture requires an ID, expectation reason and source.'));
  }
  const start = performance.now();
  const metadata = {
    caseId: testCase.id,
    ruleId: rule.id,
    split: testCase.split,
    expected: testCase.expected,
    expectationReason: testCase.expectationReason,
    fixtureHash: hash(JSON.stringify(testCase)),
    ruleHash: hash(
      rule.kind === 'decision'
        ? JSON.stringify(rule.definition)
        : rule.definition.create.toString(),
    ),
    model,
    sdkVersion: '0.6.0',
    startedAt: new Date().toISOString(),
  };
  return evaluate(testCase, rule, model)
    .map((outcome) => ({
      ...metadata,
      durationMs: Math.round(performance.now() - start),
      outcome,
    }))
    .orElse((cause) => {
      const outcome: PocOutcome = { kind: 'error', message: cause.message };
      return okAsync({ ...metadata, durationMs: Math.round(performance.now() - start), outcome });
    });
}

export function recordVerdict(record: PocRecord): VerdictLabel | 'error' {
  const outcome = record.outcome;
  if (outcome.kind === 'error') return 'error';
  return outcome.kind === 'decision' ? outcome.result.result.verdict : outcome.result.verdict;
}

function percentile(values: number[], fraction: number): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}

function verdictCounts(records: readonly PocRecord[]) {
  const count = (label: VerdictLabel | 'error') =>
    records.filter((r) => recordVerdict(r) === label).length;
  return {
    pass: count('pass'),
    borderline: count('borderline'),
    violation: count('violation'),
    error: count('error'),
  };
}

function ratio(numerator: number, denominator: number) {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

function measurementDetails(records: readonly PocRecord[]) {
  const expectedPass = records.filter((r) => r.expected === 'pass');
  const expectedViolation = records.filter((r) => r.expected === 'violation');
  const pass = verdictCounts(expectedPass);
  const violation = verdictCounts(expectedViolation);
  const usages = records.flatMap((r) => {
    if (r.outcome.kind === 'error') return [];
    return [r.outcome.kind === 'decision' ? r.outcome.result.usage : r.outcome.usage];
  });
  return {
    confusion: { pass, violation },
    falsePositiveRate: ratio(pass.violation, expectedPass.length),
    falseNegativeRate: ratio(violation.pass, expectedViolation.length),
    borderlineRate: ratio(pass.borderline + violation.borderline, records.length),
    errorRate: ratio(pass.error + violation.error, records.length),
    usage: {
      inputTokens: usages.reduce((sum, usage) => sum + usage.inputTokens, 0),
      outputTokens: usages.reduce((sum, usage) => sum + usage.outputTokens, 0),
      measuredEvaluations: usages.length,
    },
  };
}

export function summarizePoc(records: readonly PocRecord[]) {
  const truePositives = records.filter(
    (r) => r.expected === 'violation' && recordVerdict(r) === 'violation',
  ).length;
  const predicted = records.filter((r) => recordVerdict(r) === 'violation').length;
  const expected = records.filter((r) => r.expected === 'violation').length;
  return {
    ...measurementDetails(records),
    total: records.length,
    correct: records.filter((r) => recordVerdict(r) === r.expected).length,
    errors: records.filter((r) => recordVerdict(r) === 'error').length,
    borderline: records.filter((r) => recordVerdict(r) === 'borderline').length,
    falsePositives: records.filter((r) => r.expected === 'pass' && recordVerdict(r) === 'violation')
      .length,
    falseNegatives: records.filter((r) => r.expected === 'violation' && recordVerdict(r) === 'pass')
      .length,
    precision: predicted === 0 ? null : truePositives / predicted,
    recall: expected === 0 ? null : truePositives / expected,
    p50Ms: percentile(
      records.map((r) => r.durationMs),
      0.5,
    ),
    p95Ms: percentile(
      records.map((r) => r.durationMs),
      0.95,
    ),
  };
}
