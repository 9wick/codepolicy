import { okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { validateCriteria } from '../application/rule-execution/decision-validation';
import { createTestContainer } from '../test-support/test-container';

import { builtinRules } from './builtin-rules';
import { builtinDecisionRules } from './builtin-decision-rules';
import { loadRuleModules } from './load-rule-modules';
import { ExternalRuleLoader } from './external-rule-loader.service';
import { RuleResolver } from './rule-resolver.service';

describe('Jev built-in rule contracts', () => {
  it('registers five distinct rules and preserves the ten existing modules', async () => {
    const { container, target: resolver } = createTestContainer(RuleResolver);
    const config = { filter: 'all', agent: 'typesafe-jev', rules: {} };
    const loaded = await loadRuleModules(
      { ...config, filter: 'all' },
      container.get(ExternalRuleLoader),
      '.',
    );
    expect(loaded.map((rules) => rules.length)._unsafeUnwrap()).toBe(15);
    expect(builtinRules).toHaveLength(10);
    expect(builtinDecisionRules.map((r) => r.id)).toEqual([
      'jev-no-implicit-fallback',
      'jev-strict-function-boundary',
      'jev-no-invalid-state-type',
      'jev-ssot-placement',
      'jev-no-nonstandard-code',
    ]);
    expect(
      resolver
        .resolve(
          { ...config, filter: 'all', rules: { 'jev-no-implicit-fallback': 'error' } },
          builtinDecisionRules,
        )
        ._unsafeUnwrap(),
    ).toEqual([
      expect.objectContaining({
        id: 'jev-no-implicit-fallback',
        kind: 'decision',
        ruleVersion: expect.any(String),
        level: 'error',
      }),
    ]);
  });

  it('rejects collisions between new built-ins and external text modules', async () => {
    const loader = new ExternalRuleLoader();
    loader.load = () =>
      okAsync([
        {
          id: 'jev-no-implicit-fallback',
          definition: {
            meta: { scope: 'function' },
            create: () =>
              okAsync(() => okAsync({ verdict: 'pass', reasoning: 'ok', citations: [] })),
          },
        },
      ]);
    expect(
      (
        await loadRuleModules({ filter: 'all', agent: 'typesafe-jev', rules: {} }, loader, '.')
      ).isErr(),
    ).toBe(true);
  });

  it('uses complete unique questions and allows caching for every Jev rule', () => {
    for (const rule of builtinDecisionRules) {
      expect(validateCriteria(rule.definition.criteria).isOk()).toBe(true);
      expect(rule.definition.meta.cacheable).not.toBe(false);
      expect(rule.definition.include).toContain('source');
    }
    const placement = builtinDecisionRules.find((r) => r.id === 'jev-ssot-placement');
    expect(placement?.definition.meta).toMatchObject({
      scope: 'exported-function',
      usesFileTree: true,
    });
    expect(placement?.definition.include).toContain('fileTree');
    expect(placement?.definition.criteria.map((c) => c.id)).toEqual([
      'misplaced_responsibility',
      'wrong_layer',
    ]);
  });

  it('declares two independent no-fallback judgments', () => {
    const noFallback = builtinDecisionRules.find((r) => r.id === 'jev-no-implicit-fallback');
    expect(noFallback?.definition.criteria).toEqual([
      {
        id: 'ambiguous_input_handling',
        label: '曖昧な入力・設定の正常値化',
        type: 'choice',
        statement:
          'Based on the function body, signature, and file path, how does this function handle actual missing or unresolved external input or configuration, if present? Classify only this axis. Use whether the function owns an adapter, request-parsing, or configuration boundary; do not treat every default as a business decision. Ignore operation failure handling, which is asked separately.',
        choices: {
          implicit_business_default:
            'The function does not own the external-input or configuration boundary, yet an absent optional field on a domain entity or other missing business information is replaced with a concrete normal business value such as zero, an empty collection, or a default identifier or status, erasing whether it was supplied.',
          boundary_resolution:
            'The function owns an input-adapter, request-parser, or configuration-loader boundary and explicitly resolves that external contract before domain logic.',
          technical_default:
            'A purely technical parameter is omitted and receives its single domain-independent conventional value.',
          presentation_placeholder:
            'Missing information is represented only by presentation text and no business value or decision is fabricated.',
          preserved_or_absent:
            'Missing information remains distinguishable, or the function has no relevant missing external input or unresolved configuration.',
        },
        violationChoices: ['implicit_business_default'],
      },
      {
        id: 'failure_handling',
        label: '失敗の成功値化',
        type: 'choice',
        statement:
          'Based only on explicit control flow in this function, how does it handle a failure already observed as an exception, rejected operation, error Result, or invalid-state indicator? A call that might fail is not itself a handled failure. Classify only this axis; ignore missing-input default handling, which is asked separately.',
        choices: {
          swallowed_failure:
            'The code explicitly catches, matches, or checks an observed failure and replaces it with an ordinary successful value, so the caller cannot observe the failure.',
          preserved_failure:
            'The code explicitly propagates or translates an observed failure as Result, Error, rejection, throw, or another explicit failure value.',
          no_failure_path:
            'The function has no explicit catch, match, or check that handles an observed failure. Do not infer one merely because a call could fail, a parser could return an invalid value, or the function contains optional input, defaults, or ordinary branches.',
        },
        violationChoices: ['swallowed_failure'],
      },
    ]);
  });
});
