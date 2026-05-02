import { afterAll } from 'vitest';

import { destroyAppContainer } from './src/shared/container';

afterAll(async () => {
  await destroyAppContainer();
});
