import type { RuleMeta, RuleModule } from './rule-types';

export type DecisionField = 'source' | 'filePath' | 'scopeType' | 'name' | 'signature' | 'fileTree';

export type DecisionCriterion = {
  readonly id: string;
  readonly label: string;
  readonly statement: string;
};

export type DecisionRuleDefinition = {
  readonly meta: RuleMeta & { cacheable: false };
  readonly include: readonly DecisionField[];
  readonly criteria: readonly DecisionCriterion[];
};

export type DecisionRuleModule = {
  kind: 'decision';
  readonly id: string;
  readonly definition: DecisionRuleDefinition;
};

export type RegisteredRule = (RuleModule & { kind?: 'text' }) | DecisionRuleModule;
