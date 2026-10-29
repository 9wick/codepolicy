import { describe, expect, it } from 'vitest';

import { pocSuites } from './jev-fixtures';
import { listDecisionRuleChecks } from './decision-rule-tester';

describe('decision rule test selection', () => {
  it('defines separate Jev and baseline checks for every fixed fixture', () => {
    const suite = pocSuites.find((item) => item.baseline.id === 'no-implicit-fallback');
    if (!suite) expect.fail('Missing fixed PoC suite: no-implicit-fallback');

    const checks = listDecisionRuleChecks(suite);

    expect(checks).toHaveLength(suite.cases.length * 2);
    expect(checks.filter((check) => check.target === 'Jev')).toHaveLength(suite.cases.length);
    expect(checks.filter((check) => check.target === 'baseline')).toHaveLength(suite.cases.length);
    expect(checks.map((check) => check.name)).toContain(
      'Jev: no-implicit-fallback/development/legacy-invalid-1',
    );
    expect(checks.map((check) => check.name)).toContain(
      'baseline: no-implicit-fallback/development/legacy-invalid-1',
    );
    expect(listDecisionRuleChecks(suite, 'baseline')).toEqual(
      checks.filter((check) => check.target === 'baseline'),
    );
    expect(listDecisionRuleChecks(suite, 'Jev')).toEqual(
      checks.filter((check) => check.target === 'Jev'),
    );
  });
});
