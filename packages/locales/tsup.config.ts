import { defineConfig } from 'tsup';

export default defineConfig({
  // Каждый язык — свой файл: приложение подгружает только нужный (`import('@inkbrick/locales/ru')`).
  entry: ['src/index.ts', 'src/ru.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  tsconfig: '../../tsconfig.build.json',
  // Кириллица в словарях — как есть, без \uXXXX: строки короче, приложение легче.
  esbuildOptions(options) {
    options.charset = 'utf8';
  },
});
