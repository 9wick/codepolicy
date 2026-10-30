import type { DecisionRuleDefinition } from '../decision-rule-types';

const definition: DecisionRuleDefinition = {
  meta: {
    scope: ['type', 'interface'],
  },
  include: ['source', 'filePath', 'name', 'scopeType'],
  criteria: [
    {
      id: 'missing_required',
      label: '完成状態の必須値欠損',
      statement:
        'Does this type permit a completed or verified state to omit a field that this same state necessarily requires (optional, undefined or null)? A status and an independently optional completion field can allow the completed status without its evidence. Answer no for an explicitly unfinished Draft or input type, a genuinely optional attribute, or a discriminated union requiring the field in its completed branch. Optional syntax alone is not evidence.',
    },
    {
      id: 'contradictory_fields',
      label: '項目間の状態矛盾',
      statement:
        'Can this domain type express a concrete contradictory combination of its own fields, such as a status union independent of optional completion evidence (completed without evidence or pending with evidence), or mutually exclusive flags both true? Answer no when a discriminated union ties each field to its proper state, the fields are independent, or this is explicitly a Draft. Require an actual contradictory combination, not merely an optional field.',
    },
    {
      id: 'interchangeable_values',
      label: '異なる意味の値の混同',
      statement:
        'Does the type expose two or more plausibly confusable fields with distinct roles, identities or physical units using the same unbranded primitive, permitting an accidental swap? Answer no for branded or structurally distinct types, or a lone primitive field with no meaningful counterpart. Do not flag every use of string or number.',
    },
    {
      id: 'mixed_validation_state',
      label: '検証前後の状態混在',
      statement:
        'Does this type actually mix raw/unvalidated fields or incomplete input with a completed or verified stage without distinguishing them? Answer no if there is no raw, incomplete or unvalidated state in the type, even if fields use ordinary primitives. Answer no for explicitly named Draft/input types and discriminated stage unions with required completed fields. Do not infer a hidden validation stage from the file path or optional syntax alone.',
    },
  ],
};

export default definition;
