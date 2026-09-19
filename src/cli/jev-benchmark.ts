import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { defineCommand, runMain } from 'citty';
import { ResultAsync } from 'neverthrow';

import { validateRuleModel } from '../application/rule-execution/execution-compatibility';
import { createTypeSafeClient } from '../infrastructure/llm/typesafe-client';
import { destroyAppContainer } from '../shared/container';
import { pocSuites } from '../test-support/jev-fixtures';
import { recordVerdict, summarizePoc, type PocRecord } from '../test-support/poc-evaluator';
import { measurePoc } from '../test-support/poc-runner';

function ioError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function initializeOutput(output: string): ResultAsync<void, Error> {
  const metadata = {
    kind: 'fixtures',
    createdAt: new Date().toISOString(),
    repetitions: 3,
    concurrency: 1,
    suites: pocSuites.map((suite) => ({
      ruleId: suite.baseline.id,
      definition: suite.decision.definition,
      cases: suite.cases,
    })),
  };
  return ResultAsync.fromPromise(mkdir(path.dirname(output), { recursive: true }), ioError).andThen(
    () =>
      ResultAsync.fromPromise(
        writeFile(output, `${JSON.stringify(metadata)}\n`, { flag: 'wx' }),
        ioError,
      ),
  );
}

function buildReport(records: PocRecord[]): string {
  const groups = groupRecords(
    records,
    (record) => `${record.ruleId} / ${record.model} / ${record.split}`,
  );
  const lines = [
    '# Jev PoC 実測',
    '',
    'エラーと保留を分母から除外しない。precisionは違反判定数、recallは期待違反数を分母にする。nullは分母0。',
    '',
  ];
  for (const [label, group] of groups) {
    const cases = groupRecords(group, (record) => record.caseId);
    const unstable = [...cases.values()].filter(
      (items) => new Set(items.map(recordVerdict)).size > 1,
    ).length;
    lines.push(
      `## ${label}`,
      '',
      '```json',
      JSON.stringify({ ...summarizePoc(group), unstableCases: unstable }, null, 2),
      '```',
      '',
    );
  }
  lines.push(
    '## 人が確認すること',
    '',
    '誤検出・見逃しの生データを確認し、ルールごとに「次の実験へ進む／質問を見直す／用途に不適」を判断する。未使用の評価用ケースを見てから質問を調整した場合は、新しい評価用ケースを用意する。',
  );
  return lines.join('\n');
}

function groupRecords(
  records: PocRecord[],
  key: (record: PocRecord) => string,
): Map<string, PocRecord[]> {
  const groups = new Map<string, PocRecord[]>();
  for (const record of records) {
    const id = key(record);
    const group = groups.get(id);
    if (group) group.push(record);
    else groups.set(id, [record]);
  }
  return groups;
}

async function runMeasurement(
  output: string,
  textModel: string,
  decisionModel: string,
): Promise<void> {
  const result = await initializeOutput(output)
    .andThen(() =>
      measurePoc(pocSuites, { text: textModel, decision: decisionModel }, (record, repetition) =>
        ResultAsync.fromPromise(
          appendFile(output, `${JSON.stringify({ repetition, ...record })}\n`),
          ioError,
        ),
      ),
    )
    .andThen((records) =>
      ResultAsync.fromPromise(
        writeFile(`${output}.md`, buildReport(records), { flag: 'wx' }),
        ioError,
      ).map(() => records),
    );
  await destroyAppContainer();
  if (result.isErr()) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }
  console.log(`Saved ${result.value.length} records: ${output}`);
  if (result.value.some((record) => record.outcome.kind === 'error')) process.exitCode = 1;
}

const command = defineCommand({
  meta: {
    name: 'benchmark-jev',
    description: 'Compare five fixed rule pairs; 300 evaluations, sequential and uncached',
  },
  args: {
    check: {
      type: 'boolean',
      description: 'Validate the fixture/model setup without API calls or output files',
      default: false,
    },
    'text-model': { type: 'string', default: 'openai/gpt-5.4' },
    'jev-model': { type: 'string', default: 'typesafe-jev-1.13.0' },
    output: {
      type: 'string',
      default: `docs/benchmark/${new Date().toISOString().replaceAll(':', '-')}-jev.jsonl`,
    },
  },
  async run({ args }) {
    const validation = validateRuleModel('baseline', 'text', args['text-model'], undefined).andThen(
      () => validateRuleModel('jev', 'decision', args['jev-model'], undefined),
    );
    if (validation.isErr() || !/^typesafe-jev-\d+\.\d+\.\d+$/.test(args['jev-model'])) {
      console.error(
        validation.isErr() ? validation.error.message : 'Benchmark requires a pinned Jev version.',
      );
      process.exitCode = 1;
      return;
    }
    if (args.check) {
      console.log(
        JSON.stringify({
          rules: pocSuites.length,
          cases: pocSuites.flatMap((s) => s.cases).length,
          evaluations: 300,
          models: [args['text-model'], args['jev-model']],
        }),
      );
      return;
    }
    const client = createTypeSafeClient();
    if (client.isErr()) {
      console.error(client.error.message);
      process.exitCode = 1;
      return;
    }
    await runMeasurement(args.output, args['text-model'], args['jev-model']);
  },
});

await runMain(command);
