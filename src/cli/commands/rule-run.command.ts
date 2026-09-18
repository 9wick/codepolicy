import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { defineCommand } from 'citty';
import { ResultAsync } from 'neverthrow';

import { ConfigLoader } from '../../application/config/config-loader.service';
import { WorkingDir } from '../../application/config/config-loader.service';
import { resolveConfigDir } from '../../application/config/config-path';
import { createLlmHelper } from '../../application/rule-execution/create-llm-helper';
import { toDisplayVerdict } from '../../application/rule-execution/decision-judge';
import {
  validateRuleModel,
  validateDecisionOptions,
} from '../../application/rule-execution/execution-compatibility';
import { runDecisionFile } from '../../application/rule-execution/run-decision';
import { parseModelReasoningEffort } from '../../infrastructure/llm/model-reasoning-effort';
import { ExternalRuleLoader } from '../../rules/external-rule-loader.service';
import { loadRuleModules } from '../../rules/load-rule-modules';
import { extractOptions } from '../../rules/rule-config-utils';
import type { ScopeContext } from '../../rules/rule-types';
import type { RegisteredRule, DecisionRuleModule } from '../../rules/decision-rule-types';
import { getAppContainer } from '../../shared/container';
import type { CodepolicyError } from '../../shared/errors';
import { formatErrorCauseChain, codepolicyError } from '../../shared/errors';
import { LogContextStore, LogLevelToken } from '../../shared/logger';
import type { ModelReasoningEffort, RuleConfig, RuleLevel, RuleVerdict } from '../../shared/types';

import { formatRuleResult } from './rule-result';

function extractLevel(ruleConfig: RuleConfig): RuleLevel {
  return typeof ruleConfig === 'string' ? ruleConfig : ruleConfig.level;
}

async function unwrap<T>(result: ResultAsync<T, CodepolicyError>): Promise<T | null> {
  return (await result).match(
    (val) => val,
    (e) => {
      console.error(`Error [${e.code}]: ${e.message}`);
      process.exitCode = 1;
      return null;
    },
  );
}

function readSourceFile(filePath: string): ResultAsync<string, CodepolicyError> {
  return ResultAsync.fromPromise(readFile(filePath, 'utf-8'), () =>
    codepolicyError('FILE_READ_ERROR', `Failed to read file: ${filePath}`),
  );
}

function printLlmError(error: Error): void {
  const chain = formatErrorCauseChain(codepolicyError('LLM_API_ERROR', error.message, error.cause));
  for (const line of chain) console.error(line);
}

function printError(code: string, message: string): void {
  console.error(`Error [${code}]: ${message}`);
}

function pickScope(
  scope: RegisteredRule['definition']['meta']['scope'],
): ScopeContext['scopeType'] {
  if (Array.isArray(scope)) {
    const first = scope[0];
    if (!first) {
      return 'function';
    }
    return first;
  }
  return scope;
}

async function loadRuleModuleForRun(
  configLoader: ConfigLoader,
  externalRuleLoader: ExternalRuleLoader,
  workingDir: string,
  configPath: string | undefined,
  ruleId: string,
): Promise<{ ruleModule: RegisteredRule; ruleConfig: RuleConfig; configAgent: string } | null> {
  const config = await unwrap(configLoader.load(configPath));
  if (!config) return null;
  const ruleModules = await unwrap(
    loadRuleModules(config, externalRuleLoader, resolveConfigDir(workingDir, configPath)),
  );
  if (!ruleModules) return null;

  const ruleModule = ruleModules.find((rule) => rule.id === ruleId);
  if (!ruleModule) {
    printError('RULE_NOT_FOUND', `Rule "${ruleId}" not found.`);
    process.exitCode = 1;
    return null;
  }

  const ruleConfig = config.rules[ruleId];
  if (!ruleConfig) {
    printError('RULE_NOT_FOUND', `Rule "${ruleId}" is not configured.`);
    process.exitCode = 1;
    return null;
  }

  return { ruleModule, ruleConfig, configAgent: config.agent };
}

function buildScopeContext(
  sourceCode: string,
  filePath: string,
  ruleModule: RegisteredRule,
): ScopeContext {
  return {
    source: sourceCode,
    filePath,
    scopeType: pickScope(ruleModule.definition.meta.scope),
    name: path.basename(filePath),
    startLine: 1,
    endLine: sourceCode.split('\n').length,
  };
}

function printResult(ruleId: string, verdict: RuleVerdict): void {
  console.log(formatRuleResult(ruleId, verdict, 'text'));
}

type RunRuleArgs = {
  ruleModule: RegisteredRule;
  ruleConfig: RuleConfig;
  filePath: string;
  agentOverride: string | undefined;
  configAgent: string;
  reasoningEffort: ModelReasoningEffort | undefined;
  workingDir: string;
  logContextStore: LogContextStore;
};

