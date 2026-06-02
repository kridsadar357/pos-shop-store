import { defineConfig } from 'vitest/config';

// Integration tests only — require a running database (DATABASE_URL).
export default defineConfig({
  test: {
    include: ['**/*.int.test.ts'],
  },
});
