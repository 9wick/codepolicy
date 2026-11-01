import type { DecisionRuleDefinition } from '../decision-rule-types';

const definition: DecisionRuleDefinition = {
  meta: {
    scope: 'exported-function',
    usesFileTree: true,
  },
  include: ['source', 'signature', 'name', 'filePath', 'fileTree'],
  criteria: [
    {
      id: 'misplaced_responsibility',
      label: 'パスと責務の不一致',
      statement:
        'Does the exported function perform a responsibility clearly unrelated to the responsibility established by its actual file and neighboring files? Base the answer on behavior, path and fileTree together, not a function name alone. A utility that performs domain orchestration, or a domain model that directly performs external I/O when the tree has adapters/infrastructure, is a concrete mismatch. Answer no for a mere alternative placement or an ordinary adapter calling application logic.',
    },
    {
      id: 'wrong_layer',
      label: 'layerと責務の不一致',
      statement:
        'Does the function itself clearly cross the responsibility of its architectural layer, as established by both source and fileTree? A domain model executing external HTTP/database operations or a generic utility orchestrating business transactions crosses layers when the project visibly has boundary/application/infrastructure locations. An adapter translating input and calling an application operation is not a layer violation. If the tree cannot establish a layer contract, do not conclude one from a directory name alone.',
    },
  ],
};

export default definition;
