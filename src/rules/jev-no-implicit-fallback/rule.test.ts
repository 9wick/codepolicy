import { describe, expect } from 'vitest';

import { decisionRuleTester } from '../../test-support/decision-rule-tester';
import { pocSuites } from '../../test-support/jev-fixtures';

describe('jev-no-implicit-fallback', () => {
  const suite = pocSuites.find((item) => item.baseline.id === 'no-implicit-fallback');
  if (!suite) expect.fail('Missing fixed PoC suite: no-implicit-fallback');
  decisionRuleTester(suite);
});
