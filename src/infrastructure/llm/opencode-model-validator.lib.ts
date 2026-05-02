import { type OpencodeClient } from '@opencode-ai/sdk/v2';
import { ResultAsync, err, ok } from 'neverthrow';

export type ModelRef = { providerID: string; modelID: string };

function validateModelExists(client: OpencodeClient, model: ModelRef): ResultAsync<void, Error> {
  return ResultAsync.fromPromise(
    client.provider.list(),
    (cause) =>
      new Error(
        `OpenCode API request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
  ).andThen((res) => {
    if (!res.data) return err(new Error('Failed to fetch OpenCode provider list'));
    const provider = res.data.all.find((p) => p.id === model.providerID);
    if (!provider) {
      const available = res.data.all.map((p) => p.id).join(', ');
      return err(
        new Error(`OpenCode provider "${model.providerID}" not found. Available: ${available}`),
      );
    }
    if (provider.models[model.modelID] === undefined) {
      const available = Object.keys(provider.models).slice(0, 10).join(', ');
      return err(
        new Error(
          `Model "${model.modelID}" not found in provider "${model.providerID}". Available: ${available}`,
        ),
      );
    }
    return ok(undefined);
  });
}

// `provider.list()` is hundreds of milliseconds per call and otherwise repeats for every evaluation.
// Memoize per (client, providerID/modelID) so we only ever validate each model once per server lifetime.
const validatedModelsByClient = new WeakMap<
  OpencodeClient,
  Map<string, ResultAsync<void, Error>>
>();

export function validateModelExistsMemoized(
  client: OpencodeClient,
  model: ModelRef,
): ResultAsync<void, Error> {
  const key = `${model.providerID}/${model.modelID}`;
  const existingMap = validatedModelsByClient.get(client);
  const cache = existingMap ?? new Map<string, ResultAsync<void, Error>>();
  if (!existingMap) validatedModelsByClient.set(client, cache);

  const cached = cache.get(key);
  if (cached) return cached;

  const validation = validateModelExists(client, model);
  cache.set(key, validation);
  return validation;
}
