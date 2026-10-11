import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: Number(process.env.VITE_DEV_PORT ?? 5173),
    // Playwright writes HTML reports and traces inside this folder. Watching
    // them makes Vite force-reload every open page mid-test, so one failing
    // scenario's trace would take the scenarios still running down with it.
    watch: { ignored: ['**/playwright-report/**', '**/test-results/**', '**/.playwright/**'] },
    // Keeps the browser on one origin in development, so CORS and cookies
    // behave the same locally as behind a reverse proxy. The target is
    // overridable so an end-to-end run can point at its own backend instance
    // instead of whatever the developer happens to have on :4000.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.{js,vue}'],
      thresholds: { lines: 45, functions: 45, branches: 60, statements: 45 },
    },
  },
});
