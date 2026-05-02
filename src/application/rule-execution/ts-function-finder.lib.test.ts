import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { describe, expect, it } from 'vitest';

import { findEnclosingNamedFunction } from './ts-function-finder.lib';

function parseCode(code: string): { tree: Parser.Tree; code: string } {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript as unknown as Parser.Language);
  return { tree: parser.parse(code), code };
}

const FILE_PATH = 'test.ts';

describe('findEnclosingNamedFunction', () => {
  it('finds function_declaration by name', () => {
    const source = `function foo() {
  const x = 1;
  return x;
}`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 2);

    expect(result).toEqual({
      filePath: FILE_PATH,
      scopeType: 'function',
      name: 'foo',
      code: source,
      signature: 'function foo()',
      isExported: false,
      startLine: 1,
      endLine: 4,
    });
  });

  it('finds method_definition by name', () => {
    const source = `class MyClass {
  bar() {
    return 2;
  }
}`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 3);

    expect(result).toEqual({
      filePath: FILE_PATH,
      scopeType: 'function',
      name: 'bar',
      code: expect.stringContaining('bar()'),
      signature: expect.any(String),
      isExported: false,
      startLine: 2,
      endLine: 4,
    });
  });

  it('finds arrow_function assigned to const', () => {
    const source = `const baz = () => {
  return 3;
};`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 2);

    expect(result).toEqual({
      filePath: FILE_PATH,
      scopeType: 'function',
      name: 'baz',
      code: expect.stringContaining('=>'),
      signature: expect.any(String),
      isExported: false,
      startLine: 1,
      endLine: 3,
    });
  });

  it('finds function_expression assigned to const', () => {
    const source = `const qux = function() {
  return 4;
};`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 2);

    expect(result).toEqual({
      filePath: FILE_PATH,
      scopeType: 'function',
      name: 'qux',
      code: expect.stringContaining('function()'),
      signature: expect.any(String),
      isExported: false,
      startLine: 1,
      endLine: 3,
    });
  });

  it('finds innermost function for nested functions', () => {
    const source = `function outer() {
  const inner = () => {
    return 5;
  };
}`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 3);

    expect(result).toEqual({
      filePath: FILE_PATH,
      scopeType: 'function',
      name: 'inner',
      code: expect.stringContaining('=>'),
      signature: expect.any(String),
      isExported: false,
      startLine: 2,
      endLine: 4,
    });
  });

  it('returns null for import statements', () => {
    const source = `import { foo } from 'bar';

function myFunc() {
  return 1;
}`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 1);

    expect(result).toBeNull();
  });

  it('returns null for top-level variable declarations', () => {
    const source = `const topLevel = 42;

function myFunc() {
  return 1;
}`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 1);

    expect(result).toBeNull();
  });

  it('returns null for anonymous arrow function not assigned to variable', () => {
    const source = `[1, 2, 3].map((x) => {
  return x * 2;
});`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 2);

    expect(result).toBeNull();
  });

  it('finds arrow_function inside it() call with test description', () => {
    const source = `it('should return true', () => {
  expect(isValid('test')).toBe(true);
});`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 2);

    expect(result).toEqual({
      filePath: FILE_PATH,
      scopeType: 'test-case',
      name: 'should return true',
      code: expect.stringContaining('=>'),
      signature: expect.any(String),
      isExported: false,
      startLine: 1,
      endLine: 3,
    });
  });

  it('finds arrow_function inside describe/it chain', () => {
    const source = `describe('UserService', () => {
  it('should validate email', () => {
    expect(validate('test@mail.com')).toBe(true);
  });
});`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 3);

    expect(result).toEqual({
      filePath: FILE_PATH,
      scopeType: 'test-case',
      name: 'UserService > should validate email',
      code: expect.stringContaining('=>'),
      signature: expect.any(String),
      isExported: false,
      startLine: 2,
      endLine: 4,
    });
  });

  it('finds arrow_function inside test() call', () => {
    const source = `test('adds numbers', () => {
  expect(add(1, 2)).toBe(3);
});`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 2);

    expect(result).toEqual({
      filePath: FILE_PATH,
      scopeType: 'test-case',
      name: 'adds numbers',
      code: expect.stringContaining('=>'),
      signature: expect.any(String),
      isExported: false,
      startLine: 1,
      endLine: 3,
    });
  });

  it('finds arrow_function inside nested describe chain', () => {
    const source = `describe('UserService', () => {
  describe('validateEmail', () => {
    it('should return error for invalid email', () => {
      expect(validate('bad')).toBe(false);
    });
  });
});`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 4);

    expect(result).toEqual({
      filePath: FILE_PATH,
      scopeType: 'test-case',
      name: 'UserService > validateEmail > should return error for invalid email',
      code: expect.stringContaining('=>'),
      signature: expect.any(String),
      isExported: false,
      startLine: 3,
      endLine: 5,
    });
  });

  it('detects exported function_declaration', () => {
    const source = `export function greet(name: string): string {
  return 'hello ' + name;
}`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 2);

    expect(result).toMatchObject({
      name: 'greet',
      isExported: true,
    });
  });

  it('detects exported arrow function', () => {
    const source = `export const add = (a: number, b: number) => {
  return a + b;
};`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 2);

    expect(result).toMatchObject({
      name: 'add',
      isExported: true,
    });
  });

  it('detects export default function', () => {
    const source = `export default function main() {
  console.log('hello');
}`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 2);

    expect(result).toMatchObject({
      name: 'main',
      isExported: true,
    });
  });

  it('detects method in exported class as exported', () => {
    const source = `export class UserService {
  getUser(id: string) {
    return { id };
  }
}`;
    const { tree } = parseCode(source);

    const result = findEnclosingNamedFunction(tree, source, FILE_PATH, 3);

    expect(result).toMatchObject({
      name: 'getUser',
      isExported: true,
    });
  });
});
