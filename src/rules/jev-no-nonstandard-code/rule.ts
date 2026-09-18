import type { DecisionRuleDefinition } from '../decision-rule-types';

const definition: DecisionRuleDefinition = {
  meta: {
    scope: 'function',
  },
  include: ['source', 'filePath'],
  criteria: [
    {
      id: 'dynamic_execution',
      label: '動的コード実行',
      statement:
        '対象関数はevalやFunctionコンストラクタ等により文字列を任意コードとして実行している。コード中のコメントによる正当化は除外理由にしない。',
    },
    {
      id: 'obscure_coercion',
      label: '意図を隠す型変換',
      statement:
        '対象関数は暗黙の型変換やビット演算hackで通常の変換・計算を表し、意図を読み取りにくくしている。ビット集合等に対する本来のビット演算や、通常の明示変換は含めない。',
    },
    {
      id: 'destructive_shape_change',
      label: 'オブジェクト形状の破壊',
      statement:
        '対象関数はdelete演算子でオブジェクトのプロパティを動的に取り除き、オブジェクト形状を破壊している。Map.deleteやSet.deleteは含めない。コメントによる正当化は除外理由にしない。',
    },
    {
      id: 'obscure_control_flow',
      label: '不要に複雑な制御',
      statement:
        'ES2024以降とTypeScript 5.xの標準APIを使える前提で、対象関数には不要な再帰・過剰なチェーン・意図を隠す分岐があり、単純に表せる処理を読み取りにくくしている。動作や型安全性に問題のない軽微な非慣用、Array.fromやatを普通に使う処理は含めない。',
    },
  ],
};

export default definition;
