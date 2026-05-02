import { describe } from 'vitest';

import { ruleTester } from '../rule-tester';

import definition from './rule';

describe('no-implicit-fallback', () => {
  ruleTester({
    rule: definition,
    valid: [
      {
        name: 'should pass when function uses no implicit fallback',
        code: `function processOrder(order: Order): Receipt {
  if (order.items.length === 0) {
    throw new Error('order must contain at least one item');
  }
  const total = order.items.reduce((sum, item) => sum + item.price, 0);
  return new Receipt(order.id, total);
}`,
        filePath: 'src/services/order.service.ts',
        scopeName: 'processOrder',
      },
    ],
    invalid: [
      {
        name: 'should fail when missing business input is replaced with valid domain value',
        code: `function decideShippingTier(order: Order): ShippingTier {
  const country = order.shippingAddress?.country ?? 'JP';
  if (country === 'JP') {
    return 'domestic';
  }
  return 'international';
}`,
        filePath: 'src/application/shipping/shipping-tier.service.ts',
        scopeName: 'decideShippingTier',
      },
      {
        name: 'should fail when exceptions are swallowed into defaults',
        code: `function parsePort(env: Env): number {
  try {
    return Number.parseInt(env.PORT, 10);
  } catch {
    return 3000;
  }
}`,
        filePath: 'src/config/env.ts',
        scopeName: 'parsePort',
      },
    ],
  });
});
