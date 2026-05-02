import { describe } from 'vitest';

import { ruleTester } from '../rule-tester';

import definition from './rule';

describe('no-invalid-state-type', () => {
  ruleTester({
    rule: definition,
    valid: [
      {
        name: 'should pass for discriminated union that encodes valid states only',
        code: `type OrderState =
  | { kind: 'pending'; requestedAt: Date }
  | { kind: 'approved'; approvedAt: Date; approverId: UserId }
  | { kind: 'rejected'; rejectedAt: Date; reason: RejectionReason };`,
        filePath: 'src/domain/order-state.ts',
        scopeName: 'OrderState',
        scopeType: 'type',
      },
      {
        name: 'should pass for validated value object with all required fields',
        code: `interface SignupCredentials {
  email: EmailAddress;
  password: HashedPassword;
}`,
        filePath: 'src/domain/signup-credentials.ts',
        scopeName: 'SignupCredentials',
        scopeType: 'interface',
      },
    ],
    invalid: [
      {
        name: 'should fail when interface allows impossible combinations',
        code: `interface Shipment {
  status: 'pending' | 'shipped';
  shippedAt?: Date;
}`,
        filePath: 'src/domain/shipment.ts',
        scopeName: 'Shipment',
        scopeType: 'interface',
      },
      {
        name: 'should fail when completed entity includes unvalidated state',
        code: `type User = {
  id?: string;
  email: string | null;
  status: 'active' | 'disabled';
};`,
        filePath: 'src/domain/user.ts',
        scopeName: 'User',
        scopeType: 'type',
      },
    ],
  });
});
