import { describe, expect, it } from 'vitest';

import { pocSuites } from './jev-fixtures';

describe('fixed Jev comparison fixtures', () => {
  it('preserves the five corpora, including restored no-fallback cases, balanced in each split', () => {
    expect(pocSuites).toHaveLength(5);
    const cases = pocSuites.flatMap((suite) => suite.cases);
    expect(cases).toHaveLength(52);
    expect(new Set(cases.map((item) => item.id)).size).toBe(52);
    for (const suite of pocSuites) {
      expect(suite.decision.id).toBe(`jev-${suite.baseline.id}`);
      for (const [split, count] of [
        ['development', suite.baseline.id === 'no-implicit-fallback' ? 4 : 3],
        ['evaluation', 2],
      ] satisfies ['development' | 'evaluation', number][]) {
        for (const expected of ['pass', 'violation']) {
          expect(
            suite.cases.filter((item) => item.split === split && item.expected === expected),
          ).toHaveLength(count);
        }
      }
      for (const item of suite.cases) {
        expect(item.expectationReason.trim().length).toBeGreaterThan(0);
        expect(item.context.source.trim().length).toBeGreaterThan(0);
        if (suite.baseline.id === 'ssot-placement') expect(item.context.fileTree).toContain('src/');
      }
    }
  });
});
