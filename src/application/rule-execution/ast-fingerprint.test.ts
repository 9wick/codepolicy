import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { describe, expect, it } from 'vitest';

import type { ScopeUnit } from '../../shared/types';

import {
  type AstFingerprint,
  type ScopeFingerprint,
  computeFingerprint,
  cosineSimilarity,
  findSimilarScopes,
} from './ast-fingerprint';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript as unknown as Parser.Language);

function parse(code: string): Parser.Tree {
  return parser.parse(code);
}

function makeScope(overrides: Partial<ScopeUnit> = {}): ScopeUnit {
  return {
    filePath: 'test.ts',
    scopeType: 'function',
    name: 'test',
    code: '',
    startLine: 1,
    endLine: 5,
    ...overrides,
  };
}

describe('computeFingerprint', () => {
  it('counts node types for a simple function', () => {
    const tree = parse('function add(a: number, b: number) { return a + b; }');
    const fingerprint = computeFingerprint(tree.rootNode);

    expect(fingerprint.get('function_declaration')).toBe(1);
    expect(fingerprint.get('return_statement')).toBe(1);
    expect(fingerprint.get('binary_expression')).toBe(1);
    expect(fingerprint.get('identifier')).toBeGreaterThan(0);
  });

  it('accumulates counts for nested structures', () => {
    const tree = parse(`function outer() {
  const inner1 = () => { return 1; };
  const inner2 = () => { return 2; };
}`);
    const fingerprint = computeFingerprint(tree.rootNode);

    expect(fingerprint.get('function_declaration')).toBe(1);
    expect(fingerprint.get('arrow_function')).toBe(2);
    expect(fingerprint.get('return_statement')).toBe(2);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical maps', () => {
    const a: AstFingerprint = new Map([
      ['identifier', 3],
      ['return_statement', 1],
    ]);
    const b: AstFingerprint = new Map([
      ['identifier', 3],
      ['return_statement', 1],
    ]);

    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });

  it('returns 0 for completely different keys', () => {
    const a: AstFingerprint = new Map([['identifier', 3]]);
    const b: AstFingerprint = new Map([['return_statement', 2]]);

    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for empty maps', () => {
    expect(cosineSimilarity(new Map(), new Map())).toBe(0);
    expect(cosineSimilarity(new Map([['a', 1]]), new Map())).toBe(0);
    expect(cosineSimilarity(new Map(), new Map([['a', 1]]))).toBe(0);
  });

  it('returns a value between 0 and 1 for partial overlap', () => {
    const a: AstFingerprint = new Map([
      ['identifier', 3],
      ['return_statement', 1],
      ['if_statement', 2],
    ]);
    const b: AstFingerprint = new Map([
      ['identifier', 3],
      ['return_statement', 1],
      ['for_statement', 4],
    ]);

    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });
});

describe('findSimilarScopes', () => {
  const targetFingerprint: AstFingerprint = new Map([
    ['identifier', 5],
    ['return_statement', 2],
    ['binary_expression', 1],
  ]);

  const similarFingerprint: AstFingerprint = new Map([
    ['identifier', 5],
    ['return_statement', 2],
    ['binary_expression', 1],
  ]);

  const differentFingerprint: AstFingerprint = new Map([
    ['for_statement', 10],
    ['while_statement', 5],
  ]);

  it('returns candidates above threshold', () => {
    const target: ScopeFingerprint = {
      scope: makeScope({ filePath: 'a.ts', startLine: 1 }),
      fingerprint: targetFingerprint,
    };
    const candidates: ScopeFingerprint[] = [
      {
        scope: makeScope({ filePath: 'b.ts', startLine: 1 }),
        fingerprint: similarFingerprint,
      },
      {
        scope: makeScope({ filePath: 'c.ts', startLine: 1 }),
        fingerprint: differentFingerprint,
      },
    ];

    const results = findSimilarScopes(target, candidates, 0.9);

    expect(results).toHaveLength(1);
    expect(results[0]!.scope.filePath).toBe('b.ts');
    expect(results[0]!.similarity).toBeCloseTo(1);
  });

  it('excludes self by filePath and startLine', () => {
    const target: ScopeFingerprint = {
      scope: makeScope({ filePath: 'a.ts', startLine: 10 }),
      fingerprint: targetFingerprint,
    };
    const candidates: ScopeFingerprint[] = [
      {
        scope: makeScope({ filePath: 'a.ts', startLine: 10 }),
        fingerprint: similarFingerprint,
      },
    ];

    const results = findSimilarScopes(target, candidates, 0.5);

    expect(results).toHaveLength(0);
  });

  it('returns sorted by similarity descending', () => {
    const target: ScopeFingerprint = {
      scope: makeScope({ filePath: 'a.ts', startLine: 1 }),
      fingerprint: targetFingerprint,
    };

    const partialFingerprint: AstFingerprint = new Map([
      ['identifier', 5],
      ['return_statement', 1],
      ['for_statement', 3],
    ]);

    const candidates: ScopeFingerprint[] = [
      {
        scope: makeScope({ filePath: 'b.ts', startLine: 1 }),
        fingerprint: partialFingerprint,
      },
      {
        scope: makeScope({ filePath: 'c.ts', startLine: 1 }),
        fingerprint: similarFingerprint,
      },
    ];

    const results = findSimilarScopes(target, candidates, 0.5);

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0]!.similarity).toBeGreaterThanOrEqual(results[1]!.similarity);
    expect(results[0]!.scope.filePath).toBe('c.ts');
  });

  it('excludes nested functions in the same file (parent contains child)', () => {
    const parent: ScopeFingerprint = {
      scope: makeScope({ filePath: 'a.ts', startLine: 1, endLine: 20 }),
      fingerprint: targetFingerprint,
    };
    const child: ScopeFingerprint = {
      scope: makeScope({ filePath: 'a.ts', startLine: 5, endLine: 15 }),
      fingerprint: similarFingerprint,
    };

    expect(findSimilarScopes(parent, [child], 0.5)).toHaveLength(0);
    expect(findSimilarScopes(child, [parent], 0.5)).toHaveLength(0);
  });

  it('returns empty array when no matches above threshold', () => {
    const target: ScopeFingerprint = {
      scope: makeScope({ filePath: 'a.ts', startLine: 1 }),
      fingerprint: targetFingerprint,
    };
    const candidates: ScopeFingerprint[] = [
      {
        scope: makeScope({ filePath: 'b.ts', startLine: 1 }),
        fingerprint: differentFingerprint,
      },
    ];

    const results = findSimilarScopes(target, candidates, 0.9);

    expect(results).toHaveLength(0);
  });
});
