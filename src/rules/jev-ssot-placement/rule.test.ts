import { describe, expect } from 'vitest';

import { decisionRuleTester } from '../../test-support/decision-rule-tester';
import { pocSuites } from '../../test-support/jev-fixtures';

describe('jev-ssot-placement', () => {
  const suite = pocSuites.find((item) => item.baseline.id === 'ssot-placement');
  if (!suite) expect.fail('Missing fixed PoC suite: ssot-placement');
  decisionRuleTester(suite);
});
