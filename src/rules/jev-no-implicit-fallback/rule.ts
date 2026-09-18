import type { DecisionRuleDefinition } from '../decision-rule-types';

const definition: DecisionRuleDefinition = {
  meta: {
    scope: 'function',
  },
  include: ['source', 'signature', 'filePath'],
  criteria: [
    {
      id: 'business_default',
      label: '欠損入力の業務値補完',
      statement:
        '対象関数は、欠損した入力をguest・金額0・既定ステータス等の業務上有効な値に置き換え、業務判断を進めている。ただし表示・ログの整形、検索結果の不在をnullで返す処理、主要処理の外側のadapter等で明示的に行う入力正規化は含めない。',
    },
    {
      id: 'swallow_error',
      label: '失敗の成功値への置換',
      statement:
        '対象関数は、例外や不正値を失敗として伝えず、成功扱いになる既定値へ置き換えている。エラー結果を返すこと、表示・ログ用の代替表現、検索結果の不在表現は含めない。',
    },
    {
      id: 'continue_after_fill',
      label: '主要処理内の入力補完',
      statement:
        '対象関数はapplication/domainの主要処理を担い、外側から来た未指定入力を既定値で確定して、その値による業務判断や処理方針の決定を継続している。制御用入力も含むが、外側のadapterで完結する入力正規化、表示整形、探索の不在表現は含めない。',
    },
  ],
};

export default definition;
