import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve('src/web'),
  plugins: [react(), tailwindcss()],
  build: { outDir: path.resolve('dist/web'), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/media': 'http://127.0.0.1:3000',
      '/ws': { target: 'ws://127.0.0.1:3000', ws: true },
    },
  },
});
