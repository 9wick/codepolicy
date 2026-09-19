import type { DecisionRuleDefinition, EvidenceExpression } from '../decision-rule-types';

const userOrConfigBoundary: EvidenceExpression = {
  type: 'any',
  expressions: [
    { type: 'choice', criterionId: 'layer_role', choiceId: 'user_input_boundary' },
    { type: 'choice', criterionId: 'layer_role', choiceId: 'config_input_boundary' },
  ],
};

const definition: DecisionRuleDefinition = {
  meta: { scope: 'function' },
  include: ['source', 'signature', 'filePath', 'qualifiedSymbol'],
  criteria: [
    {
      id: 'layer_role',
      label: '関数の責務上の位置',
      type: 'choice',
      statement:
        'Using only filePath and qualifiedSymbol, classify the responsibility location of this function. Ignore its implementation body and do not judge whether any fallback is allowed.',
      choices: {
        user_input_boundary:
          'A controller, request handler, HTTP/CLI adapter, or equivalent ingress boundary that translates raw user input into an internal representation.',
        config_input_boundary:
          'A configuration loader or parser that translates raw environment, file, or CLI configuration into an internal representation.',
        internal_layer:
          'Application, domain, infrastructure processing, utility, repository, provider, or other code after an ingress/configuration boundary.',
        unclear:
          'The responsibility location cannot be inferred from filePath and qualifiedSymbol.',
      },
    },
    {
      id: 'external_input_default',
      label: 'raw境界入力の補完',
      type: 'choice',
      statement:
        'Considering the whole function, decide whether at least one operation replaces an absent or omitted raw HTTP, CLI, or configuration input received directly by this function with an ordinary concrete value. Do not include ordinary optional algorithm parameters, fields of an already constructed domain/application object, dependency results, or failures.',
      choices: {
        present:
          'At least one absent or omitted raw HTTP, CLI, or configuration input is replaced with an ordinary concrete value.',
        absent: 'No such raw boundary-input replacement occurs in this function.',
        unclear:
          'The code handles a possibly absent value, but whether it is raw boundary input cannot be determined.',
      },
    },
    {
      id: 'internal_value_default',
      label: '内部化済み値の補完',
      type: 'choice',
      statement:
        'Considering the whole function, decide whether at least one operation replaces absence in an already constructed domain/application value, parsed configuration, dependency result, or other internal value with an ordinary concrete value. Do not include raw HTTP, CLI, or configuration input received directly at its ingress parser, a final display-only placeholder that cannot flow back into business data, or observed failures.',
      choices: {
        present:
          'At least one already-internal value has its absent state replaced with an ordinary concrete value.',
        absent: 'No such internal-value replacement occurs in this function.',
        unclear:
          'The code replaces a possibly absent value, but whether the value is already internal cannot be determined.',
      },
    },
    {
      id: 'failure_conversion',
      label: '観測済み失敗の成功値化',
      type: 'choice',
      statement:
        'Considering the whole function, decide whether at least one failure explicitly observed through catch, rejection handling, Result matching, or an invalid-state check is replaced with an ordinary successful value. Do not infer a handled failure merely because a call might fail, and ignore absent-input handling.',
      choices: {
        present:
          'At least one explicitly observed failure is replaced with an ordinary successful value.',
        absent:
          'No observed failure is converted to success; failures are absent or remain explicit failures.',
        unclear:
          'The function handles a possible failure, but its outward disposition cannot be determined.',
      },
    },
  ],
  policy: {
    type: 'concerns',
    concerns: [
      {
        id: 'absence_normalization',
        label: '不在・未解決値の正常値化',
        outcomes: [
          {
            id: 'internal_value_collapse',
            verdict: 'violation',
            reason: '内部化済み値の不在を正常値へ変換',
            reasonKind: 'policy_result',
            when: {
              type: 'choice',
              criterionId: 'internal_value_default',
              choiceId: 'present',
            },
          },
          {
            id: 'external_default_outside_boundary',
            verdict: 'violation',
            reason: '境界外でraw入力の不在を正常値へ変換',
            reasonKind: 'policy_result',
            when: {
              type: 'all',
              expressions: [
                {
                  type: 'choice',
                  criterionId: 'external_input_default',
                  choiceId: 'present',
                },
                { type: 'choice', criterionId: 'layer_role', choiceId: 'internal_layer' },
              ],
            },
          },
          {
            id: 'allowed_boundary_default',
            verdict: 'pass',
            reason: '入力境界の責務としてraw入力を補完',
            reasonKind: 'policy_result',
            when: {
              type: 'all',
              expressions: [
                {
                  type: 'choice',
                  criterionId: 'external_input_default',
                  choiceId: 'present',
                },
                {
                  type: 'choice',
                  criterionId: 'internal_value_default',
                  choiceId: 'absent',
                },
                userOrConfigBoundary,
              ],
            },
          },
          {
            id: 'no_target_default',
            verdict: 'pass',
            reason: '対象となる境界入力・内部値の補完なし',
            reasonKind: 'policy_result',
            when: {
              type: 'all',
              expressions: [
                {
                  type: 'choice',
                  criterionId: 'external_input_default',
                  choiceId: 'absent',
                },
                {
                  type: 'choice',
                  criterionId: 'internal_value_default',
                  choiceId: 'absent',
                },
              ],
            },
          },
          {
            id: 'unclear_value_origin',
            verdict: 'borderline',
            reason: '補完対象が境界入力か内部値か判別不能',
            reasonKind: 'uncertain_observation',
            when: {
              type: 'any',
              expressions: [
                {
                  type: 'choice',
                  criterionId: 'external_input_default',
                  choiceId: 'unclear',
                },
                {
                  type: 'choice',
                  criterionId: 'internal_value_default',
                  choiceId: 'unclear',
                },
              ],
            },
          },
          {
            id: 'unclear_layer_role',
            verdict: 'borderline',
            reason: '関数の境界責務を位置情報から判断不能',
            reasonKind: 'insufficient_context',
            when: {
              type: 'all',
              expressions: [
                {
                  type: 'choice',
                  criterionId: 'external_input_default',
                  choiceId: 'present',
                },
                { type: 'choice', criterionId: 'layer_role', choiceId: 'unclear' },
              ],
            },
          },
        ],
      },
      {
        id: 'failure_conversion',
        label: '失敗の成功値化',
        outcomes: [
          {
            id: 'failure_converted',
            verdict: 'violation',
            reason: '失敗を成功値へ変換',
            reasonKind: 'policy_result',
            when: {
              type: 'choice',
              criterionId: 'failure_conversion',
              choiceId: 'present',
            },
          },
          {
            id: 'failure_not_converted',
            verdict: 'pass',
            reason: '失敗の成功値化なし',
            reasonKind: 'policy_result',
            when: {
              type: 'choice',
              criterionId: 'failure_conversion',
              choiceId: 'absent',
            },
          },
          {
            id: 'failure_unclear',
            verdict: 'borderline',
            reason: '失敗の外向き結果を判別不能',
            reasonKind: 'uncertain_observation',
            when: {
              type: 'choice',
              criterionId: 'failure_conversion',
              choiceId: 'unclear',
            },
          },
        ],
      },
    ],
  },
};

export default definition;
