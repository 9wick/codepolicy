import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import type { NoulRequest } from '../../shared/decision-types';
import { expectDecisionContract } from '../../test-support/provider-contract';

import { createDecisionProvider, validateNoulResponse } from './typesafe-provider';
import { createTypeSafeClient } from './typesafe-client';

const request: NoulRequest = {
  model: 'jev-1.13.0',
  state: { source: 'function f() {}' },
  questions: { violation: { type: 'noul', instructions: '違反している。' } },
};
const response = {
  model: 'jev-1.13.0',
  answers: { violation: { type: 'noul', noul: 0.91 } },
  usage: { input_tokens: 100, output_tokens: 20 },
};

describe('TypeSafe HTTP contract', () => {
  it('uses the real SDK to send one request and preserves raw probability and usage', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
    const provider = createDecisionProvider(() =>
      createTypeSafeClient({ apiKey: 'test-key', fetch }),
    );
    const result = await provider.ask(request);
    expectDecisionContract(request, result._unsafeUnwrap());
    expect(result).toEqual(
      ok({
        model: 'jev-1.13.0',
        probabilities: { violation: 0.91 },
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          reasoningTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.typesafe.ai/v1/systemone',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
      }),
    );
  });

  it.each([401, 429, 500])('does not retry HTTP %s', async (status) => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: 'test failure' }), { status }),
    );
    const provider = createDecisionProvider(() =>
      createTypeSafeClient({ apiKey: 'test-key', fetch }),
    );
    const result = await provider.ask(request);
    expect(result.isErr()).toBe(true);
    expect(
      result.match(
        () => '',
        (e) => e.message,
      ),
    ).toContain(String(status));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...response, answers: {} },
    { ...response, answers: { ...response.answers, extra: { type: 'noul', noul: 0 } } },
    { ...response, answers: { violation: { type: 'choice', choice: 'yes' } } },
    { ...response, answers: { violation: { type: 'noul', noul: '0.91' } } },
    { ...response, answers: { violation: { type: 'noul', noul: -1 } } },
    { ...response, answers: { violation: { type: 'noul', noul: Infinity } } },
    { ...response, usage: { input_tokens: -1, output_tokens: 1 } },
    { ...response, model: '' },
    null,
  ])('rejects malformed or incomplete responses', (raw) => {
    expect(validateNoulResponse(raw, ['violation']).isErr()).toBe(true);
  });

  it('rejects non-JSON responses without converting to pass', async () => {
    const fetch = vi.fn(async () => new Response('not json', { status: 200 }));
    const provider = createDecisionProvider(() =>
      createTypeSafeClient({ apiKey: 'test-key', fetch }),
    );
    expect((await provider.ask(request)).isErr()).toBe(true);
  });

  it('returns a configuration error for an empty API key', () => {
    expect(createTypeSafeClient({ apiKey: '' }).isErr()).toBe(true);
  });
});
