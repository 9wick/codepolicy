import { expect, it } from 'vitest';

import type { PocSuite } from './jev-fixtures';
import { evaluatePocCase, recordVerdict } from './poc-evaluator';

declare const CODEPOLICY_TEST_AGENT: string;
declare const CODEPOLICY_TEST_JEV_MODEL: string;

export function decisionRuleTester(suite: PocSuite): void {
  for (const testCase of suite.cases) {
    it(testCase.id, async () => {
      const decision = await evaluatePocCase(testCase, suite.decision, CODEPOLICY_TEST_JEV_MODEL);
      if (decision.isErr()) expect.fail(decision.error.message);
      if (decision.value.outcome.kind === 'error') expect.fail(decision.value.outcome.message);
      const baseline = await evaluatePocCase(testCase, suite.baseline, CODEPOLICY_TEST_AGENT);
      if (baseline.isErr()) expect.fail(baseline.error.message);
      expect(recordVerdict(decision.value), JSON.stringify(decision.value)).toBe(testCase.expected);
      expect(recordVerdict(baseline.value), JSON.stringify(baseline.value)).toBe(testCase.expected);
    }, 240_000);
  }
}
