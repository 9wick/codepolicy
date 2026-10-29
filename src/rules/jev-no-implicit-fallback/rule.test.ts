import { describe, expect, it } from 'vitest';

import { decisionRuleTester } from '../../test-support/decision-rule-tester';
import { pocSuites } from '../../test-support/jev-fixtures';
import { semanticCases } from '../../test-support/jev-fixtures/no-implicit-fallback-semantics';
import { evaluatePocCase, recordVerdict } from '../../test-support/poc-evaluator';
import { getAppContainer } from '../../shared/container';
import { CreateLogger } from '../../shared/logger';

declare const CODEPOLICY_TEST_JEV_MODEL: string;

// The historical fixtures retain their original verdicts for comparing the old policy.
// The new policy permits boundary defaults and rejects invented domain/measurement values.
const policyVerdicts: Readonly<
  Record<string, { verdict: 'pass' | 'violation'; reason: string; role: string }>
> = {
  'no-implicit-fallback/semantics/development/unknown-usage': {
    verdict: 'violation',
    reason: 'Unmeasured usage must not become a measured zero.',
    role: 'invented_value',
  },
  'no-implicit-fallback/semantics/development/raw-input': {
    verdict: 'pass',
    reason: 'A conventional pagination control default at the HTTP input boundary is permitted.',
    role: 'boundary_default',
  },
  'no-implicit-fallback/semantics/development/mixed-input-paths': {
    verdict: 'violation',
    reason: 'A missing update instruction must not be changed into an empty-string update.',
    role: 'invented_value',
  },
  'no-implicit-fallback/semantics/evaluation/measurement-map': {
    verdict: 'violation',
    reason: 'An unknown measurement must not become a measured zero.',
    role: 'invented_value',
  },
};

describe('jev-no-implicit-fallback', () => {
  const suite = pocSuites.find((item) => item.baseline.id === 'no-implicit-fallback');
  if (!suite) expect.fail('Missing fixed PoC suite: no-implicit-fallback');
  decisionRuleTester(suite);
  for (const { testCase, expectedChoices } of semanticCases) {
    it(`Jev semantics: ${testCase.id}`, async () => {
      const policyVerdict = policyVerdicts[testCase.id];
      const policyCase = policyVerdict
        ? {
            ...testCase,
            expected: policyVerdict.verdict,
            expectationReason: policyVerdict.reason,
          }
        : testCase;
      const record = (
        await evaluatePocCase(policyCase, suite.decision, CODEPOLICY_TEST_JEV_MODEL)
      )._unsafeUnwrap();
      getAppContainer()
        .get(CreateLogger)('SemanticRuleTester')
        .info(`JEV_SEMANTIC_RECORD ${JSON.stringify({ ...record, expectedChoices })}`);
      if (record.outcome.kind !== 'decision') expect.fail(JSON.stringify(record));
      const actualChoices = Object.fromEntries(
        record.outcome.result.result.observations
          .filter((observation) => observation.id !== 'input_policy_role')
          .map((observation) => [observation.id, observation.choice?.choice]),
      );
      expect(actualChoices, JSON.stringify(record)).toEqual(expectedChoices);
      if (policyVerdict) {
        expect(
          record.outcome.result.result.observations.find(
            (observation) => observation.id === 'input_policy_role',
          )?.choice?.choice,
          JSON.stringify(record),
        ).toBe(policyVerdict.role);
      }
      expect(recordVerdict(record), JSON.stringify(record)).toBe(policyCase.expected);
    }, 240_000);
  }
});
