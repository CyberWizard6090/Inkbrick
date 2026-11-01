import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // Тест читает исходный CSS через ?raw; по умолчанию Vitest подменяет CSS пустой строкой.
    css: { include: /.+/ },
  },
});
