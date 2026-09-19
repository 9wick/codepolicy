import type { ResultAsync } from 'neverthrow';

import type { TokenUsage, VerdictLabel } from './types';

export type NoulQuestion = {
  type: 'noul';
  readonly instructions: string;
};

export type ChoiceQuestion = {
  type: 'choice';
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string>>;
  readonly violationChoices: readonly string[];
};

export type DecisionQuestion = NoulQuestion | ChoiceQuestion;

export type DecisionRequest = {
  readonly model: string;
  readonly state: Record<string, string>;
  readonly questions: Readonly<Record<string, DecisionQuestion>>;
};

export type DecisionResponse = {
  readonly model: string;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly choiceDetails: Readonly<Record<string, ChoiceDecisionDetail>>;
  readonly usage: TokenUsage;
};

export type ChoiceDecisionDetail = {
  readonly choice: string;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<string, number>>;
};

export type DecisionProvider = {
  readonly ask: (request: DecisionRequest) => ResultAsync<DecisionResponse, Error>;
};

export type DecisionThresholds = {
  readonly passMax: number;
  readonly violationMin: number;
};

export type DecisionObservation = {
  readonly id: string;
  readonly label: string;
  readonly probability: number;
  readonly verdict: VerdictLabel;
  readonly choice?: ChoiceDecisionDetail;
};

export type DecisionVerdict = {
  readonly verdict: VerdictLabel;
  readonly thresholds: DecisionThresholds;
  readonly observations: readonly DecisionObservation[];
};

export type DecisionEvaluation = {
  readonly result: DecisionVerdict;
  readonly requestedModel: string;
  readonly responseModel: string;
  readonly usage: TokenUsage;
  readonly durationMs: number;
};

export type DecisionSnapshot = Pick<
  DecisionEvaluation,
  'result' | 'requestedModel' | 'responseModel'
>;

export const DEFAULT_DECISION_THRESHOLDS: DecisionThresholds = {
  passMax: 0.3,
  violationMin: 0.7,
};
