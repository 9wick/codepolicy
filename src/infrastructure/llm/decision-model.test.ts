import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { isDecisionModel, toSdkModelId } from './decision-model';

describe('TypeSafe model IDs', () => {
  it.each([
    ['typesafe-jev', 'jev-latest'],
    ['typesafe-jev-latest', 'jev-latest'],
    ['typesafe-jev-1.13.0', 'jev-1.13.0'],
  ])('maps %s to %s', (input, expected) => {
    expect(isDecisionModel(input)).toBe(true);
    expect(toSdkModelId(input)).toEqual(ok(expected));
  });
  it.each(['typesafe-', 'typesafe-jev-', 'typesafe-other', 'gpt-5.4', 'openai/typesafe-jev'])(
    'rejects unsupported %s',
    (model) => {
      expect(toSdkModelId(model).isErr()).toBe(true);
    },
  );
  it('leaves provider/model routing to existing providers', () => {
    expect(isDecisionModel('openai/typesafe-jev')).toBe(false);
  });
});
