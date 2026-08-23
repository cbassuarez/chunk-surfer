import { defineConfig } from 'vite';

import { buildSystemMapSnapshot } from './snapshot.mjs';

export default defineConfig(async () => ({
  root: import.meta.dirname,
  publicDir: false,
  base: './',
  define: { __SYSTEM_MAP_SNAPSHOT__: JSON.stringify(await buildSystemMapSnapshot()) },
  build: {
    target: 'es2022',
    outDir: '../../dist-system-map',
    emptyOutDir: true,
  },
}));

