import { describe } from 'vitest';

import { ruleTester } from '../rule-tester';

import definition from './rule';

describe('test-validity', () => {
  ruleTester({
    rule: definition,
    valid: [
      {
        name: 'should pass when assertions match test description',
        code: `() => {
  const result = validateEmail('not-an-email');
  expect(result.isErr()).toBe(true);
  expect(result.error.message).toContain('invalid');
}`,
        filePath: 'src/services/__tests__/user.service.test.ts',
        scopeName: 'UserService > validateEmail > should return error for invalid email',
      },
    ],
    invalid: [
      {
        name: 'should fail when assertions do not match test description',
        code: `() => {
  const user = createUser('test@example.com');
  expect(user.name).toBe('test');
}`,
        filePath: 'src/services/__tests__/user.service.test.ts',
        scopeName: 'UserService > validateEmail > should return error for invalid email',
      },
    ],
  });
});
