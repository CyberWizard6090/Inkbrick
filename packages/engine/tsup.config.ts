import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/internal.ts'],
  format: ['esm'],
  target: 'es2022',
  // Только типы: JavaScript собирается по модулю на файл (scripts/build-modules.mjs), чтобы приложение выбрасывало
  // неиспользуемые модули целиком.
  dts: { only: true },
  clean: true,
  tsconfig: '../../tsconfig.build.json',
});
