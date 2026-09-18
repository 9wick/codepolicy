import { describe, expect } from 'vitest';

import { decisionRuleTester } from '../../test-support/decision-rule-tester';
import { pocSuites } from '../../test-support/jev-fixtures';

describe('jev-no-invalid-state-type', () => {
  const suite = pocSuites.find((item) => item.baseline.id === 'no-invalid-state-type');
  if (!suite) expect.fail('Missing fixed PoC suite: no-invalid-state-type');
  decisionRuleTester(suite);
});
