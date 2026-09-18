import { okAsync, type ResultAsync } from 'neverthrow';

import type { RegisteredRule } from '../rules/decision-rule-types';

import type { PocSuite } from './jev-fixtures';
import { evaluatePocCase, type PocCase, type PocRecord } from './poc-evaluator';

type PocJob = { testCase: PocCase; rule: RegisteredRule; model: string; repetition: number };
type PersistRecord = (record: PocRecord, repetition: number) => ResultAsync<void, Error>;

function buildJobs(
  suites: readonly PocSuite[],
  models: { text: string; decision: string },
): PocJob[] {
  const jobs: PocJob[] = [];
  for (let repetition = 1; repetition <= 3; repetition++) {
    for (const suite of suites) {
      for (const testCase of suite.cases) {
        jobs.push({ testCase, rule: suite.baseline, model: models.text, repetition });
        jobs.push({ testCase, rule: suite.decision, model: models.decision, repetition });
      }
    }
  }
  return jobs;
}

function evaluateAndPersist(
  job: PocJob,
  persist: PersistRecord,
  evaluate: typeof evaluatePocCase,
): ResultAsync<PocRecord, Error> {
  return evaluate(job.testCase, job.rule, job.model).andThen((record) =>
    persist(record, job.repetition).map(() => record),
  );
}

export function measurePoc(
  suites: readonly PocSuite[],
  models: { text: string; decision: string },
  persist: PersistRecord,
  evaluate: typeof evaluatePocCase = evaluatePocCase,
): ResultAsync<PocRecord[], Error> {
  let chain: ResultAsync<PocRecord[], Error> = okAsync([]);
  for (const job of buildJobs(suites, models)) {
    chain = chain.andThen((records) =>
      evaluateAndPersist(job, persist, evaluate).map((record) => [...records, record]),
    );
  }
  return chain;
}
