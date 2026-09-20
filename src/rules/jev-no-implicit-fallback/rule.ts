import type { DecisionRuleDefinition } from '../decision-rule-types';

const definition: DecisionRuleDefinition = {
  meta: { scope: 'function' },
  include: ['source', 'signature', 'filePath'],
  criteria: [
    {
      id: 'ambiguous_input_handling',
      label: '入力・設定の意味の喪失',
      type: 'choice',
      statement:
        'Considering the whole function, does handling NON-FAILURE missing or unresolved input, configuration, or data erase its meaning? First identify a relevant data-absence path, excluding caught exceptions, error Results and other operation-failure paths: those belong ONLY to the independent failure question, not also to this question. Without a separate data-absence path choose preserved_or_absent. Next infer what the absence represents from the data flow, signature and contextual purpose: for example unspecified user input, an unknown measurement, or a no-change instruction. Merely having different runtime values (undefined versus a number) does NOT establish different meanings. If the code supplies no basis for deciding semantic equivalence, choose unclear rather than assuming either loss or preservation. Equivalent representations preserve meaning; erasing unspecified/unknown/no-change information in favor of a determined value loses it. Technical data is not exempt. Do not decide whether the function is authorized: input/configuration boundaries can discard distinctions too. Choose meaning_lost if ANY relevant path loses meaning, even if other paths preserve it. Never classify only the primary behavior.',
      choices: {
        meaning_lost:
          'At least one NON-FAILURE absence carries a contextually identifiable meaning that is erased by treating it as an ordinary determined value or instruction. Both that meaning and its loss must be supported by context; optional types and replacement syntax alone do not establish them.',
        preserved_or_absent:
          'Every relevant path preserves the meaning, or no such input/data handling exists. Equivalent representations, a conventional domain-independent technical parameter, and explicit missing-value presentation retain meaning; their syntax alone is not data loss.',
        unclear:
          'No meaning loss is established, but the available code does not establish whether at least one handled absence means something distinct from its replacement. Do not invent a missing contract.',
      },
    },
    {
      id: 'failure_handling',
      label: '失敗の意味の喪失',
      type: 'choice',
      statement:
        'Considering the whole function, is at least one OBSERVED OPERATION FAILURE made indistinguishable from success? First establish an actual failure: a caught exception, rejected operation, error Result, or a checked state explicitly indicating that an operation failed. Merely unavailable, unmeasured, omitted, or unknown data does not establish an operation failure; its meaning belongs to the independent input/data question. Then inspect ALL outward failure channels, not just the return value: error Results, rejection, explicit error states, HTTP failure status, and nonzero process exit status. A failure remains observable if such a channel communicates it, even when a helper also returns null or another sentinel. Logging alone is not a failure channel. Choose meaning_lost if ANY actual failure loses all outward failure signaling, even if other failures are preserved. Do not infer failure from a call that could fail. Do not judge permission from the layer or function name.',
      choices: {
        meaning_lost:
          'At least one established operation failure is turned into ordinary success WITHOUT an outward error/failure signal. No returned error state, rejection, failure response, or failing process status distinguishes it from success.',
        preserved_or_absent:
          'There is no explicitly handled failure, or every handled failure remains distinguishable through an error Result, rejection, translated error, explicit failure state, or failing process/response status. A different representation of the same failure does not discard its meaning.',
        unclear:
          'A failure is handled, but the available code does not establish whether its outward result still communicates failure. Do not infer success merely from a return statement.',
      },
    },
  ],
  policy: {
    type: 'concerns',
    concerns: [
      {
        id: 'input_meaning',
        label: '入力・設定の意味の喪失',
        outcomes: [
          {
            id: 'input_loss_without_authority_context',
            verdict: 'borderline',
            reason: '入力・設定の意味の喪失を検出。解釈権限が未設定',
            reasonKind: 'insufficient_context',
            when: {
              type: 'choice',
              criterionId: 'ambiguous_input_handling',
              choiceId: 'meaning_lost',
            },
          },
          {
            id: 'input_meaning_preserved',
            verdict: 'pass',
            reason: '入力・設定の意味喪失なし',
            reasonKind: 'policy_result',
            when: {
              type: 'choice',
              criterionId: 'ambiguous_input_handling',
              choiceId: 'preserved_or_absent',
            },
          },
          {
            id: 'input_meaning_unclear',
            verdict: 'borderline',
            reason: '入力・設定の意味が保存されているか判断する材料が不足',
            reasonKind: 'insufficient_context',
            when: { type: 'choice', criterionId: 'ambiguous_input_handling', choiceId: 'unclear' },
          },
        ],
      },
      {
        id: 'failure_meaning',
        label: '失敗の意味の喪失',
        outcomes: [
          {
            id: 'failure_meaning_lost',
            verdict: 'violation',
            reason: '失敗の意味を失い、通常の成功として扱っている',
            reasonKind: 'policy_result',
            when: { type: 'choice', criterionId: 'failure_handling', choiceId: 'meaning_lost' },
          },
          {
            id: 'failure_meaning_preserved',
            verdict: 'pass',
            reason: '失敗の意味喪失なし',
            reasonKind: 'policy_result',
            when: {
              type: 'choice',
              criterionId: 'failure_handling',
              choiceId: 'preserved_or_absent',
            },
          },
          {
            id: 'failure_meaning_unclear',
            verdict: 'borderline',
            reason: '失敗の意味が保存されているか判断する材料が不足',
            reasonKind: 'insufficient_context',
            when: { type: 'choice', criterionId: 'failure_handling', choiceId: 'unclear' },
          },
        ],
      },
    ],
  },
};

export default definition;
