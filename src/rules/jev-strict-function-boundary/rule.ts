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
        '対象関数は業務判断を担い、optional・undefined・Partial・広いunionで表された未検証または未確定の入力を主要処理の契約として受け入れている。単なる変換、parser、探索、入力境界の検証処理は含めない。',
    },
    {
      id: 'ambiguous_success',
      label: '曖昧な成功結果',
      statement:
        '対象関数は業務判断を担うが、成功結果の欠損や未確定をnull・undefined等で返し、その意味の業務判断を呼び出し側へ押し戻している。検索や参照取得で見つからないことを返す場合、明示的な成功失敗の判別型は含めない。',
    },
    {
      id: 'repeated_preconditions',
      label: '広い契約による前提分岐',
      statement:
        '対象関数は業務の主要処理を担い、入力契約が未確定状態を許すため、本来外側で確定すべき前提の確認や場合分けを内部で行っている。業務規則に必要な分岐、parser、探索、境界での検証自体は含めない。',
    },
    {
      id: 'internal_normalization',
      label: '主要処理内の正規化',
      statement:
        '対象関数はapplication/domainの主要処理を担い、外側入力やexecution optionの未指定値を内部で既定値に置き換えて意味を確定している。adapter等の入力境界での正規化、単なるデータ変換や探索用の補助関数は含めない。',
    },
  ],
};

export default definition;
