import { describe } from 'vitest';

import { ruleTester } from '../rule-tester';

import definition from './rule';

describe('strict-function-boundary', () => {
  ruleTester({
    rule: definition,
    valid: [
      {
        name: 'should pass when signature accepts only required domain input',
        code: `function processOrder(order: Order): Receipt {
  const total = order.items.reduce((sum, item) => sum + item.price, 0);
  return new Receipt(order.id, total);
}`,
        filePath: 'src/services/order.service.ts',
        scopeName: 'processOrder',
      },
    ],
    invalid: [
      {
        name: 'should fail when boundary accepts optional or partial input',
        code: `function processUserRegistration(
  name?: string,
  email?: string,
  role?: 'admin' | 'user',
  plan?: Partial<SubscriptionPlan>,
): RegistrationResult | null {
  const userName = name ?? 'Guest';
  const userEmail = email ?? 'no-reply@example.com';
  const userRole = role ?? 'user';
  const billingCycle = plan?.billingCycle ?? 'monthly';
  if (!userEmail.includes('@')) {
    return null;
  }
  return createRegistration(userName, userEmail, userRole, billingCycle);
}`,
        filePath: 'src/application/user/registration.service.ts',
        scopeName: 'processUserRegistration',
      },
      {
        name: 'should fail when application decision accepts partial input',
        code: `function decideApprovalStatus(input: Partial<LoanApplication>, overrideScore?: number): ApprovalStatus {
  const score = overrideScore ?? input.creditScore ?? 0;
  if (score < 600) {
    return 'rejected';
  }
  return 'approved';
}`,
        filePath: 'src/application/loan/approval.service.ts',
        scopeName: 'decideApprovalStatus',
      },
    ],
  });
});
