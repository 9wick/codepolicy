import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { okAsync } from 'neverthrow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ChangedFile, ResolvedRule } from '../../shared/types';

import { ScopeExtractor } from './scope-extractor.service';

const TEST_DIR = path.join(import.meta.dirname, '__test_fixtures__');

const SAMPLE_CODE_WITH_FUNCTION = `import { something } from 'lib';

const TOP_LEVEL = 42;

function greet(name: string) {
  return \`Hello, \${name}\`;
}

const add = (a: number, b: number) => {
  return a + b;
};
`;

const SAMPLE_CODE_NO_FUNCTION = `import { config } from './config';

export const VERSION = '1.0.0';
export const NAME = 'test';
`;

const SAMPLE_CODE_WITH_TYPES = `type OrderState =
  | { kind: 'pending'; requestedAt: Date }
  | { kind: 'approved'; approvedAt: Date };

interface Shipment {
  status: 'pending' | 'shipped';
  shippedAt?: Date;
}
`;

function makeFunctionRule(id: string): ResolvedRule {
  return {
    id,
    scope: 'function',
    agent: 'test-agent',
    borderline: 'warn',
    level: 'error',
    create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
  };
}

function makeFileRule(id: string): ResolvedRule {
  return {
    id,
    scope: 'file',
    agent: 'test-agent',
    borderline: 'warn',
    level: 'warn',
    create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
  };
}

function makeTypeRule(id: string): ResolvedRule {
  return {
    id,
    scope: 'type',
    agent: 'test-agent',
    borderline: 'warn',
    level: 'error',
    create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
  };
}

