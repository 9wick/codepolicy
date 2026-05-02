import { describe } from 'vitest';

import { ruleTester } from '../rule-tester';

import definition from './rule';

describe('no-nonstandard-code', () => {
  ruleTester({
    rule: definition,
    valid: [
      {
        name: 'should pass for standard for-of loop with accumulator',
        code: `function calculateTotal(items: CartItem[]): number {
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total;
}`,
        filePath: 'src/services/cart.service.ts',
        scopeName: 'calculateTotal',
      },
      {
        name: 'should pass for standard filter + map chain',
        code: `function getActiveUserNames(users: User[]): string[] {
  return users
    .filter(user => user.isActive)
    .map(user => user.name);
}`,
        filePath: 'src/services/user.service.ts',
        scopeName: 'getActiveUserNames',
      },
      {
        name: 'should pass for .at(-1) to access last element',
        code: `function getLastItem<T>(items: T[]): T | undefined {
  return items.at(-1);
}`,
        filePath: 'src/utils/array.ts',
        scopeName: 'getLastItem',
      },
    ],
    invalid: [
      {
        name: 'should fail for Function constructor (score ~0)',
        code: `function createValidator(condition: string): (x: number) => boolean {
  return new Function('x', \`return \${condition}\`) as (x: number) => boolean;
}`,
        filePath: 'src/utils/validator.ts',
        scopeName: 'createValidator',
      },
      {
        name: 'should fail for bitwise truncation hack (score ~30)',
        code: `function truncateValue(x: number): number {
  return ~~x;
}`,
        filePath: 'src/utils/math.ts',
        scopeName: 'truncateValue',
      },
      {
        name: 'should fail for comma operator (score ~25)',
        code: `function incrementAndGet(state: { count: number }): number {
  return (state.count++, state.count);
}`,
        filePath: 'src/state/counter.ts',
        scopeName: 'incrementAndGet',
      },
    ],
  });
});
