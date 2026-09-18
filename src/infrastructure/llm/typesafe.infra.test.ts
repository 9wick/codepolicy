import { it } from 'vitest';

import { getAppContainer } from '../../shared/container';
import type { NoulRequest } from '../../shared/decision-types';
import { expectDecisionContract } from '../../test-support/provider-contract';

import { toSdkModelId } from './decision-model';
import { CreateDecisionClient } from './typesafe-client';
import { createDecisionProvider } from './typesafe-provider';

declare const CODEPOLICY_TEST_JEV_MODEL: string;

it('decision response satisfies the requested question contract (live TypeSafe)', async () => {
  const request: NoulRequest = {
    model: toSdkModelId(CODEPOLICY_TEST_JEV_MODEL)._unsafeUnwrap(),
    state: { value: '2' },
    questions: { check: { type: 'noul', instructions: 'The value equals 2.' } },
  };
  const provider = createDecisionProvider(getAppContainer().get(CreateDecisionClient));
  const response = (await provider.ask(request))._unsafeUnwrap();
  expectDecisionContract(request, response);
}, 60_000);
