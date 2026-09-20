import { describe, expect, it } from 'vitest';

import { decisionRuleTester } from '../../test-support/decision-rule-tester';
import { pocSuites } from '../../test-support/jev-fixtures';
import { semanticCases } from '../../test-support/jev-fixtures/no-implicit-fallback-semantics';
import { evaluatePocCase, recordVerdict } from '../../test-support/poc-evaluator';
import { getAppContainer } from '../../shared/container';
import { CreateLogger } from '../../shared/logger';

declare const CODEPOLICY_TEST_JEV_MODEL: string;

describe('jev-no-implicit-fallback', () => {
  const suite = pocSuites.find((item) => item.baseline.id === 'no-implicit-fallback');
  if (!suite) expect.fail('Missing fixed PoC suite: no-implicit-fallback');
  decisionRuleTester(suite);
  for (const { testCase, expectedChoices } of semanticCases) {
    it(`Jev semantics: ${testCase.id}`, async () => {
      const record = (
        await evaluatePocCase(testCase, suite.decision, CODEPOLICY_TEST_JEV_MODEL)
      )._unsafeUnwrap();
      getAppContainer()
        .get(CreateLogger)('SemanticRuleTester')
        .info(`JEV_SEMANTIC_RECORD ${JSON.stringify({ ...record, expectedChoices })}`);
      if (record.outcome.kind !== 'decision') expect.fail(JSON.stringify(record));
      const actualChoices = Object.fromEntries(
        record.outcome.result.result.observations.map((observation) => [
          observation.id,
          observation.choice?.choice,
        ]),
      );
      expect(actualChoices, JSON.stringify(record)).toEqual(expectedChoices);
      expect(recordVerdict(record), JSON.stringify(record)).toBe(testCase.expected);
    }, 240_000);
  }
});
