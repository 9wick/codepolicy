import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { describe, expect, it } from 'vitest';

import { findEnclosingNamedTypeScope } from './ts-type-finder.lib';

function parseCode(code: string): Parser.Tree {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript as unknown as Parser.Language);
  return parser.parse(code);
}

const FILE_PATH = 'test.ts';

describe('findEnclosingNamedTypeScope', () => {
  it('finds type alias declarations', () => {
    const source = `type OrderState =
  | { kind: 'pending'; requestedAt: Date }
  | { kind: 'approved'; approvedAt: Date };`;

    const result = findEnclosingNamedTypeScope(parseCode(source), FILE_PATH, 2);

    expect(result).toEqual({
      filePath: FILE_PATH,
      scopeType: 'type',
      name: 'OrderState',
      code: source,
      startLine: 1,
      endLine: 3,
    });
  });

  it('finds interface declarations', () => {
    const source = `interface UserProfile {
  id: UserId;
  email: EmailAddress;
}`;

    const result = findEnclosingNamedTypeScope(parseCode(source), FILE_PATH, 2);

    expect(result).toEqual({
      filePath: FILE_PATH,
      scopeType: 'interface',
      name: 'UserProfile',
      code: source,
      startLine: 1,
      endLine: 4,
    });
  });

  it('returns null outside type-like declarations', () => {
    const source = `const version = '1.0.0';

function run() {
  return version;
}`;

    const result = findEnclosingNamedTypeScope(parseCode(source), FILE_PATH, 3);

    expect(result).toBeNull();
  });
});
