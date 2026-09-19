import { describe, expect } from 'vitest';

import { decisionRuleTester } from '../../test-support/decision-rule-tester';
import { pocSuites } from '../../test-support/jev-fixtures';

describe('jev-strict-function-boundary', () => {
  const suite = pocSuites.find((item) => item.baseline.id === 'strict-function-boundary');
  if (!suite) expect.fail('Missing fixed PoC suite: strict-function-boundary');
  decisionRuleTester(suite);
});
