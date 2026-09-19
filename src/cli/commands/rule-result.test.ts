import { describe, expect, it } from 'vitest';

import { formatRuleResult } from './rule-result';

describe('rule run output', () => {
  it.each(['pass', 'borderline', 'violation'])(
    'omits the unsupported citation field for Jev %s',
    (verdict) => {
      const label =
        verdict === 'pass' ? 'pass' : verdict === 'violation' ? 'violation' : 'borderline';
      expect(
        formatRuleResult(
          'jev-rule',
          { verdict: label, reasoning: 'Jev判定: 指摘', citations: [] },
          'decision',
        ),
      ).toBe(`Rule: jev-rule\nVerdict: ${verdict}\nReasoning: Jev判定: 指摘`);
    },
  );
  it('preserves existing text-rule citations including the empty placeholder', () => {
    expect(
      formatRuleResult('old-rule', { verdict: 'pass', reasoning: 'ok', citations: [] }, 'text'),
    ).toBe('Rule: old-rule\nVerdict: pass\nReasoning: ok\nCitations: (none)');
  });
});
