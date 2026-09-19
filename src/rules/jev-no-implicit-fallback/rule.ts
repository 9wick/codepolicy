import type { DecisionRuleDefinition } from '../decision-rule-types';

const definition: DecisionRuleDefinition = {
  meta: {
    scope: 'function',
  },
  include: ['source', 'signature', 'filePath'],
  criteria: [
    {
      id: 'implicit_data_loss',
      label: '暗黙のデータ破壊',
      type: 'choice',
      statement: 'What kind of fallback or failure behavior is primarily present in this function?',
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
  ],
};

export default definition;
