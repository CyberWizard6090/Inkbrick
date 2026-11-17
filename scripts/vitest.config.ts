import { defineConfig } from 'vitest/config';

/** Проверки репозитория целиком (словари, границы пакетов): видят и пакеты, и песочницу. */
export default defineConfig({
  test: {
    name: 'scripts',
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