async function evaluateRule(a: RunRuleArgs): Promise<void> {
  const validation = validateRuleModel(
    a.ruleModule.id,
    a.ruleModule.kind ?? 'text',
    a.agentOverride ?? a.configAgent,
    a.reasoningEffort,
  ).andThen(() =>
    validateDecisionOptions(
      a.ruleModule.id,
      a.ruleModule.kind ?? 'text',
      extractOptions(a.ruleConfig),
    ),
  );
  if (validation.isErr()) {
    printError(validation.error.code, validation.error.message);
    process.exitCode = 1;
    return;
  }
  const sourceCode = await unwrap(readSourceFile(a.filePath));
  if (sourceCode === null) return;

  const scopeCtx = buildScopeContext(sourceCode, a.filePath, a.ruleModule);
  if (a.ruleModule.kind === 'decision') {
    await evaluateDecisionFile(a, a.ruleModule, scopeCtx);
    return;
  }
  await evaluateTextFile(a, a.ruleModule, scopeCtx);
}

async function evaluateTextFile(
  a: RunRuleArgs,
  ruleModule: Exclude<RegisteredRule, DecisionRuleModule>,
  scopeCtx: ScopeContext,
): Promise<void> {
  const helper = createLlmHelper(
    scopeCtx,
    a.agentOverride ?? a.configAgent,
    process.cwd(),
    a.reasoningEffort,
  );
  const ctx = { ...scopeCtx, llm: helper };

  const initResult = await ruleModule.definition.create(a.workingDir, extractOptions(a.ruleConfig));
  if (initResult.isErr()) {
    printLlmError(initResult.error);
    process.exitCode = 1;
    return;
  }

  const result = await a.logContextStore.run(
    { rule: a.ruleModule.id, scope: path.basename(a.filePath) },
    () => initResult.value(ctx),
  );
  if (result.isErr()) {
    printLlmError(result.error);
    process.exitCode = 1;
    return;
  }

  printResult(a.ruleModule.id, result.value);
}

async function evaluateDecisionFile(
  a: RunRuleArgs,
  ruleModule: DecisionRuleModule,
  scopeCtx: ScopeContext,
): Promise<void> {
  const result = await a.logContextStore.run(
    { rule: ruleModule.id, scope: path.basename(a.filePath) },
    () =>
      runDecisionFile(
        scopeCtx,
        ruleModule.definition,
        a.agentOverride ?? a.configAgent,
        a.workingDir,
      ),
  );
  if (result.isErr()) {
    printLlmError(result.error);
    process.exitCode = 1;
    return;
  }
  console.log(formatRuleResult(ruleModule.id, toDisplayVerdict(result.value.result), 'decision'));
}

export default defineCommand({
  meta: {
    name: 'run',
    description: 'Run a specific rule against a file',
  },
  args: {
    id: {
      type: 'positional',
      description: 'Rule ID to run',
      required: true,
    },
    file: {
      type: 'positional',
      description: 'File path to check',
      required: true,
    },
    config: {
      type: 'string',
      alias: 'c',
      description: 'Path to config file',
    },
    verbose: {
      type: 'boolean',
      description: 'Show verbose output',
      default: false,
    },
    agent: {
      type: 'string',
      description: 'Override model',
    },
    'reasoning-effort': {
      type: 'string',
      description: 'Reasoning effort for Codex models (minimal|low|medium|high|xhigh)',
    },
  },
  async run({ args }) {
    const container = getAppContainer();
    container.get(LogLevelToken).level = args.verbose ? 'debug' : 'info';
    const workingDir = container.get(WorkingDir);

    const loaded = await loadRuleModuleForRun(
      container.get(ConfigLoader),
      container.get(ExternalRuleLoader),
      workingDir,
      args.config,
      args.id,
    );
    if (!loaded) return;

    const level = extractLevel(loaded.ruleConfig);
    if (level === 'off') {
      console.log(`Rule "${args.id}" is disabled (level: off).`);
      return;
    }

    const reasoningEffortResult = parseModelReasoningEffort(args['reasoning-effort']);
    if (reasoningEffortResult.isErr()) {
      printError('INVALID_ARGUMENT', reasoningEffortResult.error.message);
      process.exitCode = 1;
      return;
    }

    await evaluateRule({
      ruleModule: loaded.ruleModule,
      ruleConfig: loaded.ruleConfig,
      filePath: args.file,
      agentOverride: args.agent,
      configAgent: loaded.configAgent,
      reasoningEffort: reasoningEffortResult.value,
      workingDir,
      logContextStore: container.get(LogContextStore),
    });
  },
});
