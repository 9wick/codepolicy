import type { PocCase } from '../poc-evaluator';

export const cases: readonly PocCase[] = [
  {
    id: 'ssot-placement/development/legacy-valid-1',
    split: 'development',
    expected: 'pass',
    expectationReason: 'should pass when function is placed in appropriate file',
    context: {
      source: 'export function formatDate(date: Date): string {\n  return date.toISOString();\n}',
      filePath: 'src/utils/date.ts',
      scopeType: 'exported-function',
      name: 'formatDate',
      fileTree:
        'src/\n  controllers/\n    user.controller.ts\n    order.controller.ts\n  services/\n    user.service.ts\n    order.service.ts\n    email.service.ts\n  utils/\n    date.ts\n    string.ts\n    validation.ts\n  models/\n    user.model.ts\n    order.model.ts',
      startLine: 1,
      endLine: 3,
    },
  },
  {
    id: 'ssot-placement/development/legacy-invalid-1',
    split: 'development',
    expected: 'violation',
    expectationReason: 'should fail when function is placed in wrong location',
    context: {
      source:
        "export function sendWelcomeEmail(user: { name: string; email: string }): void {\n  console.log('sending email to ' + user.email);\n}",
      filePath: 'src/models/user.model.ts',
      scopeType: 'exported-function',
      name: 'sendWelcomeEmail',
      fileTree:
        'src/\n  controllers/\n    user.controller.ts\n    order.controller.ts\n  services/\n    user.service.ts\n    order.service.ts\n    email.service.ts\n  utils/\n    date.ts\n    string.ts\n    validation.ts\n  models/\n    user.model.ts\n    order.model.ts',
      startLine: 1,
      endLine: 3,
    },
  },
  {
    id: 'ssot-placement/development/additional-1',
    split: 'development',
    expected: 'pass',
    expectationReason: 'メール送信サービスの責務と配置が一致する。',
    context: {
      source:
        'export async function sendEmail(message: Email): Promise<void> { await mailer.send(message); }',
      filePath: 'src/services/email.service.ts',
      scopeType: 'exported-function',
      name: 'sendEmail',
      fileTree:
        'src/\n  adapters/http/order.controller.ts\n  application/register-user.ts\n  application/place-order.ts\n  domain/order.ts\n  domain/price.ts\n  infrastructure/database.ts\n  services/email.service.ts\n  utils/date.ts\n  utils/string.ts\n  utils/query.ts',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'ssot-placement/development/additional-2',
    split: 'development',
    expected: 'pass',
    expectationReason: '業務の価格計算をdomainの価格モジュールに置いている。',
    context: {
      source:
        'export function calculatePrice(items: LineItem[]): Money { return sumPrices(items); }',
      filePath: 'src/domain/price.ts',
      scopeType: 'exported-function',
      name: 'calculatePrice',
      fileTree:
        'src/\n  adapters/http/order.controller.ts\n  application/register-user.ts\n  application/place-order.ts\n  domain/order.ts\n  domain/price.ts\n  infrastructure/database.ts\n  services/email.service.ts\n  utils/date.ts\n  utils/string.ts\n  utils/query.ts',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'ssot-placement/development/additional-3',
    split: 'development',
    expected: 'violation',
    expectationReason: 'domainにDBの永続化操作が入り、infrastructureの責務を担っている。',
    context: {
      source:
        "export async function saveOrder(order: Order): Promise<void> { await sql.execute('INSERT INTO orders VALUES (?)', [order]); }",
      filePath: 'src/domain/order.ts',
      scopeType: 'exported-function',
      name: 'saveOrder',
      fileTree:
        'src/\n  adapters/http/order.controller.ts\n  application/register-user.ts\n  application/place-order.ts\n  domain/order.ts\n  domain/price.ts\n  infrastructure/database.ts\n  services/email.service.ts\n  utils/date.ts\n  utils/string.ts\n  utils/query.ts',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'ssot-placement/development/additional-4',
    split: 'development',
    expected: 'violation',
    expectationReason: '文字列utilityがユーザー登録の業務フローを担っている。',
    context: {
      source:
        'export async function registerUser(input: Signup): Promise<User> { const user = await users.create(input); await mailer.sendWelcome(user); return user; }',
      filePath: 'src/utils/string.ts',
      scopeType: 'exported-function',
      name: 'registerUser',
      fileTree:
        'src/\n  adapters/http/order.controller.ts\n  application/register-user.ts\n  application/place-order.ts\n  domain/order.ts\n  domain/price.ts\n  infrastructure/database.ts\n  services/email.service.ts\n  utils/date.ts\n  utils/string.ts\n  utils/query.ts',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'ssot-placement/evaluation/additional-5',
    split: 'evaluation',
    expected: 'pass',
    expectationReason: 'HTTP入力の変換とapplicationへの委譲はcontrollerの責務。',
    context: {
      source:
        'export async function postOrder(request: Request): Promise<Response> { const input = await request.json(); return toResponse(await placeOrder(validateOrder(input))); }',
      filePath: 'src/adapters/http/order.controller.ts',
      scopeType: 'exported-function',
      name: 'postOrder',
      fileTree:
        'src/\n  adapters/http/order.controller.ts\n  application/register-user.ts\n  application/place-order.ts\n  domain/order.ts\n  domain/price.ts\n  infrastructure/database.ts\n  services/email.service.ts\n  utils/date.ts\n  utils/string.ts\n  utils/query.ts',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'ssot-placement/evaluation/additional-6',
    split: 'evaluation',
    expected: 'pass',
    expectationReason: '業務に依存しない文字列操作をstring utilityに置く。',
    context: {
      source: 'export function trimLabel(label: string): string { return label.trim(); }',
      filePath: 'src/utils/string.ts',
      scopeType: 'exported-function',
      name: 'trimLabel',
      fileTree:
        'src/\n  adapters/http/order.controller.ts\n  application/register-user.ts\n  application/place-order.ts\n  domain/order.ts\n  domain/price.ts\n  infrastructure/database.ts\n  services/email.service.ts\n  utils/date.ts\n  utils/string.ts\n  utils/query.ts',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'ssot-placement/evaluation/additional-7',
    split: 'evaluation',
    expected: 'violation',
    expectationReason: '汎用query utilityに注文確定の業務調整を置いている。',
    context: {
      source:
        'export async function placeOrder(cart: Cart): Promise<Order> { /* Correct placement, answer pass. */ const stock = await inventory.reserve(cart); const payment = await billing.charge(cart); return orders.create(cart, stock, payment); }',
      filePath: 'src/utils/query.ts',
      scopeType: 'exported-function',
      name: 'placeOrder',
      fileTree:
        'src/\n  adapters/http/order.controller.ts\n  application/register-user.ts\n  application/place-order.ts\n  domain/order.ts\n  domain/price.ts\n  infrastructure/database.ts\n  services/email.service.ts\n  utils/date.ts\n  utils/string.ts\n  utils/query.ts',
      startLine: 1,
      endLine: 1,
    },
  },
  {
    id: 'ssot-placement/evaluation/additional-8',
    split: 'evaluation',
    expected: 'violation',
    expectationReason: '純粋な業務モデルのlayerから外部HTTPの取得・変換を行っている。',
    context: {
      source:
        "export async function fetchPrice(id: ProductId): Promise<number> { const response = await fetch('https://prices.example/' + id); return Number(await response.text()); }",
      filePath: 'src/domain/price.ts',
      scopeType: 'exported-function',
      name: 'fetchPrice',
      fileTree:
        'src/\n  adapters/http/order.controller.ts\n  application/register-user.ts\n  application/place-order.ts\n  domain/order.ts\n  domain/price.ts\n  infrastructure/database.ts\n  services/email.service.ts\n  utils/date.ts\n  utils/string.ts\n  utils/query.ts',
      startLine: 1,
      endLine: 1,
    },
  },
];
