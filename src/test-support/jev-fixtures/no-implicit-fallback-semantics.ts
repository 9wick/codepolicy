import type { VerdictLabel } from '../../shared/types';
import type { PocCase } from '../poc-evaluator';

type Meaning = 'meaning_lost' | 'preserved_or_absent' | 'unclear';
type SemanticCase = {
  readonly testCase: PocCase;
  readonly expectedChoices: {
    readonly ambiguous_input_handling: Meaning;
    readonly failure_handling: Meaning;
  };
};
type CaseInput = {
  readonly id: string;
  readonly split: PocCase['split'];
  readonly source: string;
  readonly filePath: string;
  readonly reason: string;
  readonly input: Meaning;
  readonly failure: Meaning;
  readonly verdict: VerdictLabel;
};

function fixture(value: CaseInput): SemanticCase {
  return {
    testCase: {
      id: `no-implicit-fallback/semantics/${value.split}/${value.id}`,
      split: value.split,
      expected: value.verdict,
      expectationReason: value.reason,
      context: {
        source: value.source,
        filePath: value.filePath,
        scopeType: 'function',
        name: value.id,
        startLine: 1,
        endLine: value.source.split('\n').length,
      },
    },
    expectedChoices: {
      ambiguous_input_handling: value.input,
      failure_handling: value.failure,
    },
  };
}

