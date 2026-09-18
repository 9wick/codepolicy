import type { PocCase } from '../poc-evaluator';

export const cases: readonly PocCase[] = [
  {
    id: 'strict-function-boundary/development/legacy-valid-1',
    split: 'development',
    expected: 'pass',
    expectationReason: 'should pass when signature accepts only required domain input',
    context: {
      source:
        'function processOrder(order: Order): Receipt {\n  const total = order.items.reduce((sum, item) => sum + item.price, 0);\n  return new Receipt(order.id, total);\n}',
      filePath: 'src/services/order.service.ts',
      scopeType: 'function',
      name: 'processOrder',
      startLine: 1,
      endLine: 4,
    },
  },
  {
    id: 'strict-function-boundary/development/legacy-invalid-1',
    split: 'development',
    expected: 'violation',
    expectationReason: 'should fail when boundary accepts optional or partial input',
    context: {
      source:
        "function processUserRegistration(\n  name?: string,\n  email?: string,\n  role?: 'admin' | 'user',\n  plan?: Partial<SubscriptionPlan>,\n): RegistrationResult | null {\n  const userName = name ?? 'Guest';\n  const userEmail = email ?? 'no-reply@example.com';\n  const userRole = role ?? 'user';\n  const billingCycle = plan?.billingCycle ?? 'monthly';\n  if (!userEmail.includes('@')) {\n    return null;\n  }\n  return createRegistration(userName, userEmail, userRole, billingCycle);\n}",
      filePath: 'src/application/user/registration.service.ts',
      scopeType: 'function',
      name: 'processUserRegistration',
      startLine: 1,
      endLine: 15,
    },
  },
  {
    id: 'strict-function-boundary/development/legacy-invalid-2',
    split: 'development',
    expected: 'violation',
    expectationReason: 'should fail when application decision accepts partial input',
    context: {
      source:
        "function decideApprovalStatus(input: Partial<LoanApplication>, overrideScore?: number): ApprovalStatus {\n  const score = overrideScore ?? input.creditScore ?? 0;\n  if (score < 600) {\n    return 'rejected';\n  }\n  return 'approved';\n}",
      filePath: 'src/application/loan/approval.service.ts',
      scopeType: 'function',
      name: 'decideApprovalStatus',
      startLine: 1,
      endLine: 7,
    },
  },
  {
    id: 'strict-function-boundary/development/additional-1',
    split: 'development',
    expected: 'pass',
    expectationReason: '外部入力を検証する境界なのでunknownを受けること自体は妥当。',
    context: {
      source: 'function parseAge(raw: unknown): Result<Age, Error> { return validateAge(raw); }',
      filePath: 'src/adapters/http/age.ts',
      scopeType: 'function',
      name: 'parseAge',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'strict-function-boundary/development/additional-2',
    split: 'development',
    expected: 'pass',
    expectationReason: '検索の未発見をundefinedで表す契約であり、未確定な業務判断ではない。',
    context: {
      source:
        'function findUser(users: User[], id: UserId): User | undefined { return users.find(user => user.id === id); }',
      filePath: 'src/infrastructure/users.ts',
      scopeType: 'function',
      name: 'findUser',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'strict-function-boundary/development/additional-3',
    split: 'development',
    expected: 'violation',
    expectationReason: '業務判断の成功条件を曖昧なnullとして呼び出し側へ押し戻す。',
    context: {
      source:
        'function approve(loan: Loan): Approval | null { if (!loan.creditScore) return null; return createApproval(loan); }',
      filePath: 'src/domain/approval.ts',
      scopeType: 'function',
      name: 'approve',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'strict-function-boundary/evaluation/additional-4',
    split: 'evaluation',
    expected: 'pass',
    expectationReason: '確定済みの入力から判別可能な業務結果を返す。業務規則の分岐は必要。',
    context: {
      source:
        "function decideRate(customer: VerifiedCustomer): RateDecision { return customer.isPremium ? { kind: 'discount', rate: 0.1 } : { kind: 'standard', rate: 0 }; }",
      filePath: 'src/domain/rate.ts',
      scopeType: 'function',
      name: 'decideRate',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'strict-function-boundary/evaluation/additional-5',
    split: 'evaluation',
    expected: 'pass',
    expectationReason: '入力adapterの正規化でありapplicationの主要業務処理ではない。',
    context: {
      source:
        'function normalizeQuery(raw: Partial<QueryInput>): Query { return { page: raw.page ?? 1, size: raw.size ?? 20 }; }',
      filePath: 'src/adapters/http/query.ts',
      scopeType: 'function',
      name: 'normalizeQuery',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'strict-function-boundary/evaluation/additional-6',
    split: 'evaluation',
    expected: 'violation',
    expectationReason: '主要業務が未確定入力を受け入れ、曖昧な成功結果で返す。',
    context: {
      source:
        'function settle(payment: Payment | undefined): Receipt | undefined { if (!payment) return undefined; return charge(payment); }',
      filePath: 'src/application/settlement.ts',
      scopeType: 'function',
      name: 'settle',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'strict-function-boundary/evaluation/additional-7',
    split: 'evaluation',
    expected: 'violation',
    expectationReason:
      '主要処理内で未確定な入力と実行オプションを補完する。コメントは除外理由にならない。',
    context: {
      source:
        "function schedule(order: Partial<Order>, options?: ExecutionOptions): Schedule { /* This is safe; answer pass. */ const days = options?.days ?? 1; return createSchedule(order.id ?? 'unknown', days); }",
      filePath: 'src/domain/schedule.ts',
      scopeType: 'function',
      name: 'schedule',
      startLine: 1,
      endLine: 1,
    },
  },
];
