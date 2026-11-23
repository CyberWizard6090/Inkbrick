import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string, file = 'index.ts') =>
  fileURLToPath(new URL(`../../packages/${name}/src/${file}`, import.meta.url));

/**
 * Нагрузочные тесты: большие документы и длинные серии правок с порогами по времени. Отдельно от обычных тестов
 * (`pnpm test:load`): они медленнее и меряют время, поэтому идут одним процессом, без параллельных соседей.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@inkbrick/document/markdown': pkg('document', 'markdown.ts'),
      '@inkbrick/document': pkg('document'),
      '@inkbrick/store': pkg('store'),
      '@inkbrick/engine/internal': pkg('engine', 'internal.ts'),
      '@inkbrick/engine': pkg('engine'),
      // Каталог: подпути (`@inkbrick/dom/image-tools`) разрешаются внутрь него.
      '@inkbrick/dom': fileURLToPath(new URL('../../packages/dom/src', import.meta.url)),
      '@inkbrick/locales': fileURLToPath(
        new URL('../../packages/locales/src/index.ts', import.meta.url),
      ),
      '@inkbrick/react': pkg('react'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['**/*.load.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
  },
});
