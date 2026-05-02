import { injectable } from '@needle-di/core';

export interface Disposable {
  shutdown(): Promise<void>;
}

@injectable()
export class LifecycleManager {
  private disposables: Disposable[] = [];

  register(disposable: Disposable): void {
    this.disposables.push(disposable);
  }

  async shutdown(): Promise<void> {
    for (const disposable of this.disposables) {
      await disposable.shutdown();
    }
    this.disposables = [];
  }
}
