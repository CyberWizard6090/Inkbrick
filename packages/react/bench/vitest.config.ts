import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string) => fileURLToPath(new URL(`../../${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@inkbrick/document': pkg('document'),
      '@inkbrick/store': pkg('store'),
      '@inkbrick/engine': pkg('engine'),
      '@inkbrick/react': pkg('react'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: ['bench/**/*.bench.tsx'],
    environment: 'jsdom',
    testTimeout: 600_000,
    pool: 'forks',
    execArgv: ['--expose-gc', '--stack-size=4000'],
  },
});
