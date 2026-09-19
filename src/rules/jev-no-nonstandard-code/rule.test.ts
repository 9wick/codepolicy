import { describe, expect } from 'vitest';

import { decisionRuleTester } from '../../test-support/decision-rule-tester';
import { pocSuites } from '../../test-support/jev-fixtures';

describe('jev-no-nonstandard-code', () => {
  const suite = pocSuites.find((item) => item.baseline.id === 'no-nonstandard-code');
  if (!suite) expect.fail('Missing fixed PoC suite: no-nonstandard-code');
  decisionRuleTester(suite);
});
