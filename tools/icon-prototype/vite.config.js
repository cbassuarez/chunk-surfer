import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
// Serves the repo's public/ so the prototype can point at real game assets.
export default defineConfig({
  root: path.resolve(import.meta.dirname),
  publicDir: path.resolve(import.meta.dirname, '../../public'),
  plugins: [react()],
  server: { port: 5199 },
});
