import { beforeAll } from 'vitest';

beforeAll(() => {
  // Global test setup if needed
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Tests must be run with NODE_ENV=test');
  }
});
