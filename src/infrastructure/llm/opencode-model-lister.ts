import { inject, injectable } from '@needle-di/core';
import { type Result, ResultAsync, err, ok } from 'neverthrow';

import { OpenCodeServerManager } from './opencode-server-manager';

export type OpencodeModel = {
  id: string;
  providerID: string;
  modelID: string;
  displayName: string;
};

function extractModels(res: {
  data?: {
    connected: string[];
    all: { id: string; models: Record<string, { id: string; name: string }> }[];
  };
}): Result<OpencodeModel[], Error> {
  if (!res.data) {
    return err(new Error('OpenCode provider.list returned no data'));
  }
  const connectedSet = new Set(res.data.connected);
  const models = res.data.all
    .filter((provider) => connectedSet.has(provider.id))
    .flatMap((provider) =>
      Object.values(provider.models).map((model) => ({
        id: `${provider.id}/${model.id}`,
        providerID: provider.id,
        modelID: model.id,
        displayName: model.name,
      })),
    );
  return ok(models);
}

@injectable()
export class OpenCodeModelLister {
  private serverManager = inject(OpenCodeServerManager);

  listModels(): ResultAsync<OpencodeModel[], Error> {
    return this.serverManager
      .acquire()
      .map(({ client }) => client)
      .andThen((client) =>
        ResultAsync.fromPromise(
          client.provider.list(),
          (e) =>
            new Error(
              `OpenCode provider.list failed: ${e instanceof Error ? e.message : String(e)}`,
            ),
        ),
      )
      .andThen(extractModels)
      .map((models) => {
        this.serverManager.release();
        return models;
      })
      .mapErr((error) => {
        this.serverManager.release();
        return error;
      });
  }
}