export const semanticCases: readonly SemanticCase[] = [
  fixture({
    id: 'local-counter',
    split: 'development',
    filePath: 'src/domain/count.ts',
    source:
      'function countKinds(kinds: readonly string[]): Map<string, number> { const counts = new Map<string, number>(); for (const kind of kinds) { counts.set(kind, (counts.get(kind) ?? 0) + 1); } return counts; }',
    reason: '自分で空から集計するMap。未登録は未出現で件数0と同義。domainでも意味喪失なし。',
    input: 'preserved_or_absent',
    failure: 'preserved_or_absent',
    verdict: 'pass',
  }),
  fixture({
    id: 'unknown-usage',
    split: 'development',
    filePath: 'src/infra/usage.ts',
    source:
      "function totalTokens(usage: { kind: 'measured'; tokens: number } | { kind: 'unavailable' }): number { return usage.kind === 'measured' ? usage.tokens : 0; }",
    reason:
      '測定不能という状態を測定済みの0と区別できなくする。技術値でも意味喪失。失敗経路ではない。',
    input: 'meaning_lost',
    failure: 'preserved_or_absent',
    verdict: 'borderline',
  }),
  fixture({
    id: 'raw-input',
    split: 'development',
    filePath: 'src/adapters/http/query.ts',
    source:
      'function parsePageSize(raw: string | undefined): number { return raw === undefined ? 20 : Number(raw); }',
    reason: '省略と明示20の区別を失う。補完権限があるかはこの観測とは別。',
    input: 'meaning_lost',
    failure: 'preserved_or_absent',
    verdict: 'borderline',
  }),
  fixture({
    id: 'both-losses',
    split: 'development',
    filePath: 'src/adapters/http/users.ts',
    source:
      'async function loadUsers(rawLimit: string | undefined): Promise<User[]> { const limit = rawLimit === undefined ? 20 : Number(rawLimit); try { return await repository.findAll(limit); } catch { return []; } }',
    reason: '入力省略の区別と取得失敗の意味を両方失う。片方だけ検出しても成功ではない。',
    input: 'meaning_lost',
    failure: 'meaning_lost',
    verdict: 'violation',
  }),
  fixture({
    id: 'preserved-error',
    split: 'development',
    filePath: 'src/application/orders.ts',
    source:
      'async function loadOrders(): Promise<Result<Order[], Error>> { return repository.findAll(); }',
    reason: '取得結果をResultとしてそのまま返す。失敗し得る呼び出しだけで隠蔽を推測しない。',
    input: 'preserved_or_absent',
    failure: 'preserved_or_absent',
    verdict: 'pass',
  }),
  fixture({
    id: 'mixed-input-paths',
    split: 'development',
    filePath: 'src/application/update.ts',
    source:
      "function updateProfile(current: { name: string; city: string }, patch: { name?: string; city?: string }): { name: string; city: string } { return { name: patch.name === undefined ? current.name : patch.name, city: patch.city ?? '' }; }",
    reason:
      'name省略は現状維持。city省略は空文字への更新になり変更無しの意味を失う。保存処理が喪失を隠さない。',
    input: 'meaning_lost',
    failure: 'preserved_or_absent',
    verdict: 'borderline',
  }),
  fixture({
    id: 'technical-radix',
    split: 'development',
    filePath: 'src/utils/number.ts',
    source:
      'function parseDecimal(raw: string, radix: number = 10): number { return Number.parseInt(raw, radix); }',
    reason: '既存の許容例。10進数という通常の技術的既定値を意味喪失としない。',
    input: 'preserved_or_absent',
    failure: 'preserved_or_absent',
    verdict: 'pass',
  }),
  fixture({
    id: 'failure-status',
    split: 'development',
    filePath: 'src/cli/unwrap.ts',
    source:
      'function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: Error }): T | null { if (result.ok) return result.value; console.error(result.error); process.exitCode = 1; return null; }',
    reason: '失敗をprocess終了コード1で表現する。nullを返す構文だけで成功化とはしない。',
    input: 'preserved_or_absent',
    failure: 'preserved_or_absent',
    verdict: 'pass',
  }),
  fixture({
    id: 'measurement-map',
    split: 'evaluation',
    filePath: 'src/infra/measurements.ts',
    source:
      "function reportMeasurements(samples: readonly { id: string; measurement: { kind: 'measured'; value: number } | { kind: 'unknown' } }[]): number[] { const values = new Map<string, number>(); for (const sample of samples) { if (sample.measurement.kind === 'measured') values.set(sample.id, sample.measurement.value); } return samples.map(sample => values.get(sample.id) ?? 0); }",
    reason: 'カウンタと同じMap.get??0だが、こちらの未登録は測定不明。測定済み0との区別を失う。',
    input: 'meaning_lost',
    failure: 'preserved_or_absent',
    verdict: 'borderline',
  }),
  fixture({
    id: 'preserved-update',
    split: 'evaluation',
    filePath: 'src/domain/update.ts',
    source:
      'function updateLimit(current: number, patch: { limit?: number }): number { return patch.limit === undefined ? current : patch.limit; }',
    reason: '省略を変更無しとして適用し現状を保持する。0等への置換で指示を書き換えていない。',
    input: 'preserved_or_absent',
    failure: 'preserved_or_absent',
    verdict: 'pass',
  }),
  fixture({
    id: 'mixed-failure-paths',
    split: 'evaluation',
    filePath: 'src/domain/load.ts',
    source:
      'async function loadSummary(id: string): Promise<{ ok: true; count: number } | { ok: false; error: unknown }> { try { return { ok: true, count: await repository.count(id) }; } catch (error) { if (error instanceof TimeoutError) return { ok: false, error }; return { ok: true, count: 0 }; } }',
    reason:
      'TimeoutErrorは失敗を保持するが、他の失敗は成功件数0へ変換。同じ失敗軸でも一部保存で隠さない。',
    input: 'preserved_or_absent',
    failure: 'meaning_lost',
    verdict: 'violation',
  }),
  fixture({
    id: 'missing-contract',
    split: 'evaluation',
    filePath: 'src/utils/resolve.ts',
    source: 'function resolve(value: number | undefined): number { return value ?? 0; }',
    reason:
      'undefinedが未知なのか0の別表現なのか入力から分からない。構文だけで意味喪失／保存を確定しない。',
    input: 'unclear',
    failure: 'preserved_or_absent',
    verdict: 'borderline',
  }),
];
