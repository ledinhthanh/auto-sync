import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
    fileParallelism: false,
    sequence: {
      shuffle: false,
      concurrent: false,
    },
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/services/**'],
      thresholds: {
        lines: 70,
        functions: 70,
      },
    },
    setupFiles: ['tests/setup.ts'],
  },
});
