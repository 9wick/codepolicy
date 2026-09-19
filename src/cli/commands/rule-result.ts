import type { RuleVerdict } from '../../shared/types';

export function formatRuleResult(
  ruleId: string,
  verdict: RuleVerdict,
  kind: 'text' | 'decision',
): string {
  const lines = [
    `Rule: ${ruleId}`,
    `Verdict: ${verdict.verdict}`,
    `Reasoning: ${verdict.reasoning}`,
  ];
  if (kind === 'text') {
    lines.push(
      `Citations: ${verdict.citations.length > 0 ? verdict.citations.join(', ') : '(none)'}`,
    );
  }
  return lines.join('\n');
}
