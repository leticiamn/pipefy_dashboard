import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, host: true, allowedHosts: ['.trycloudflare.com'], cors: { origin: 'https://app.pipefy.com' } },
  build: {
    rollupOptions: {
      input: {
        init: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
      },
      output: {
        // ECharts muda pouco: em arquivo próprio, fica no cache do navegador entre deploys.
        manualChunks: (id) =>
          id.includes('node_modules/echarts') || id.includes('node_modules/zrender') ? 'echarts' : undefined,
      },
    },
    chunkSizeWarningLimit: 700,
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
});
