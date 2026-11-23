import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/internal.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  tsconfig: '../../tsconfig.build.json',
  // Кириллица в словарях — как есть, без \uXXXX: строки короче, приложение легче.
  esbuildOptions(options) {
    options.charset = 'utf8';
  },
});
