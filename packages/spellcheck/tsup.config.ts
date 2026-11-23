import { defineConfig } from 'tsup';

export default defineConfig({
  // Основной вход и скрипт Web Worker (`@inkbrick/spellcheck/worker`): приложение запускает его своим сборщиком.
  entry: ['src/index.ts', 'src/worker.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  tsconfig: '../../tsconfig.build.json',
});
