import { defineConfig, configDefaults } from 'vitest/config';

// Default suite = fast, DB-free unit tests. Integration tests (*.int.test.ts)
// require a database and are run separately via `npm run test:integration`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.int.test.ts'],
  },
});
