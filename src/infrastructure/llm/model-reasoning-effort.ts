import { err, ok } from 'neverthrow';
import type { Result } from 'neverthrow';

import type { ModelReasoningEffort } from '../../shared/types';

export function parseModelReasoningEffort(
  effort: string | undefined,
): Result<ModelReasoningEffort | undefined, Error> {
  if (effort === undefined) {
    return ok(undefined);
  }

  if (
    effort === 'minimal' ||
    effort === 'low' ||
    effort === 'medium' ||
    effort === 'high' ||
    effort === 'xhigh'
  ) {
    return ok(effort);
  }

  return err(
    new Error(
      `Unsupported reasoning effort: "${effort}". Supported values: minimal, low, medium, high, xhigh`,
    ),
  );
}
