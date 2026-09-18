import type { DecisionRuleModule } from '../rules/decision-rule-types';
import type { RuleModule } from '../rules/rule-types';
import baseline0 from '../rules/no-implicit-fallback/rule';
import decision0 from '../rules/jev-no-implicit-fallback/rule';
import baseline1 from '../rules/strict-function-boundary/rule';
import decision1 from '../rules/jev-strict-function-boundary/rule';
import baseline2 from '../rules/no-invalid-state-type/rule';
import decision2 from '../rules/jev-no-invalid-state-type/rule';
import baseline3 from '../rules/ssot-placement/rule';
import decision3 from '../rules/jev-ssot-placement/rule';
import baseline4 from '../rules/no-nonstandard-code/rule';
import decision4 from '../rules/jev-no-nonstandard-code/rule';

import { cases as cases3 } from './jev-fixtures/ssot-placement';
import { cases as cases2 } from './jev-fixtures/no-invalid-state-type';
import { cases as cases1 } from './jev-fixtures/strict-function-boundary';
import { cases as cases0 } from './jev-fixtures/no-implicit-fallback';
import type { PocCase } from './poc-evaluator';
import { cases as cases4 } from './jev-fixtures/no-nonstandard-code';

export type PocSuite = {
  readonly baseline: RuleModule;
  readonly decision: DecisionRuleModule;
  readonly cases: readonly PocCase[];
};

export const pocSuites: readonly PocSuite[] = [
  {
    baseline: { id: 'no-implicit-fallback', definition: baseline0 },
    decision: { kind: 'decision', id: 'jev-no-implicit-fallback', definition: decision0 },
    cases: cases0,
  },
  {
    baseline: { id: 'strict-function-boundary', definition: baseline1 },
    decision: { kind: 'decision', id: 'jev-strict-function-boundary', definition: decision1 },
    cases: cases1,
  },
  {
    baseline: { id: 'no-invalid-state-type', definition: baseline2 },
    decision: { kind: 'decision', id: 'jev-no-invalid-state-type', definition: decision2 },
    cases: cases2,
  },
  {
    baseline: { id: 'ssot-placement', definition: baseline3 },
    decision: { kind: 'decision', id: 'jev-ssot-placement', definition: decision3 },
    cases: cases3,
  },
  {
    baseline: { id: 'no-nonstandard-code', definition: baseline4 },
    decision: { kind: 'decision', id: 'jev-no-nonstandard-code', definition: decision4 },
    cases: cases4,
  },
];
