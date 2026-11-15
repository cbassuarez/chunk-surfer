import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  plugins: [react()],
  cacheDir: '../../node_modules/.vite-studio-build',
  resolve: { dedupe: ['react', 'react-dom'] },
  build: { outDir: '../../dist-studio', emptyOutDir: true, target: 'es2022' },
  server: { fs: { allow: ['../..'] } },
});
