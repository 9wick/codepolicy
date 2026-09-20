import { errAsync, ok, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { CreateDecisionClient } from '../infrastructure/llm/typesafe-client';
import { RuleEvaluationService } from '../application/rule-execution/rule-evaluation.service';
import { CacheStoreToken, type LookupOutcome } from '../infrastructure/cache/cache-store';
import type { RegisteredRule } from '../rules/decision-rule-types';
import definition from '../rules/jev-no-implicit-fallback/rule';
import { resetAppContainer, getAppContainer } from '../shared/container';
import type { DecisionRequest } from '../shared/decision-types';
import type { RuleVerdict } from '../shared/types';

import { evaluatePocCase, summarizePoc, type PocCase } from './poc-evaluator';

const fixture: PocCase = {
  id: 'test-case',
  split: 'evaluation',
  expected: 'violation',
  expectationReason: 'failure becomes success',
  context: {
    source: 'function f() { try { return load(); } catch { return []; } }',
    filePath: 'src/f.ts',
    scopeType: 'function',
    name: 'f',
    qualifiedSymbol: 'FService#f',
    startLine: 1,
    endLine: 1,
  },
};

describe('PoC measurement contracts', () => {
  it('counts expected authority deferrals without confusing them with pass or violation', async () => {
    const rule: RegisteredRule = {
      id: 'deferred',
      definition: {
        meta: { scope: 'function' },
        create: () =>
          okAsync(() =>
            okAsync({ verdict: 'borderline', reasoning: 'authority unset', citations: [] }),
          ),
      },
    };
    const record = (
      await evaluatePocCase({ ...fixture, expected: 'borderline' }, rule, 'unused')
    )._unsafeUnwrap();
    expect(summarizePoc([record])).toMatchObject({
      total: 1,
      correct: 1,
      confusion: { borderline: { pass: 0, borderline: 1, violation: 0, error: 0 } },
      borderlineRate: { numerator: 1, denominator: 1, rate: 1 },
    });
  });
  it('uses shared evaluation with caching explicitly disabled on every measurement', async () => {
    resetAppContainer();
    const lookup = vi.fn(() => okAsync({ kind: 'miss' } satisfies LookupOutcome));
    const save = vi.fn(() => okAsync(undefined));
    const container = getAppContainer();
    container.bind({ provide: CacheStoreToken, useValue: { lookup, save } });
    const shared = vi.spyOn(
      container.get<RuleEvaluationService>(RuleEvaluationService),
      'evaluate',
    );
    const evaluate = vi.fn(() =>
      okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] } satisfies RuleVerdict),
    );
    const rule: RegisteredRule = {
      id: 'baseline',
      definition: { meta: { scope: 'function' }, create: () => okAsync(evaluate) },
    };
    await evaluatePocCase(fixture, rule, 'openai/gpt-5.4');
    await evaluatePocCase(fixture, rule, 'openai/gpt-5.4');
    expect(shared).toHaveBeenCalledTimes(2);
    expect(shared.mock.calls.every((call) => call[4].noCache === true)).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(lookup).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('uses the same context for both routes and retains raw observations and model identities', async () => {
    resetAppContainer();
    const systemOne = vi.fn(async (request: DecisionRequest) => {
      const selected: Readonly<Record<string, string>> = {
        ambiguous_input_handling: 'preserved_or_absent',
        failure_handling: 'meaning_lost',
      };
      return {
        model: 'jev-1.13.0',
        answers: Object.fromEntries(
          Object.entries(request.questions).map(([id, question]) => [
            id,
            question.type === 'choice'
              ? {
                  type: 'choice',
                  choice: selected[id],
                  confidence: 0.699,
                  probabilities: Object.fromEntries(
                    Object.keys(question.criteria).map((choice) => [
                      choice,
                      choice === selected[id] ? 0.699 : 0,
                    ]),
                  ),
                }
              : { type: 'noul', noul: 0.699 },
          ]),
        ),
        usage: { input_tokens: 10, output_tokens: 3 },
      };
    });
    getAppContainer().bind({ provide: CreateDecisionClient, useValue: () => ok({ systemOne }) });
    const evaluate = vi.fn(() =>
      okAsync({ verdict: 'violation', reasoning: 'bad', citations: [] } satisfies RuleVerdict),
    );
    const text: RegisteredRule = {
      id: 'baseline',
      definition: { meta: { scope: 'function' }, create: () => okAsync(evaluate) },
    };
    const a = (await evaluatePocCase(fixture, text, 'openai/gpt-5.4'))._unsafeUnwrap();
    const b = (
      await evaluatePocCase(
        fixture,
        { kind: 'decision', id: 'jev-baseline', definition },
        'typesafe-jev-1.13.0',
      )
    )._unsafeUnwrap();
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining(fixture.context));
    expect(systemOne.mock.calls[0]?.[0].state['source']).toBe(fixture.context.source);
    expect(a.fixtureHash).toBe(b.fixtureHash);
    expect(b.outcome).toMatchObject({
      kind: 'decision',
      result: {
        responseModel: 'jev-1.13.0',
        result: {
          verdict: 'violation',
          observations: expect.arrayContaining([expect.objectContaining({ probability: 0.699 })]),
        },
      },
    });
    const summary = summarizePoc([b, a]);
    expect(summary).toMatchObject({ total: 2, correct: 2, borderline: 0, errors: 0 });
    expect(summary).toMatchObject({
      confusion: { violation: { pass: 0, borderline: 0, violation: 2, error: 0 } },
      borderlineRate: { numerator: 0, denominator: 2, rate: 0 },
      usage: { inputTokens: 10, outputTokens: 3 },
    });
  });
  it('records failures instead of turning them into pass or omitting the case', async () => {
    const rule: RegisteredRule = {
      id: 'broken',
      definition: { meta: { scope: 'function' }, create: () => errAsync(new Error('API 429')) },
    };
    const record = (await evaluatePocCase(fixture, rule, 'openai/gpt-5.4'))._unsafeUnwrap();
    expect(record.caseId).toBe(fixture.id);
    expect(record.outcome).toEqual({ kind: 'error', message: 'API 429' });
    expect(summarizePoc([record])).toMatchObject({
      total: 1,
      correct: 0,
      errors: 1,
      precision: null,
      recall: 0,
    });
  });
  it('rejects invalid fixture input before evaluating', async () => {
    const create = vi.fn(() => errAsync(new Error('not called')));
    const rule: RegisteredRule = {
      id: 'baseline',
      definition: { meta: { scope: 'function' }, create },
    };
    expect(
      (
        await evaluatePocCase({ ...fixture, expectationReason: '' }, rule, 'openai/gpt-5.4')
      ).isErr(),
    ).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});
