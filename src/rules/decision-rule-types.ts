import type { DecisionReasonKind } from '../shared/decision-types';

import type { RuleMeta, RuleModule } from './rule-types';

export type DecisionField =
  | 'source'
  | 'filePath'
  | 'scopeType'
  | 'name'
  | 'qualifiedSymbol'
  | 'signature'
  | 'fileTree';

type DecisionCriterionBase = {
  readonly id: string;
  readonly label: string;
  readonly statement: string;
};

export type NoulDecisionCriterion = DecisionCriterionBase & {
  type?: 'noul';
};

export type ChoiceCriterionBase = DecisionCriterionBase & {
  type: 'choice';
  readonly choices: Readonly<Record<string, string>>;
};

export type DirectChoiceDecisionCriterion = ChoiceCriterionBase & {
  readonly violationChoices: readonly string[];
};

export type ObservationChoiceCriterion = ChoiceCriterionBase & {
  violationChoices?: undefined;
};

export type DirectDecisionCriterion = NoulDecisionCriterion | DirectChoiceDecisionCriterion;
export type ObservationCriterion = ObservationChoiceCriterion;
export type DecisionCriterion = DirectDecisionCriterion | ObservationCriterion;

export type EvidenceExpression =
  | { type: 'choice'; readonly criterionId: string; readonly choiceId: string }
  | { type: 'all'; readonly expressions: readonly EvidenceExpression[] }
  | { type: 'any'; readonly expressions: readonly EvidenceExpression[] };

export type ConcernOutcome = {
  readonly id: string;
  readonly verdict: 'pass' | 'violation' | 'borderline';
  readonly reason: string;
  readonly reasonKind: DecisionReasonKind;
  readonly when: EvidenceExpression;
};

export type DecisionConcern = {
  readonly id: string;
  readonly label: string;
  readonly outcomes: readonly ConcernOutcome[];
};

export type ComposedDecisionPolicy = {
  type: 'concerns';
  readonly concerns: readonly DecisionConcern[];
};

type DecisionRuleDefinitionBase = {
  readonly meta: RuleMeta;
  readonly include: readonly DecisionField[];
};

export type DirectDecisionRuleDefinition = DecisionRuleDefinitionBase & {
  readonly criteria: readonly DirectDecisionCriterion[];
  policy?: undefined;
};

export type ComposedDecisionRuleDefinition = DecisionRuleDefinitionBase & {
  readonly criteria: readonly ObservationCriterion[];
  readonly policy: ComposedDecisionPolicy;
};

export type DecisionRuleDefinition = DirectDecisionRuleDefinition | ComposedDecisionRuleDefinition;

export type DecisionRuleModule = {
  kind: 'decision';
  readonly id: string;
  readonly definition: DecisionRuleDefinition;
};

export type RegisteredRule = (RuleModule & { kind?: 'text' }) | DecisionRuleModule;
