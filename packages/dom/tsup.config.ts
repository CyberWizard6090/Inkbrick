import { defineConfig } from 'tsup';

export default defineConfig({
  // Каждая часть — свой вход (`@inkbrick/dom/color-picker`, `@inkbrick/dom/image-tools`): в бандл попадает только нужное.
  entry: [
    'src/index.ts',
    'src/color-picker/index.ts',
    'src/image-tools/index.ts',
    'src/code-highlight/index.ts',
    'src/keys/index.ts',
  ],
  format: ['esm'],
  target: 'es2022',
  // Только типы: JavaScript собирается по модулю на файл (scripts/build-modules.mjs), чтобы приложение выбрасывало
  // неиспользуемые модули целиком.
  dts: { only: true },
  clean: true,
  tsconfig: '../../tsconfig.build.json',
});
