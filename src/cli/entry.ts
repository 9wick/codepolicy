#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { ResultAsync } from 'neverthrow';

import { LintPipeline } from '../application/rule-execution/lint-pipeline.service';
import { Reporter } from '../application/output/reporter.service';
import { parseModelReasoningEffort } from '../infrastructure/llm/model-reasoning-effort';
import { destroyAppContainer, getAppContainer } from '../shared/container';
import { formatErrorCauseChain } from '../shared/errors';
import { LogLevelToken } from '../shared/logger';

const main = defineCommand({
  meta: {
    name: 'codepolicy',
    version: '0.0.1',
    description: 'LLM-powered semantic lint tool for CI pipelines',
  },
  args: {
    config: {
      type: 'string',
      alias: 'c',
      description: 'Path to config file',
    },
    filter: {
      type: 'string',
      description: 'Filter mode: diff or all',
    },
    rule: {
      type: 'string',
      description: 'Run specific rule only',
    },
    agent: {
      type: 'string',
      description: 'Override model for all rules',
    },
    concurrency: {
      type: 'string',
      description: 'Number of parallel LLM evaluations (default: 10)',
    },
    base: {
      type: 'string',
      description: 'Git ref to diff against (e.g. origin/main). Only used with filter=diff.',
    },
    'reasoning-effort': {
      type: 'string',
      description: 'Reasoning effort for Codex models (minimal|low|medium|high|xhigh)',
    },
    verbose: {
      type: 'boolean',
      description: 'Show verbose output including SDK message logs',
      default: false,
    },
    'no-cache': {
      type: 'boolean',
      description: 'Disable evaluation result cache (do not look up or save cache entries)',
      default: false,
    },
  },
  subCommands: {
    rule: () => import('./commands/rule.command').then((m) => m.default),
    validate: () => import('./commands/validate.command').then((m) => m.default),
    model: () => import('./commands/model.command').then((m) => m.default),
  },
  async run({ rawArgs, args }) {
    const subCommandNames = ['rule', 'validate', 'model'];
    if (rawArgs.some((arg) => subCommandNames.includes(arg))) return;
    const container = getAppContainer();
    container.get(LogLevelToken).level = args.verbose ? 'debug' : 'info';
    const pipeline = container.get(LintPipeline);
    const reporter = container.get(Reporter);
    const reasoningEffortResult = parseModelReasoningEffort(args['reasoning-effort']);
    if (reasoningEffortResult.isErr()) {
      console.error(`Error [INVALID_ARGUMENT]: ${reasoningEffortResult.error.message}`);
      process.exitCode = 1;
      return;
    }

    const result = await pipeline.run({
      configPath: args.config,
      ruleId: args.rule,
      agent: args.agent,
      concurrency: args.concurrency ? Number(args.concurrency) : undefined,
      reasoningEffort: reasoningEffortResult.value,
      base: args.base,
      noCache: args['no-cache'],
    });

    result.match(
      (lintOutput) => {
        const output = reporter.format(lintOutput);
        console.log(output);
        process.exitCode = reporter.getExitCode(lintOutput);
      },
      (error) => {
        for (const line of formatErrorCauseChain(error)) console.error(line);
        process.exitCode = 1;
      },
    );
  },
});

void ResultAsync.fromPromise(runMain(main), (e: unknown) =>
  e instanceof Error ? e : new Error(String(e)),
)
  .mapErr((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .match(
    () => destroyAppContainer(),
    () => destroyAppContainer(),
  );
