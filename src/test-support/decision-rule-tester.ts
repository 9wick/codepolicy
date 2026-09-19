import { expect, it } from 'vitest';

import { getAppContainer } from '../shared/container';
import { CreateLogger } from '../shared/logger';

import type { PocSuite } from './jev-fixtures';
import { evaluatePocCase, recordVerdict } from './poc-evaluator';

declare const CODEPOLICY_TEST_AGENT: string;
declare const CODEPOLICY_TEST_JEV_MODEL: string;
declare const CODEPOLICY_TEST_REPORT_DECISIONS: boolean;

export type DecisionRuleCheck = {
  readonly name: string;
  readonly target: 'Jev' | 'baseline';
  readonly testCase: PocSuite['cases'][number];
};

export function listDecisionRuleChecks(suite: PocSuite): readonly DecisionRuleCheck[] {
  return suite.cases.flatMap((testCase) => [
    { name: `Jev: ${testCase.id}`, target: 'Jev', testCase },
    { name: `baseline: ${testCase.id}`, target: 'baseline', testCase },
  ]);
}

export function decisionRuleTester(suite: PocSuite): void {
  for (const check of listDecisionRuleChecks(suite)) {
    it(check.name, async () => {
      const rule = check.target === 'Jev' ? suite.decision : suite.baseline;
      const model = check.target === 'Jev' ? CODEPOLICY_TEST_JEV_MODEL : CODEPOLICY_TEST_AGENT;
      const result = await evaluatePocCase(check.testCase, rule, model);
      if (result.isErr()) expect.fail(result.error.message);
      if (result.value.outcome.kind === 'error') expect.fail(result.value.outcome.message);
      if (check.target === 'Jev' && CODEPOLICY_TEST_REPORT_DECISIONS)
        getAppContainer()
          .get(CreateLogger)('DecisionRuleTester')
          .info(`JEV_RECORD ${JSON.stringify(result.value)}`);
      expect(recordVerdict(result.value), JSON.stringify(result.value)).toBe(
        check.testCase.expected,
      );
    }, 240_000);
  }
}
