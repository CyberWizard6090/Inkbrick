import { resolve } from 'node:path';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// HOST=0.0.0.0 нужен внутри Docker; allowedHosts — имя сервиса compose, по которому e2e-контейнер ходит на dev-сервер.
export default defineConfig({
  server: {
    host: process.env.HOST ?? '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['dev'],
  },
  preview: {
    host: process.env.HOST ?? '127.0.0.1',
    port: 4173,
  },
  resolve: {
    // Две копии React ломают хуки («Invalid hook call»): пакеты монорепозитория всегда берут React приложения.
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // Вторая страница — прототип совместного редактирования (collab.html).
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        collab: resolve(import.meta.dirname, 'collab.html'),
      },
    },
  },
  plugins: [react()],
});
