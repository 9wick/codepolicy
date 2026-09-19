import type { DecisionRuleDefinition } from '../decision-rule-types';

const definition: DecisionRuleDefinition = {
  meta: {
    scope: 'exported-function',
    usesFileTree: true,
  },
  include: ['source', 'signature', 'name', 'filePath', 'fileTree'],
  criteria: [
    {
      id: 'misplaced_responsibility',
      label: 'パスと責務の不一致',
      statement:
        '対象関数の責務が、filePathとfileTreeから読み取れる現在のファイル・ディレクトリの責務と明らかに食い違っている。単なる名称の不一致や、他によりよい配置が考えられる程度の改善余地は含めない。',
    },
    {
      id: 'wrong_layer',
      label: 'layerと責務の不一致',
      statement:
        '対象関数の処理は、filePathとfileTreeが示す現在のアーキテクチャlayerの役割を明らかに越えている。ディレクトリ名だけで役割を確定できない場合や、軽微な配置改善の余地は含めない。',
    },
  ],
};

export default definition;
