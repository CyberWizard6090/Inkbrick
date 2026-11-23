import { defineConfig } from 'tsup';

export default defineConfig({
  // `markdown` — отдельная точка входа: разбор Markdown не попадает в основной бандл.
  entry: ['src/index.ts', 'src/markdown.ts'],
  format: ['esm'],
  target: 'es2022',
  // Только типы: JavaScript собирается по модулю на файл (scripts/build-modules.mjs), чтобы приложение выбрасывало
  // неиспользуемые модули целиком.
  dts: { only: true },
  clean: true,
  tsconfig: '../../tsconfig.build.json',
});
