import type { DecisionRuleDefinition } from '../decision-rule-types';

const definition: DecisionRuleDefinition = {
  meta: {
    scope: 'function',
  },
  include: ['source', 'signature', 'filePath'],
  criteria: [
    {
      id: 'ambiguous_input',
      label: '未確定な業務入力',
      statement:
        'Does this function make a business decision while its input contract accepts missing or unvalidated facts needed for that decision (optional, Partial, undefined, null or raw external data)? Answer no for an adapter, parser, validator, lookup, or for a genuinely optional business state that the function handles explicitly. A branch on an established business fact is not evidence of an unsettled input.',
    },
    {
      id: 'ambiguous_success',
      label: '曖昧な成功結果',
      statement:
        'Does a core business decision return null or undefined for a rejected or incomplete outcome without conveying which business outcome occurred? Answer no for search/lookup not-found results, parsing/validation failures at the boundary, or explicit discriminated success/failure results. Do not judge by nullable return type alone: identify what the function actually does.',
    },
    {
      id: 'repeated_preconditions',
      label: '広い契約による前提分岐',
      statement:
        'Does a core business operation branch internally to repair or reject missing/unvalidated prerequisites that its unnecessarily broad input contract admits? Answer no when branches implement real business rules on established facts, or when the function itself is a parser, validator, search, or input-boundary adapter. An if statement alone is not evidence.',
    },
    {
      id: 'internal_normalization',
      label: '主要処理内の正規化',
      statement:
        'Does a core application/domain operation itself choose a default for an unsettled input fact or execution option that should be settled before the business decision? Answer no if there is no defaulting in the function, for boundary normalization, or for a helper that merely converts or looks up data. Ordinary business rule branches on complete input are not normalization. Do not infer a default from the file path alone.',
    },
  ],
};

export default definition;
