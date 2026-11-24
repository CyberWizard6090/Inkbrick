import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Только локально; с телефона в той же сети — `pnpm dev:phone` (он передаёт --host 0.0.0.0).
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  resolve: {
    // Две копии React ломают хуки («Invalid hook call»): пакеты монорепозитория всегда берут React приложения.
    dedupe: ['react', 'react-dom'],
  },
  plugins: [react()],
});
