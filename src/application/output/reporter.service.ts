import { injectable } from '@needle-di/core';

import type { LintErrorEntry, LintOutput, LintResult, TokenUsage } from '../../shared/types';
import { formatErrorCauseChain } from '../../shared/errors';

type ViolationGroup = {
  filePath: string;
  scopeName: string;
  violations: LintResult[];
};

function groupViolations(violations: LintResult[]): ViolationGroup[] {
  const groups = new Map<string, ViolationGroup>();

  for (const v of violations) {
    const key = `${v.filePath}:${v.scopeName}`;
    const existing = groups.get(key);
    if (existing) {
      existing.violations.push(v);
    } else {
      groups.set(key, {
        filePath: v.filePath,
        scopeName: v.scopeName,
        violations: [v],
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

function formatViolation(v: LintResult): string {
  const levelLabel = v.rule.level;
  const usageSuffix = formatUsage(v.usage, v.durationMs);
  return `    [${v.rule.id}] score: ${v.score} (threshold: ${v.rule.threshold}) ${levelLabel}  ${usageSuffix}\n    ${v.reason}`;
}

function formatGroup(group: ViolationGroup): string {
  const header = `  ${group.filePath} > ${group.scopeName}`;
  const details = group.violations.map(formatViolation).join('\n\n');
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

function formatErrorEntry(entry: LintErrorEntry): string {
  const lines = formatErrorCauseChain(entry.error);
  return `  ${entry.filePath} > ${entry.scopeName}\n    [${entry.rule.id}] ${lines.join('\n    ')}`;
}

@injectable()
export class Reporter {
  format(output: LintOutput): string {
    const { results, errors } = output;
    const violations = results.filter((r) => !r.passed);
    const totals = sumUsage(results);
    const totalSuffix = formatUsage(totals.usage, totals.durationMs);

    const sections: string[] = [];

    if (violations.length === 0 && errors.length === 0) {
      const scopes = countScopes(results);
      const rules = countRules(results);
      return `\u2713 codepolicy: all checks passed (${scopes} scopes \u00d7 ${rules} rules) ${totalSuffix}`;
    }

    if (violations.length > 0) {
      const groups = groupViolations(violations);
      const body = groups.map(formatGroup).join('\n\n');
      sections.push(
        `\u2717 codepolicy: ${violations.length} violations found ${totalSuffix}\n\n${body}`,
      );
    }

    if (errors.length > 0) {
      const errorBody = errors.map(formatErrorEntry).join('\n\n');
      sections.push(
        `\u2717 codepolicy: ${errors.length} error(s) during evaluation\n\n${errorBody}`,
      );
    }

    return sections.join('\n\n');
  }

  getExitCode(output: LintOutput): number {
    const { results, errors } = output;
    if (errors.length > 0) return 1;
    const hasError = results.some((r) => !r.passed && r.rule.level === 'error');
    return hasError ? 1 : 0;
  }
}
