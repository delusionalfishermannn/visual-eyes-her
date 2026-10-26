import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/visual-eyes-her/',
  server: {
    port: 5173,
    host: '0.0.0.0',
    open: false,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
