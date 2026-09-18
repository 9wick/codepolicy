import type { TSchema } from '@sinclair/typebox';
import Ajv from 'ajv';
import { expect } from 'vitest';

import type { LlmResponse } from '../infrastructure/llm/llm-provider';
import type { NoulRequest, NoulResponse } from '../shared/decision-types';
import type { TokenUsage } from '../shared/types';

function expectUsageContract(usage: TokenUsage): void {
  const counts = [
    usage.inputTokens,
    usage.outputTokens,
    usage.reasoningTokens,
    usage.cacheReadInputTokens,
    usage.cacheCreationInputTokens,
  ];
  for (const count of counts) {
    expect(Number.isInteger(count)).toBe(true);
    expect(count).toBeGreaterThanOrEqual(0);
  }
}

export function expectDecisionContract(request: NoulRequest, response: NoulResponse): void {
  expect(response.model.length).toBeGreaterThan(0);
  expect(Object.keys(response.probabilities).sort()).toEqual(Object.keys(request.questions).sort());
  for (const probability of Object.values(response.probabilities)) {
    expect(Number.isFinite(probability)).toBe(true);
    expect(probability).toBeGreaterThanOrEqual(0);
    expect(probability).toBeLessThanOrEqual(1);
  }
  expectUsageContract(response.usage);
}

export function expectStructuredContract(schema: TSchema, response: LlmResponse<unknown>): void {
  const validate = new Ajv({ strict: false }).compile(schema);
  expect(validate(response.output), 'output must satisfy the requested JSON schema').toBe(true);
  expectUsageContract(response.usage);
}
