import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  root,
  base:'./',
  publicDir:false,
  build:{
    outDir:'artifacts/encounter-lab/build',
    emptyOutDir:true,
    target:'es2020',
    rollupOptions:{input:fileURLToPath(new URL('../../encounter-lab.html',import.meta.url))},
  },
});
