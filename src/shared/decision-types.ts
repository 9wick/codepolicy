import type { ResultAsync } from 'neverthrow';

import type { TokenUsage, VerdictLabel } from './types';

export type NoulRequest = {
  readonly model: string;
  readonly state: Record<string, string>;
  readonly questions: Record<string, { type: 'noul'; instructions: string }>;
};

export type NoulResponse = {
  readonly model: string;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly usage: TokenUsage;
};

export type DecisionProvider = {
  readonly ask: (request: NoulRequest) => ResultAsync<NoulResponse, Error>;
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
