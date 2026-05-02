import path from 'node:path';

export function resolveConfigPath(workingDir: string, configPath?: string): string {
  return path.resolve(workingDir, configPath ?? '.codepolicy.yml');
}

export function resolveConfigDir(workingDir: string, configPath?: string): string {
  return path.dirname(resolveConfigPath(workingDir, configPath));
}
