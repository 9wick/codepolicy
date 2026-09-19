import { Type } from '@sinclair/typebox';
import { it } from 'vitest';

import { getAppContainer } from '../../shared/container';
import { expectStructuredContract } from '../../test-support/provider-contract';

import { OpenCodeProvider } from './opencode.adapter';

declare const CODEPOLICY_TEST_AGENT: string;

it('structured response satisfies the requested schema (live OpenCode)', async () => {
  const schema = Type.Object({ status: Type.Literal('ok') }, { additionalProperties: false });
  const provider = getAppContainer().get(OpenCodeProvider);
  const response = (
    await provider.generate({
      prompt: { system: 'Return only the requested JSON object.', user: 'Return status ok.' },
      config: { model: CODEPOLICY_TEST_AGENT },
      returnSchema: schema,
    })
  )._unsafeUnwrap();
  expectStructuredContract(schema, response);
}, 60_000);
