import { execFileSync } from 'node:child_process';

import { okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import type { RegisteredRule } from '../rules/decision-rule-types';

import { pocSuites } from './jev-fixtures';
import { measurePoc } from './poc-runner';
import type { PocCase, PocRecord } from './poc-evaluator';

describe('PoC runner', () => {
  it('previews all 52 cases and 312 evaluations without calling APIs', () => {
    const output = execFileSync('bun', ['run', 'src/cli/jev-benchmark.ts', '--check'], {
      encoding: 'utf8',
    });
    expect(JSON.parse(output)).toMatchObject({ rules: 5, cases: 52, evaluations: 312 });
  }, 30_000);

  it('records 52 cases × 2 routes × 3 repetitions serially, including failures', async () => {
    const evaluate = vi.fn((testCase: PocCase, rule: RegisteredRule, model: string) =>
      okAsync<PocRecord>({
        caseId: testCase.id,
        ruleId: rule.id,
        split: testCase.split,
        expected: testCase.expected,
        expectationReason: testCase.expectationReason,
        fixtureHash: 'fixed-fixture',
        ruleHash: 'fixed-rule',
        model,
        sdkVersion: '0.6.0',
        startedAt: '2026-09-18T00:00:00Z',
        durationMs: 10,
        outcome: { kind: 'error', message: 'recorded failure' },
      }),
    );
    const persist = vi.fn(() => okAsync(undefined));
    const records = (
      await measurePoc(
        pocSuites,
        { text: 'openai/gpt-5.4', decision: 'typesafe-jev-1.13.0' },
        persist,
        evaluate,
      )
    )._unsafeUnwrap();
    expect(records).toHaveLength(312);
    expect(persist).toHaveBeenCalledTimes(312);
    expect(new Set(records.map((r) => r.caseId)).size).toBe(52);
    expect(evaluate.mock.calls[0]?.[0]).toBe(evaluate.mock.calls[1]?.[0]);
    expect(persist.mock.calls.length).toBe(records.length);
  });
});
