import type { RuleModule } from './rule-types';
import codeDuplication from './code-duplication/rule';
import functionContract from './function-contract/rule';
import layerSymmetry from './layer-symmetry/rule';
import noImplicitFallback from './no-implicit-fallback/rule';
import noNonstandardCode from './no-nonstandard-code/rule';
import noInvalidStateType from './no-invalid-state-type/rule';
import ssotPlacement from './ssot-placement/rule';
import ssotViolation from './ssot-violation/rule';
import strictFunctionBoundary from './strict-function-boundary/rule';
import testValidity from './test-validity/rule';

export const builtinRules: RuleModule[] = [
  { id: 'code-duplication', definition: codeDuplication },
  { id: 'function-contract', definition: functionContract },
  { id: 'layer-symmetry', definition: layerSymmetry },
  { id: 'no-implicit-fallback', definition: noImplicitFallback },
  { id: 'no-nonstandard-code', definition: noNonstandardCode },
  { id: 'no-invalid-state-type', definition: noInvalidStateType },
  { id: 'ssot-placement', definition: ssotPlacement },
  { id: 'ssot-violation', definition: ssotViolation },
  { id: 'strict-function-boundary', definition: strictFunctionBoundary },
  { id: 'test-validity', definition: testValidity },
];
