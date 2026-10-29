import { Type } from '@sinclair/typebox';
import { err, ok, ResultAsync, type Result } from 'neverthrow';

import type {
  ChoiceQuestion,
  DecisionAnswer,
  DecisionProvider,
  DecisionQuestion,
  DecisionRequest,
  DecisionResponse,
} from '../../shared/decision-types';

import { validateBySchema } from './llm-provider';
import type { DecisionClient } from './typesafe-client';

const probabilitySchema = Type.Number({ minimum: 0, maximum: 1 });

const responseSchema = Type.Object({
  model: Type.String({ minLength: 1 }),
  answers: Type.Record(
    Type.String(),
    Type.Union([
      Type.Object({
        type: Type.Literal('noul'),
        noul: probabilitySchema,
      }),
      Type.Object({
        type: Type.Literal('choice'),
        choice: Type.String({ minLength: 1 }),
        confidence: probabilitySchema,
        probabilities: Type.Record(Type.String(), probabilitySchema),
      }),
    ]),
  ),
  usage: Type.Object({
    input_tokens: Type.Integer({ minimum: 0 }),
    output_tokens: Type.Integer({ minimum: 0 }),
  }),
});

type RawNoulAnswer = { type: 'noul'; readonly noul: number };
type RawChoiceAnswer = {
  type: 'choice';
  readonly choice: string;
  readonly confidence: number;
  readonly probabilities: Record<string, number>;
};
type RawAnswer = RawNoulAnswer | RawChoiceAnswer;

function validateChoiceAnswer(
  question: ChoiceQuestion,
  answer: RawChoiceAnswer,
): Result<void, Error> {
  const choiceIds = Object.keys(question.criteria);
  const answerIds = Object.keys(answer.probabilities);
  const matches =
    answerIds.length !== choiceIds.length ||
    !choiceIds.every((id) => answerIds.includes(id)) ||
    !choiceIds.includes(answer.choice);
  return matches
    ? err(new Error('TypeSafe Choice answer does not match the configured choices.'))
    : ok(undefined);
}

function normalizeChoiceAnswer(
  question: ChoiceQuestion,
  answer: RawChoiceAnswer,
): Result<DecisionAnswer, Error> {
  return validateChoiceAnswer(question, answer).map(() => ({
    type: 'choice',
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
  }));
}

function normalizeAnswer(
  question: DecisionQuestion,
  answer: RawAnswer,
): Result<DecisionAnswer, Error> {
  if (question.type === 'choice' && answer.type === 'choice') {
    return normalizeChoiceAnswer(question, answer);
  }
  if (question.type === 'noul' && answer.type === 'noul') {
    return ok({ type: 'noul', probability: answer.noul });
  }
  return err(new Error('TypeSafe answer type does not match the question.'));
}

function normalizeAnswers(
  request: DecisionRequest,
  answers: Readonly<Record<string, RawAnswer>>,
): Result<DecisionResponse['answers'], Error> {
  const normalizedAnswers: Record<string, DecisionAnswer> = {};
  for (const [id, question] of Object.entries(request.questions)) {
    const answer = answers[id];
    if (answer === undefined) return err(new Error(`Missing TypeSafe answer: ${id}.`));
    const normalized = normalizeAnswer(question, answer);
    if (normalized.isErr()) return err(normalized.error);
    normalizedAnswers[id] = normalized.value;
  }
  return ok(normalizedAnswers);
}

export function validateDecisionResponse(
  raw: unknown,
  request: DecisionRequest,
): Result<DecisionResponse, Error> {
  return validateBySchema(raw, responseSchema).andThen((response) => {
    const ids = Object.keys(response.answers);
    const expectedIds = Object.keys(request.questions);
    if (ids.length !== expectedIds.length || !expectedIds.every((id) => ids.includes(id))) {
      return err(new Error('TypeSafe answer IDs do not match the questions.'));
    }
    return normalizeAnswers(request, response.answers).map((answers) => ({
      model: response.model,
      answers,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        reasoningTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    }));
  });
}

function toRequestError(cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new Error(`TypeSafe API request failed: ${message}`, { cause });
}

export function createDecisionProvider(
  createClient: () => Result<DecisionClient, Error>,
): DecisionProvider {
  return {
    ask: (request) =>
      createClient().asyncAndThen((client) =>
        ResultAsync.fromPromise(client.systemOne(request), toRequestError).andThen((raw) =>
          validateDecisionResponse(raw, request),
        ),
      ),
  };
}
