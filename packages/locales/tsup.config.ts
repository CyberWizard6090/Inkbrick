import { defineConfig } from 'tsup';

export default defineConfig({
  // Каждый файл `src/<код>.ts` — отдельный вход и отдельный чанк: приложение подгружает только нужный язык
  // (`import('@inkbrick/locales/ru')`). Новый язык подхватывается сам, список здесь править не нужно.
  entry: ['src/*.ts'],
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
