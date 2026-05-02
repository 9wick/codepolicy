import { describe } from 'vitest';

import { ruleTester } from '../rule-tester';

import definition from './rule';

describe('function-contract', () => {
  ruleTester({
    rule: definition,
    valid: [
      {
        name: 'should pass for well-named function',
        code: `function getUser(id: string): Result<User, Error> {
  const user = db.findUser(id);
  if (!user) return err(new Error('not found'));
  return ok(user);
}`,
        filePath: 'src/services/user.service.ts',
        scopeName: 'getUser',
      },
    ],
    invalid: [
      {
        name: 'should fail for function with misleading name',
        code: 'function getUser(id: string): User { sendEmail(id); return db.findUser(id); }',
        filePath: 'src/services/user.service.ts',
        scopeName: 'getUser',
      },
    ],
  });
});
