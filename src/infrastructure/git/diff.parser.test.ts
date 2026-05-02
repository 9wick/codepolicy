import { describe, expect, it } from 'vitest';

import { DiffParser } from './diff.parser';

describe('parseDiffOutput', () => {
  const parser = new DiffParser();

  it('should return empty array for empty diff', () => {
    const result = parser.parse('');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('should return empty array for whitespace-only diff', () => {
    const result = parser.parse('   \n  \n  ');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('should parse a new file addition', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'new file mode 100644',
      'index 0000000..abc1234',
      '--- /dev/null',
      '+++ b/src/foo.ts',
      '@@ -0,0 +1,3 @@',
      '+export const foo = 1;',
      '+export const bar = 2;',
      '+export const baz = 3;',
    ].join('\n');

    const result = parser.parse(diff);
    expect(result.isOk()).toBe(true);
    const files = result._unsafeUnwrap();
    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({
      filePath: 'src/foo.ts',
      lineRanges: [{ start: 1, end: 3 }],
    });
  });

  it('should parse an existing file change with multiple hunks', () => {
    const diff = [
      'diff --git a/src/utils.ts b/src/utils.ts',
      'index abc1234..def5678 100644',
      '--- a/src/utils.ts',
      '+++ b/src/utils.ts',
      '@@ -5,6 +5,7 @@ import { something } from "./deps";',
      ' const a = 1;',
      ' const b = 2;',
      '+const c = 3;',
      ' const d = 4;',
      ' const e = 5;',
      ' const f = 6;',
      '@@ -20,4 +21,6 @@ function helper() {',
      '   return true;',
      ' }',
      '+',
      '+export function newHelper() {}',
    ].join('\n');

    const result = parser.parse(diff);
    expect(result.isOk()).toBe(true);
    const files = result._unsafeUnwrap();
    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({
      filePath: 'src/utils.ts',
      lineRanges: [
        { start: 7, end: 7 },
        { start: 23, end: 24 },
      ],
    });
  });

  it('should skip deleted files', () => {
    const diff = [
      'diff --git a/src/old.ts b/src/old.ts',
      'deleted file mode 100644',
      'index abc1234..0000000',
      '--- a/src/old.ts',
      '+++ /dev/null',
      '@@ -1,3 +0,0 @@',
      '-export const old = 1;',
      '-export const stuff = 2;',
      '-export const here = 3;',
    ].join('\n');

    const result = parser.parse(diff);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('should skip binary files', () => {
    const diff = [
      'diff --git a/src/image.ts b/src/image.ts',
      'index abc1234..def5678 100644',
      'Binary files a/src/image.ts and b/src/image.ts differ',
    ].join('\n');

    const result = parser.parse(diff);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('should skip non-TS files (.js)', () => {
    const diff = [
      'diff --git a/src/helper.js b/src/helper.js',
      'index abc1234..def5678 100644',
      '--- a/src/helper.js',
      '+++ b/src/helper.js',
      '@@ -1,3 +1,4 @@',
      ' const a = 1;',
      '+const b = 2;',
      ' const c = 3;',
      ' const d = 4;',
    ].join('\n');

    const result = parser.parse(diff);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('should skip non-TS files (.md)', () => {
    const diff = [
      'diff --git a/README.md b/README.md',
      'index abc1234..def5678 100644',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1,2 +1,3 @@',
      ' # Title',
      '+New line',
      ' End',
    ].join('\n');

    const result = parser.parse(diff);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('should include .tsx files', () => {
    const diff = [
      'diff --git a/src/Component.tsx b/src/Component.tsx',
      'index abc1234..def5678 100644',
      '--- a/src/Component.tsx',
      '+++ b/src/Component.tsx',
      '@@ -1,3 +1,4 @@',
      ' import React from "react";',
      '+const x = 1;',
      ' export default function Component() {}',
      ' ',
    ].join('\n');

    const result = parser.parse(diff);
    expect(result.isOk()).toBe(true);
    const files = result._unsafeUnwrap();
    expect(files).toHaveLength(1);
    expect(files[0]!.filePath).toBe('src/Component.tsx');
    expect(files[0]!.lineRanges).toEqual([{ start: 2, end: 2 }]);
  });

  it('should parse multiple files and filter correctly', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index abc1234..def5678 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,3 @@',
      ' const a = 1;',
      '+const b = 2;',
      ' const c = 3;',
      'diff --git a/src/b.js b/src/b.js',
      'index abc1234..def5678 100644',
      '--- a/src/b.js',
      '+++ b/src/b.js',
      '@@ -1,2 +1,3 @@',
      ' const x = 1;',
      '+const y = 2;',
      ' const z = 3;',
      'diff --git a/src/c.tsx b/src/c.tsx',
      'index abc1234..def5678 100644',
      '--- a/src/c.tsx',
      '+++ b/src/c.tsx',
      '@@ -10,3 +10,5 @@',
      ' import { D } from "./d";',
      '+const m = 1;',
      '+const n = 2;',
      ' export default function C() {}',
    ].join('\n');

    const result = parser.parse(diff);
    expect(result.isOk()).toBe(true);
    const files = result._unsafeUnwrap();
    expect(files).toHaveLength(2);
    expect(files[0]!.filePath).toBe('src/a.ts');
    expect(files[1]!.filePath).toBe('src/c.tsx');
  });

  it('should handle hunks with only deletions (no added lines)', () => {
    const diff = [
      'diff --git a/src/clean.ts b/src/clean.ts',
      'index abc1234..def5678 100644',
      '--- a/src/clean.ts',
      '+++ b/src/clean.ts',
      '@@ -1,5 +1,3 @@',
      ' const a = 1;',
      '-const b = 2;',
      '-const c = 3;',
      ' const d = 4;',
      ' const e = 5;',
    ].join('\n');

    const result = parser.parse(diff);
    expect(result.isOk()).toBe(true);
    // No added lines means no lineRanges, so the file should be excluded
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('should correctly compute line ranges with interleaved additions and deletions', () => {
    const diff = [
      'diff --git a/src/mixed.ts b/src/mixed.ts',
      'index abc1234..def5678 100644',
      '--- a/src/mixed.ts',
      '+++ b/src/mixed.ts',
      '@@ -1,6 +1,6 @@',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = 22;',
      ' const c = 3;',
      '-const d = 4;',
      '+const d = 44;',
      ' const e = 5;',
    ].join('\n');

    const result = parser.parse(diff);
    expect(result.isOk()).toBe(true);
    const files = result._unsafeUnwrap();
    expect(files).toHaveLength(1);
    expect(files[0]!.lineRanges).toEqual([
      { start: 2, end: 2 },
      { start: 4, end: 4 },
    ]);
  });

  it('should handle hunk with count omitted (single line)', () => {
    const diff = [
      'diff --git a/src/single.ts b/src/single.ts',
      'index abc1234..def5678 100644',
      '--- a/src/single.ts',
      '+++ b/src/single.ts',
      '@@ -0,0 +1 @@',
      '+export const only = true;',
    ].join('\n');

    const result = parser.parse(diff);
    expect(result.isOk()).toBe(true);
    const files = result._unsafeUnwrap();
    expect(files).toHaveLength(1);
    expect(files[0]!.lineRanges).toEqual([{ start: 1, end: 1 }]);
  });
});
