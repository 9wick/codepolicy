import { errAsync, ok, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { CreateDecisionClient } from '../infrastructure/llm/typesafe-client';
import type { RegisteredRule } from '../rules/decision-rule-types';
import definition from '../rules/jev-no-implicit-fallback/rule';
import { resetAppContainer, getAppContainer } from '../shared/container';
import type { NoulRequest } from '../shared/decision-types';
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
    startLine: 1,
    endLine: 1,
  },
};

describe('PoC measurement contracts', () => {
  it('uses the same context for both routes and retains raw observations and model identities', async () => {
    resetAppContainer();
    const systemOne = vi.fn(async (request: NoulRequest) => ({
      model: 'jev-1.13.0',
      answers: Object.fromEntries(
        Object.keys(request.questions).map((id) => [id, { type: 'noul', noul: 0.699 }]),
      ),
      usage: { input_tokens: 10, output_tokens: 3 },
    }));
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
          verdict: 'borderline',
          observations: expect.arrayContaining([expect.objectContaining({ probability: 0.699 })]),
        },
      },
    });
    const summary = summarizePoc([b, a]);
    expect(summary).toMatchObject({ total: 2, correct: 1, borderline: 1, errors: 0 });
    expect(summary).toMatchObject({
      confusion: { violation: { pass: 0, borderline: 1, violation: 1, error: 0 } },
      borderlineRate: { numerator: 1, denominator: 2, rate: 0.5 },
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
