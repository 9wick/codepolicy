import type { Container, Provider } from '@needle-di/core';

import { getAppContainer, resetAppContainer } from '../shared/container';

type TestContainerResult<T> = {
  target: T;
  container: Container;
};

export const createTestContainer = <T>(
  targetClass: new (...args: never[]) => T,
  providers?: Provider<unknown>[],
): TestContainerResult<T> => {
  resetAppContainer();
  const container = getAppContainer();
  if (providers) {
    for (const provider of providers) {
      container.bind(provider);
    }
  }
  const target = container.get(targetClass);
  return { target, container };
};
