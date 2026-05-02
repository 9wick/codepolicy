import { describe } from 'vitest';

import { ruleTester } from '../rule-tester';

import definition from './rule';

const consistentServiceA = `function findUserById(id: string): Result<User, NotFoundError> {
  return userRepository.findById(id)
    .mapErr(() => new NotFoundError('User', id));
}`;

const consistentServiceB = `function findOrderById(id: string): Result<Order, NotFoundError> {
  return orderRepository.findById(id)
    .mapErr(() => new NotFoundError('Order', id));
}`;

const inconsistentServiceA = `function findUserById(id: string): User | null {
  const user = db.query('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return null;
  return user;
}`;

const inconsistentServiceB = `function findOrderById(id: string): Result<Order, AppError> {
  return orderRepository.findById(id)
    .mapErr((e) => new AppError('ORDER_NOT_FOUND', e));
}`;

describe('layer-symmetry', () => {
  ruleTester({
    rule: definition,
    valid: [
      {
        name: '同ロール関数が同じスタイルで書かれていればPASS',
        code: consistentServiceA,
        filePath: 'services/user.service.ts',
        scopeName: 'findUserById',
        testFiles: {
          'services/user.service.ts': consistentServiceA,
          'services/order.service.ts': consistentServiceB,
        },
      },
    ],
    invalid: [
      {
        name: '同ロール関数のエラーハンドリングパターンが異なればFAIL',
        code: inconsistentServiceA,
        filePath: 'services/user.service.ts',
        scopeName: 'findUserById',
        testFiles: {
          'services/user.service.ts': inconsistentServiceA,
          'services/order.service.ts': inconsistentServiceB,
        },
      },
    ],
  });
});
