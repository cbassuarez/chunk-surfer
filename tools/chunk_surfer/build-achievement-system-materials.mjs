#!/usr/bin/env node
// CPU-only build. No browser, GPU, game state, network, or authored icon paths.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(root, 'artifacts/achievement-system-directions');
await mkdir(out, { recursive: true });
const entry = 'src/dev/achievement-system-materials.js';
const bundlePath = path.join(out, 'achievement-material-core.iife.js');
await build({ entryPoints: [path.join(root, entry)], outfile: bundlePath,
  bundle: true, format: 'iife', globalName: 'AchievementSystemMaterials',
  platform: 'browser', target: ['es2020'], minify: true, legalComments: 'none' });

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const paperSource = 'assets/paper/inspect/work-order-ffc40254-0.webp';
// Protected left margin: no document wording, marks, folds or printed rules.
const crop = { left: 24, top: 576, width: 112, height: 256 };
const stock = await sharp(path.join(root, paperSource)).extract(crop).png().toBuffer();
await writeFile(path.join(out, 'paper-stock.png'), stock);
const fonts = [];
for (const [file, family, weight] of [
  ['NimbusSans-Regular.otf', 'Hardware Sans', '400'],
  ['NimbusSans-Bold.otf', 'Hardware Sans', '600 800'],
  ['NimbusMonoPS-Regular.otf', 'Nimbus Mono PS', '400'],
  ['NimbusRoman-Regular.otf', 'Nimbus Roman', '400'],
]) {
  const source = `public/assets/fonts/${file}`;
  const bytes = await readFile(path.join(root, source));
  fonts.push({ family, weight, source, bytes: bytes.length, sha256: sha(bytes),
    dataUrl: `data:font/otf;base64,${bytes.toString('base64')}` });
}
const assets = { schema: 1,
  paper: { source: paperSource, sourceSha256: sha(await readFile(path.join(root, paperSource))),
    crop, bytes: stock.length, sha256: sha(stock), dataUrl: `data:image/png;base64,${stock.toString('base64')}`,
    note: 'Unprinted protected margin from the existing approved paper-production bake. Crop is not a new material simulation.' },
  fonts,
  fontLicense: ['public/assets/fonts/LICENSE.urw-base35.txt', 'public/assets/fonts/COPYING.urw-base35.txt'],
};
await writeFile(path.join(out, 'material-assets.json'), JSON.stringify(assets));
const sources = [entry, 'src/render/instrument-material.js', 'src/render/hardware-faceplate.js',
  'src/render/hardware-material.js', 'src/render/electronic-text.js', 'src/render/vfd-font.js'];
const manifest = { generatedAt: new Date().toISOString(), globalName: 'AchievementSystemMaterials',
  bundleBytes: (await stat(bundlePath)).size,
  assetsBytes: (await stat(path.join(out, 'material-assets.json'))).size,
  sources: await Promise.all(sources.map(async source => ({ source, sha256: sha(await readFile(path.join(root, source))) }))),
  evidence: 'Exact production Canvas primitives, bundled without behavior or save state. CPU build only; no claim of native-game, world-dither, or human acceptance.' };
await writeFile(path.join(out, 'material-core-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ bundlePath, ...manifest, sources: manifest.sources.length }));
