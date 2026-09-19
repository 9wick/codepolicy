import type { DecisionRuleDefinition } from '../decision-rule-types';

const definition: DecisionRuleDefinition = {
  meta: {
    scope: 'function',
  },
  include: ['source', 'signature', 'filePath'],
  criteria: [
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
  ],
};

export default definition;
