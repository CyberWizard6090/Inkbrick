import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Одна копия React на все пакеты монорепозитория: @inkbrick/dom иначе берёт свой React из devDependencies,
    // и в CI с React 18 у редактора хуки окна обрезки падают («Cannot read properties of null (reading 'useId')»).
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    passWithNoTests: true,
    setupFiles: ['tests/setup.ts'],
  },
});
