import { err, ok, type Result } from 'neverthrow';

export function isDecisionModel(model: string): boolean {
  return !model.includes('/') && model.startsWith('typesafe-');
}

export function toSdkModelId(model: string): Result<string, Error> {
  if (model === 'typesafe-jev') return ok('jev-latest');
  if (/^typesafe-jev-(?:latest|\d+\.\d+\.\d+)$/.test(model)) {
    return ok(model.slice('typesafe-'.length));
  }
  return err(new Error(`Unsupported TypeSafe model: "${model}".`));
}
