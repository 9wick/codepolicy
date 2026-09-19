import type { RuleMeta, RuleModule } from './rule-types';

export type DecisionField = 'source' | 'filePath' | 'scopeType' | 'name' | 'signature' | 'fileTree';

type DecisionCriterionBase = {
  readonly id: string;
  readonly label: string;
  readonly statement: string;
};

export type NoulDecisionCriterion = DecisionCriterionBase & {
  type?: 'noul';
};

export type ChoiceDecisionCriterion = DecisionCriterionBase & {
  type: 'choice';
  readonly choices: Readonly<Record<string, string>>;
  readonly violationChoices: readonly string[];
};

export type DecisionCriterion = NoulDecisionCriterion | ChoiceDecisionCriterion;

export type DecisionRuleDefinition = {
  readonly meta: RuleMeta;
  readonly include: readonly DecisionField[];
  readonly criteria: readonly DecisionCriterion[];
};

export type DecisionRuleModule = {
  kind: 'decision';
  readonly id: string;
  readonly definition: DecisionRuleDefinition;
};

export type RegisteredRule = (RuleModule & { kind?: 'text' }) | DecisionRuleModule;
