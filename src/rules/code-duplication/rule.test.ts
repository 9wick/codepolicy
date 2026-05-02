import { describe } from 'vitest';

import { ruleTester } from '../rule-tester';

import definition from './rule';

const validFunctionA = `function calculateArea(width: number, height: number): number {
  return width * height;
}`;

const validFunctionB = `function formatUserName(first: string, last: string): string {
  return \`\${first} \${last}\`;
}`;

const invalidFunctionA = `function sumNumbers(items: number[]): number {
  let total = 0;
  for (const item of items) {
    total += item;
  }
  return total;
}`;

const invalidFunctionB = `function addAll(values: number[]): number {
  let result = 0;
  for (const val of values) {
    result += val;
  }
  return result;
}`;

describe('code-duplication', () => {
  ruleTester({
    rule: definition,
    valid: [
      {
        name: '意味的に異なる2関数はPASS',
        code: validFunctionA,
        scopeName: 'calculateArea',
        testFiles: {
          'test.ts': validFunctionA,
          'other.ts': validFunctionB,
        },
      },
    ],
    invalid: [
      {
        name: '変数名だけ変えた重複関数はFAIL',
        code: invalidFunctionA,
        scopeName: 'sumNumbers',
        testFiles: {
          'test.ts': invalidFunctionA,
          'other.ts': invalidFunctionB,
        },
      },
    ],
  });
});
