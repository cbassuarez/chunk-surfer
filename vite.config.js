import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAPER_WORLD_MATERIAL } from './src/data/paper-world-material.js';

const host = process.env.TAURI_DEV_HOST;
const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

// Paper URLs are catalog-owned runtime paths. Vite's development server can
// read the canonical root assets, but a production build copies only public/.
// Emit the exact compiled sheets and coverage atlas into the same paths so
// the shipped renderer does not silently lose documents after packaging.
function physicalPaperRuntimeAssets() {
  return {
    name: 'physical-paper-runtime-assets',
    apply: 'build',
    generateBundle() {
      const catalog = JSON.parse(readFileSync(new URL('./assets/paper/catalog.json', import.meta.url), 'utf8'));
      const paths = new Set(['assets/paper/world-atlas.webp', 'assets/paper/world-pigment.png', PAPER_WORLD_MATERIAL.path]);
      for (const document of Object.values(catalog.documents)) for (const page of document.pages) {
        paths.add(page.path);
        if (page.materialPath) paths.add(page.materialPath);
      }
      for (const fileName of [...paths].sort()) {
        if (!fileName.startsWith('assets/paper/') || fileName.includes('..')) throw new Error(`Invalid paper runtime path: ${fileName}`);
        this.emitFile({type:'asset',fileName,source:readFileSync(resolve(import.meta.dirname,fileName))});
      }
    },
  };
}

export default defineConfig({
  plugins: [physicalPaperRuntimeAssets()],
  base: './',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    target: 'es2020',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        fireballCast: resolve(import.meta.dirname, 'fireball-cast.html'),
        windowMedia: resolve(import.meta.dirname, 'window-media.html'),
        sourceDesktop: resolve(import.meta.dirname, 'source-desktop-surface.html'),
      },
    },
  }
});
