import type { DecisionRuleDefinition } from '../decision-rule-types';

const definition: DecisionRuleDefinition = {
  meta: {
    scope: ['type', 'interface'],
    cacheable: false,
  },
  include: ['source', 'filePath', 'name', 'scopeType'],
  criteria: [
    {
      id: 'missing_required',
      label: '完成状態の必須値欠損',
      statement:
        '対象の型は完成済み・検証済みの業務データを表すのに、その状態で必須の値の欠損をoptionalやnullで許している。入力途中や検証前を明示する型、欠損自体が正当な状態である項目は含めない。',
    },
    {
      id: 'contradictory_fields',
      label: '項目間の状態矛盾',
      statement:
        '対象の型は業務上連動する項目を独立に指定でき、状態と日時等の矛盾した組み合わせを完成済みデータとして表現できる。独立してよい項目や入力途中専用の型は含めない。',
    },
    {
      id: 'interchangeable_values',
      label: '異なる意味の値の混同',
      statement:
        '対象の型は異なる識別子・単位・意味を持つ値を同じprimitiveとして交換可能にし、取り違えが現実的に起こりうる。primitiveを使うこと自体や、意味の取り違えがない単純な別名は含めない。',
    },
    {
      id: 'mixed_validation_state',
      label: '検証前後の状態混在',
      statement:
        '対象の型は検証前・入力途中の状態と完成済みの状態を区別せず、未確定の値を完成済みとして扱える。Draft等として未確定状態を明示し閉じ込めている型は含めない。',
    },
  ],
};

export default definition;
