import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.js'],
    globalSetup: ['./tests/globalSetup.js'],
    include: ['tests/**/*.test.js'],
    // Integration tests share one database; running files in parallel would
    // let one suite's TRUNCATE wipe another's fixtures mid-test.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
      thresholds: { lines: 80, branches: 75, functions: 80, statements: 80 },
    },
  },
});
