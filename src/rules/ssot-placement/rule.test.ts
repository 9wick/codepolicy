import { describe } from 'vitest';

import { ruleTester } from '../rule-tester';

import definition from './rule';

const fileTree = `src/
  controllers/
    user.controller.ts
    order.controller.ts
  services/
    user.service.ts
    order.service.ts
    email.service.ts
  utils/
    date.ts
    string.ts
    validation.ts
  models/
    user.model.ts
    order.model.ts`;

describe('ssot-placement', () => {
  ruleTester({
    rule: definition,
    valid: [
      {
        name: 'should pass when function is placed in appropriate file',
        code: `export function formatDate(date: Date): string {
  return date.toISOString();
}`,
        filePath: 'src/utils/date.ts',
        scopeName: 'formatDate',
        fileTree,
      },
    ],
    invalid: [
      {
        name: 'should fail when function is placed in wrong location',
        code: `export function sendWelcomeEmail(user: { name: string; email: string }): void {
  console.log('sending email to ' + user.email);
}`,
        filePath: 'src/models/user.model.ts',
        scopeName: 'sendWelcomeEmail',
        fileTree,
      },
    ],
  });
});
