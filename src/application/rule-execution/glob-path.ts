import path from 'node:path';

export function normalizeGlobPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
