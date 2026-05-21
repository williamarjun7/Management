import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/lib/__tests__/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    sequence: { concurrent: false },
  },
});
