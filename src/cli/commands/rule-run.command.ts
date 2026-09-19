import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { defineCommand } from 'citty';
import { ResultAsync } from 'neverthrow';

import { ConfigLoader } from '../../application/config/config-loader.service';
import { WorkingDir } from '../../application/config/config-loader.service';
import { resolveConfigDir } from '../../application/config/config-path';
import {
  validateRuleModel,
  validateDecisionOptions,
} from '../../application/rule-execution/execution-compatibility';
import { parseModelReasoningEffort } from '../../infrastructure/llm/model-reasoning-effort';
import { ExternalRuleLoader } from '../../rules/external-rule-loader.service';
import { loadRuleModules } from '../../rules/load-rule-modules';
import { extractOptions } from '../../rules/rule-config-utils';
import type { RegisteredRule } from '../../rules/decision-rule-types';
import { getAppContainer } from '../../shared/container';
import type { CodepolicyError } from '../../shared/errors';
import { formatErrorCauseChain, codepolicyError } from '../../shared/errors';
import { LogContextStore, LogLevelToken } from '../../shared/logger';
import type { ModelReasoningEffort, RuleConfig, RuleLevel } from '../../shared/types';
import { RuleEvaluationService } from '../../application/rule-execution/rule-evaluation.service';
import { RuleResolver } from '../../rules/rule-resolver.service';
import type { ScopeUnit, ResolvedRule } from '../../shared/types';
import { cacheOption } from '../cache-option';

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

function printError(code: string, message: string): void {
  console.error(`Error [${code}]: ${message}`);
}

function pickScope(scope: RegisteredRule['definition']['meta']['scope']): ScopeUnit['scopeType'] {
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

function buildFileScope(
  sourceCode: string,
  filePath: string,
  ruleModule: RegisteredRule,
): ScopeUnit {
  return {
    code: sourceCode,
    filePath,
    scopeType: pickScope(ruleModule.definition.meta.scope),
    name: path.basename(filePath),
    startLine: 1,
    endLine: sourceCode.split('\n').length,
  };
}

type RunRuleArgs = {
  ruleModule: RegisteredRule;
  ruleConfig: RuleConfig;
  filePath: string;
  agentOverride: string | undefined;
  configAgent: string;
  reasoningEffort: ModelReasoningEffort | undefined;
  workingDir: string;
  noCache: boolean;
  logContextStore: LogContextStore;
};

function resolveRuleForRun(a: RunRuleArgs): ResolvedRule | null {
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
    return null;
  }
  const container = getAppContainer();
  const resolved = container.get(RuleResolver).resolve(
    {
      filter: 'all',
      agent: a.agentOverride ?? a.configAgent,
      rules: { [a.ruleModule.id]: a.ruleConfig },
    },
    [a.ruleModule],
  );
  if (resolved.isErr()) {
    printError(resolved.error.code, resolved.error.message);
    process.exitCode = 1;
    return null;
  }
  const rule = resolved.value[0];
  if (!rule) {
    printError('RULE_NOT_FOUND', a.ruleModule.id);
    process.exitCode = 1;
    return null;
  }
  return rule;
}

async function evaluateRule(a: RunRuleArgs): Promise<void> {
  const rule = resolveRuleForRun(a);
  if (!rule) return;
  const sourceCode = await unwrap(readSourceFile(a.filePath));
  if (sourceCode === null) return;
  const scope = buildFileScope(sourceCode, a.filePath, a.ruleModule);
  const evaluation = getAppContainer().get(RuleEvaluationService);
  const result = await a.logContextStore.run(
    { rule: rule.id, scope: path.basename(a.filePath) },
    () =>
      evaluation.evaluateFile(scope, rule, {
        noCache: a.noCache,
        reasoningEffort: a.reasoningEffort,
      }),
  );
  if (result.isErr()) {
    for (const line of formatErrorCauseChain(result.error)) console.error(line);
    process.exitCode = 1;
    return;
  }
  console.log(formatRuleResult(rule.id, result.value, rule.kind ?? 'text'));
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
    cache: cacheOption,
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
      noCache: !args.cache,
      logContextStore: container.get(LogContextStore),
    });
  },
});
