import { injectable } from '@needle-di/core';
import simpleGit from 'simple-git';

@injectable()
export class SimpleGitClient {
  diff(base: string = 'HEAD'): Promise<string> {
    return simpleGit().diff([base]);
  }

  verifyRef(ref: string): Promise<string> {
    return simpleGit().raw(['rev-parse', '--verify', ref]);
  }
}
