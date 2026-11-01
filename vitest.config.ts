import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/index.ts',
        'packages/react/src/icons/lucide.ts',
        'packages/react/src/math/mathCss.ts',
      ],
      reporter: ['text-summary', 'html', 'lcov'],
      thresholds: { lines: 92, statements: 90, functions: 90, branches: 80 },
    },
  },
});
