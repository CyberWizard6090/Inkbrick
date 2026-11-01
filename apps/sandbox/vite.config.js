import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// HOST=0.0.0.0 нужен внутри Docker; VITE_USE_POLLING=true — для bind-mount на Windows/macOS.
export default defineConfig({
  server: {
    host: process.env.HOST ?? '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: process.env.VITE_USE_POLLING === 'true' ? { usePolling: true } : undefined,
  },
  preview: {
    host: process.env.HOST ?? '127.0.0.1',
    port: 4173,
  },
  resolve: {
    // Две копии React ломают хуки («Invalid hook call»): пакеты монорепозитория всегда берут React приложения.
    dedupe: ['react', 'react-dom'],
  },
  plugins: [react()],
});
