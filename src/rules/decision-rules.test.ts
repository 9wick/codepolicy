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

  it('declares the complete no-fallback information-loss judgment', () => {
    const noFallback = builtinDecisionRules.find((r) => r.id === 'jev-no-implicit-fallback');
    expect(noFallback?.definition.criteria).toEqual([
      {
        id: 'implicit_data_loss',
        label: '暗黙のデータ破壊',
        type: 'choice',
        statement:
          'What kind of fallback or failure behavior is primarily present in this function?',
        choices: {
          implicit_business_default:
            'Outside the external-input or configuration boundary, missing business information is replaced with a concrete normal business value, erasing whether it was supplied.',
          swallowed_failure:
            'An actual error or failed operation is handled by returning an ordinary successful value, so the caller cannot observe the failure.',
          boundary_default:
            'An input adapter, request parser, or configuration loader explicitly resolves its external boundary contract by assigning an internal value.',
          technical_default:
            'A purely technical parameter is omitted and receives its single domain-independent conventional value.',
          presentation_placeholder:
            'Missing information is represented only by presentation text and no business value or decision is fabricated.',
          preserved_or_absent:
            'Failure remains observable as Result, Error, rejection, or throw, or the function has no relevant fallback behavior.',
        },
        violationChoices: ['implicit_business_default', 'swallowed_failure'],
      },
    ]);
  });
});
