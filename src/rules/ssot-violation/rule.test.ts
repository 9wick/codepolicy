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

describe('ssot-violation', () => {
  ruleTester({
    rule: definition,
    valid: [
      {
        name: 'should pass when function is placed in appropriate file',
        code: `export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return \`\${year}-\${month}-\${day}\`;
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
  const subject = 'Welcome!';
  const body = \`Hello \${user.name}, welcome to our platform!\`;
  emailClient.send({ to: user.email, subject, body });
}`,
        filePath: 'src/models/user.model.ts',
        scopeName: 'sendWelcomeEmail',
        fileTree,
      },
    ],
  });
});
