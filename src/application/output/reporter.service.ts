import { injectable } from '@needle-di/core';

import type {
  LintErrorEntry,
  LintOutput,
  LintResult,
  RuleLevel,
  TokenUsage,
} from '../../shared/types';
import { formatErrorCauseChain } from '../../shared/errors';

// verdict='violation' の重大度は rule.level、'borderline' は rule.borderline（resolver が default 'warn' を確定済み）。
// severity='off' は表示対象外にするための finding へのマッピング。
type Finding = {
  result: LintResult;
  severity: RuleLevel;
};

function severityOf(result: LintResult): RuleLevel {
  return result.verdict === 'violation' ? result.rule.level : result.rule.borderline;
}

function toFindings(results: LintResult[]): Finding[] {
  const findings: Finding[] = [];
  for (const result of results) {
    if (result.verdict === 'pass') continue;
    const severity = severityOf(result);
    if (severity === 'off') continue;
    findings.push({ result, severity });
  }
  return findings;
}

type FindingGroup = {
  filePath: string;
  scopeName: string;
  findings: Finding[];
};

function groupFindings(findings: Finding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();

  for (const finding of findings) {
    const key = `${finding.result.filePath}:${finding.result.scopeName}`;
    const existing = groups.get(key);
    if (existing) {
      existing.findings.push(finding);
    } else {
      groups.set(key, {
        filePath: finding.result.filePath,
        scopeName: finding.result.scopeName,
        findings: [finding],
      });
    }
  }

  return [...groups.values()];
}

function formatUsage(usage: TokenUsage, durationMs: number): string {
  const seconds = (durationMs / 1000).toFixed(1);
  return `[${seconds}sec | token in:${usage.inputTokens.toLocaleString()} out:${usage.outputTokens.toLocaleString()}]`;
}

function sumUsage(results: LintResult[]): { usage: TokenUsage; durationMs: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let cacheReadInputTokens = 0;
  let cacheCreationInputTokens = 0;
  let durationMs = 0;
  for (const r of results) {
    inputTokens += r.usage.inputTokens;
    outputTokens += r.usage.outputTokens;
    reasoningTokens += r.usage.reasoningTokens;
    cacheReadInputTokens += r.usage.cacheReadInputTokens;
    cacheCreationInputTokens += r.usage.cacheCreationInputTokens;
    durationMs += r.durationMs;
  }
  return {
    usage: {
      inputTokens,
      outputTokens,
      reasoningTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
    },
    durationMs,
  };
}

function formatCitations(citations: string[]): string {
  if (citations.length === 0) return '';
  const lines = citations.map((c) => `      - ${c}`).join('\n');
  return `\n${lines}`;
}

function formatFinding(finding: Finding): string {
  const { result, severity } = finding;
  const usageSuffix = formatUsage(result.usage, result.durationMs);
  const header = `    [${result.rule.id}] ${result.verdict} (${severity})  ${usageSuffix}`;
  const reasoningLine = `    ${result.reasoning}`;
  return `${header}\n${reasoningLine}${formatCitations(result.citations)}`;
}

function formatGroup(group: FindingGroup): string {
  const header = `  ${group.filePath} > ${group.scopeName}`;
  const details = group.findings.map(formatFinding).join('\n\n');
  return `${header}\n${details}`;
}

function countScopes(results: LintResult[]): number {
  const keys = new Set<string>();
  for (const r of results) {
    keys.add(`${r.filePath}:${r.scopeName}`);
  }
  return keys.size;
}

function countRules(results: LintResult[]): number {
  const ids = new Set<string>();
  for (const r of results) {
    ids.add(r.rule.id);
  }
  return ids.size;
}

function countByVerdict(findings: Finding[]): { violations: number; borderlines: number } {
  let violations = 0;
  let borderlines = 0;
  for (const finding of findings) {
    if (finding.result.verdict === 'violation') violations++;
    if (finding.result.verdict === 'borderline') borderlines++;
  }
  return { violations, borderlines };
}

function formatSummaryHeader(findings: Finding[]): string {
  const { violations, borderlines } = countByVerdict(findings);
  const parts: string[] = [];
  if (violations > 0) parts.push(`${violations} violation(s)`);
  if (borderlines > 0) parts.push(`${borderlines} borderline(s)`);
  return `${parts.join(', ')} found`;
}

function formatErrorEntry(entry: LintErrorEntry): string {
  const lines = formatErrorCauseChain(entry.error);
  return `  ${entry.filePath} > ${entry.scopeName}\n    [${entry.rule.id}] ${lines.join('\n    ')}`;
}

@injectable()
export class Reporter {
  format(output: LintOutput): string {
    const { results, errors } = output;
    const findings = toFindings(results);
    const totals = sumUsage(results);
    const totalSuffix = formatUsage(totals.usage, totals.durationMs);

    const sections: string[] = [];

    if (findings.length === 0 && errors.length === 0) {
      const scopes = countScopes(results);
      const rules = countRules(results);
      return `✓ codepolicy: all checks passed (${scopes} scopes × ${rules} rules) ${totalSuffix}`;
    }

    if (findings.length > 0) {
      const groups = groupFindings(findings);
      const body = groups.map(formatGroup).join('\n\n');
      sections.push(`✗ codepolicy: ${formatSummaryHeader(findings)} ${totalSuffix}\n\n${body}`);
    }

    if (errors.length > 0) {
      const errorBody = errors.map(formatErrorEntry).join('\n\n');
      sections.push(`✗ codepolicy: ${errors.length} error(s) during evaluation\n\n${errorBody}`);
    }

    return sections.join('\n\n');
  }

  getExitCode(output: LintOutput): number {
    const { results, errors } = output;
    if (errors.length > 0) return 1;
    const findings = toFindings(results);
    const hasError = findings.some((finding) => finding.severity === 'error');
    return hasError ? 1 : 0;
  }
}
