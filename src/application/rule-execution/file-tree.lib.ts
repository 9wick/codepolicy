import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { ResultAsync, ok } from 'neverthrow';

const execFileAsync = promisify(execFile);

export function generateFileTree(workingDir: string): ResultAsync<string | undefined, never> {
  return ResultAsync.fromPromise(
    execFileAsync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
      cwd: workingDir,
      maxBuffer: 1024 * 1024,
    }),
    () => new Error('git ls-tree failed'),
  )
    .map(({ stdout }) => stdout.trim())
    .orElse(() => ok(undefined));
}