function makeInterfaceRule(id: string): ResolvedRule {
  return {
    id,
    scope: 'interface',
    agent: 'test-agent',
    borderline: 'warn',
    level: 'error',
    create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
  };
}

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await writeFile(path.join(TEST_DIR, 'sample.ts'), SAMPLE_CODE_WITH_FUNCTION);
  await writeFile(path.join(TEST_DIR, 'constants.ts'), SAMPLE_CODE_NO_FUNCTION);
  await writeFile(path.join(TEST_DIR, 'types.ts'), SAMPLE_CODE_WITH_TYPES);
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('ScopeExtractor', () => {
  const extractor = new ScopeExtractor();

  describe('function scope', () => {
    it('extracts function when diff line is inside a function', async () => {
      const changedFiles: ChangedFile[] = [
        {
          filePath: path.join(TEST_DIR, 'sample.ts'),
          lineRanges: [{ start: 6, end: 6 }],
        },
      ];
      const rules = [makeFunctionRule('rule-1')];

      const result = await extractor.extract(changedFiles, rules);

      expect(result.isOk()).toBe(true);
      const units = result._unsafeUnwrap();
      expect(units).toHaveLength(1);
      expect(units[0]!.scopeType).toBe('function');
      expect(units[0]!.name).toBe('greet');
    });

    it('falls back to file scope when diff line is outside any function', async () => {
      const changedFiles: ChangedFile[] = [
        {
          filePath: path.join(TEST_DIR, 'sample.ts'),
          lineRanges: [{ start: 3, end: 3 }],
        },
      ];
      const rules = [makeFunctionRule('rule-1')];

      const result = await extractor.extract(changedFiles, rules);

      expect(result.isOk()).toBe(true);
      const units = result._unsafeUnwrap();
      expect(units).toHaveLength(1);
      expect(units[0]!.scopeType).toBe('file');
      expect(units[0]!.name).toBe('sample.ts');
    });

    it('deduplicates when multiple diff lines are in the same function', async () => {
      const changedFiles: ChangedFile[] = [
        {
          filePath: path.join(TEST_DIR, 'sample.ts'),
          lineRanges: [{ start: 5, end: 7 }],
        },
      ];
      const rules = [makeFunctionRule('rule-1')];

      const result = await extractor.extract(changedFiles, rules);

      expect(result.isOk()).toBe(true);
      const units = result._unsafeUnwrap();
      expect(units).toHaveLength(1);
      expect(units[0]!.name).toBe('greet');
    });
  });

  describe('test-case scope', () => {
    it('extracts test-case when diff line is inside an it() callback', async () => {
      const testFilePath = path.join(TEST_DIR, 'sample.test.ts');
      await writeFile(
        testFilePath,
        `describe('math', () => {
  it('adds numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});
`,
      );
      const changedFiles: ChangedFile[] = [
        {
          filePath: testFilePath,
          lineRanges: [{ start: 3, end: 3 }],
        },
      ];
      const rules: ResolvedRule[] = [
        {
          id: 'rule-1',
          scope: 'test-case',
          agent: 'test-agent',
          borderline: 'warn',
          level: 'error',
          create: () => okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
        },
      ];

      const result = await extractor.extract(changedFiles, rules);

      expect(result.isOk()).toBe(true);
      const units = result._unsafeUnwrap();
      expect(units).toHaveLength(1);
      expect(units[0]!.scopeType).toBe('test-case');
      expect(units[0]!.name).toBe('math > adds numbers');
    });
  });

  describe('file scope', () => {
    it('extracts entire file as a scope unit', async () => {
      const changedFiles: ChangedFile[] = [
        {
          filePath: path.join(TEST_DIR, 'constants.ts'),
          lineRanges: [{ start: 3, end: 4 }],
        },
      ];
      const rules = [makeFileRule('rule-1')];

      const result = await extractor.extract(changedFiles, rules);

      expect(result.isOk()).toBe(true);
      const units = result._unsafeUnwrap();
      expect(units).toHaveLength(1);
      expect(units[0]!.scopeType).toBe('file');
      expect(units[0]!.name).toBe('constants.ts');
      expect(units[0]!.startLine).toBe(1);
      expect(units[0]!.code).toBe(SAMPLE_CODE_NO_FUNCTION);
    });
  });

  describe('type-like scopes', () => {
    it('extracts type alias scope when diff line is inside a type alias', async () => {
      const changedFiles: ChangedFile[] = [
        {
          filePath: path.join(TEST_DIR, 'types.ts'),
          lineRanges: [{ start: 2, end: 2 }],
        },
      ];
      const rules = [makeTypeRule('rule-type')];

      const result = await extractor.extract(changedFiles, rules);

      expect(result.isOk()).toBe(true);
      const units = result._unsafeUnwrap();
      expect(units).toHaveLength(1);
      expect(units[0]!.scopeType).toBe('type');
      expect(units[0]!.name).toBe('OrderState');
    });

    it('extracts interface scope when diff line is inside an interface', async () => {
      const changedFiles: ChangedFile[] = [
        {
          filePath: path.join(TEST_DIR, 'types.ts'),
          lineRanges: [{ start: 6, end: 6 }],
        },
      ];
      const rules = [makeInterfaceRule('rule-interface')];

      const result = await extractor.extract(changedFiles, rules);

      expect(result.isOk()).toBe(true);
      const units = result._unsafeUnwrap();
      expect(units).toHaveLength(1);
      expect(units[0]!.scopeType).toBe('interface');
      expect(units[0]!.name).toBe('Shipment');
    });
  });

  describe('multiple files', () => {
    it('extracts scopes from multiple changed files', async () => {
      const changedFiles: ChangedFile[] = [
        {
          filePath: path.join(TEST_DIR, 'sample.ts'),
          lineRanges: [{ start: 6, end: 6 }],
        },
        {
          filePath: path.join(TEST_DIR, 'constants.ts'),
          lineRanges: [{ start: 3, end: 3 }],
        },
      ];
      const rules = [makeFunctionRule('rule-1')];

      const result = await extractor.extract(changedFiles, rules);

      expect(result.isOk()).toBe(true);
      const units = result._unsafeUnwrap();
      expect(units).toHaveLength(2);

      const names = units.map((u) => u.name);
      expect(names).toContain('greet');
      expect(names).toContain('constants.ts');
    });
  });

  describe('mixed scopes', () => {
    it('extracts both function and file scopes when rules require both', async () => {
      const changedFiles: ChangedFile[] = [
        {
          filePath: path.join(TEST_DIR, 'sample.ts'),
          lineRanges: [{ start: 6, end: 6 }],
        },
      ];
      const rules = [makeFunctionRule('func-rule'), makeFileRule('file-rule')];

      const result = await extractor.extract(changedFiles, rules);

      expect(result.isOk()).toBe(true);
      const units = result._unsafeUnwrap();
      const scopeTypes = units.map((u) => u.scopeType);
      expect(scopeTypes).toContain('function');
      expect(scopeTypes).toContain('file');
    });
  });
});
