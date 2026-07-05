import { Type } from '@sinclair/typebox';

export const ruleLevelSchema = Type.Union([
  Type.Literal('error'),
  Type.Literal('warn'),
  Type.Literal('off'),
]);

export const configFilterSchema = Type.Union([Type.Literal('diff'), Type.Literal('all')], {
  default: 'diff',
});

export const ruleScopeSchema = Type.Union([
  Type.Literal('function'),
  Type.Literal('exported-function'),
  Type.Literal('test-case'),
  Type.Literal('file'),
  Type.Literal('type'),
  Type.Literal('interface'),
]);

export const borderlineHandlingSchema = Type.Union([
  Type.Literal('error'),
  Type.Literal('warn'),
  Type.Literal('off'),
]);

export const ruleConfigSchema = Type.Union([
  ruleLevelSchema,
  Type.Object({
    level: ruleLevelSchema,
    borderline: Type.Optional(borderlineHandlingSchema), // default 'warn'
  }),
]);

export const overrideEntrySchema = Type.Object({
  files: Type.Array(Type.String(), { minItems: 1 }),
  ignores: Type.Optional(Type.Array(Type.String())),
  rules: Type.Record(Type.String(), ruleConfigSchema),
});

export const codepolicyConfigFileSchema = Type.Object(
  {
    $schema: Type.Optional(Type.String()),
    filter: Type.Optional(configFilterSchema),
    base: Type.Optional(
      Type.String({
        description:
          'Git ref to diff against (e.g. "origin/main"). Only used when filter is "diff". Overridden by CLI --base.',
      }),
    ),
    rulePaths: Type.Optional(
      Type.Array(Type.String(), {
        minItems: 1,
        description: 'Paths to project-specific rule modules.',
      }),
    ),
    agent: Type.String({
      description:
        'Default LLM agent for all rules (e.g. "github-copilot/gpt-4.1"). Overridden by CLI --agent.',
    }),
    concurrency: Type.Optional(
      Type.Integer({
        minimum: 1,
        description:
          'Number of parallel LLM evaluations (default: 10). LLM calls are I/O-bound; values up to 30-50 are usually safe if the provider rate limit allows. Overridden by CLI --concurrency.',
      }),
    ),
    rules: Type.Record(Type.String(), ruleConfigSchema),
    ignore: Type.Optional(Type.Array(Type.String())),
    overrides: Type.Optional(Type.Array(overrideEntrySchema)),
  },
  {
    $id: 'https://codepolicy.dev/schemas/codepolicy-config.schema.json',
    additionalProperties: false,
    title: 'Codepolicy Config',
  },
);

export const verdictLabelSchema = Type.Union([
  Type.Literal('violation'),
  Type.Literal('borderline'),
  Type.Literal('pass'),
]);

// proposer の LLM 出力（フィールド順 = 生成順 = 推論順）
export const judgeProposalSchema = Type.Object(
  {
    citations: Type.Array(Type.String(), {
      description:
        '違反の根拠となる対象コードからの逐語的な引用。違反がなければ空配列。対象コードに実在しない文字列を捏造しないこと。',
    }),
    matchedCriterion: Type.Union([Type.String(), Type.Null()], {
      description: 'チェック観点のうち該当した違反基準の要約。違反がなければ null。',
    }),
    reasoning: Type.String({ minLength: 1, description: '判定理由。' }),
    verdict: verdictLabelSchema,
  },
  {
    additionalProperties: false,
    description:
      'セマンティックlintの一次判定。violation は citations と matchedCriterion を提示できる場合のみ。確信が持てない場合は borderline。',
  },
);

// verifier の LLM 出力
export const judgeVerificationSchema = Type.Object(
  {
    reasoning: Type.String({ minLength: 1 }),
    result: Type.Union([
      Type.Literal('confirmed'),
      Type.Literal('dismissed'),
      Type.Literal('inconclusive'),
    ]),
  },
  { additionalProperties: false },
);
