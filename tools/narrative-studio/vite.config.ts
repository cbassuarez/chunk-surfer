import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  plugins: [react()],
  build: { outDir: '../../dist-studio', emptyOutDir: true, target: 'es2022' },
  server: { fs: { allow: ['../..'] } },
});
