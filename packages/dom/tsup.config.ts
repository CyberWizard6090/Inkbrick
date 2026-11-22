import { defineConfig } from 'tsup';

export default defineConfig({
  // Каждая часть — свой вход (`@inkbrick/dom/color-picker`, `@inkbrick/dom/image-tools`): в бандл попадает только нужное.
  entry: ['src/index.ts', 'src/color-picker/index.ts', 'src/image-tools/index.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  tsconfig: '../../tsconfig.build.json',
});
