import type { DecisionRuleModule } from './decision-rule-types';
import rule0 from './jev-no-implicit-fallback/rule';
import rule1 from './jev-strict-function-boundary/rule';
import rule2 from './jev-no-invalid-state-type/rule';
import rule3 from './jev-ssot-placement/rule';
import rule4 from './jev-no-nonstandard-code/rule';

export const builtinDecisionRules: DecisionRuleModule[] = [
  { kind: 'decision', id: 'jev-no-implicit-fallback', definition: rule0 },
  { kind: 'decision', id: 'jev-strict-function-boundary', definition: rule1 },
  { kind: 'decision', id: 'jev-no-invalid-state-type', definition: rule2 },
  { kind: 'decision', id: 'jev-ssot-placement', definition: rule3 },
  { kind: 'decision', id: 'jev-no-nonstandard-code', definition: rule4 },
];
