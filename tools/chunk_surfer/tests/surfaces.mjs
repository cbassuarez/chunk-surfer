// The architectural surface textures — the PBR arrays the world shader samples.
//
//   node tools/chunk_surfer/tests/surfaces.mjs
//
// Four vertical strips (albedo / normal / roughness / height), one 512px tile per array
// layer, built from real seam-tileable PBR sets. Five claims:
//   · surfaces.json is the v4 texture-array manifest.
//   · every architectural surface has a layer, a tile scale, and a real source.
//   · the albedo strip is a real PNG/JPEG, 512 wide, one square tile per layer.
//   · no surface collapsed to a flat swatch (each albedo tile has real variance).
//   · the normal strip is a lossless PNG (JPEG would wreck a normal map).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'public/labs/chunk-surfer/assets/surfaces');
const m = JSON.parse(fs.readFileSync(path.join(OUT, 'surfaces.json'), 'utf8'));
let pass = true;
const ck = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) pass = false; };

ck('surfaces.json is the v4 texture-array manifest', m.version === 4 && m.array?.tileSize === 512 && m.array.albedo && m.array.normal && m.array.rough && m.array.height,
  `v${m.version} ${m.array?.tileSize}px ×${m.array?.layers}`);

const surfaces = Object.entries(m.surfaces);
ck('every architectural surface binds a layer, a tile scale, and a real source',
  surfaces.length >= 10 && surfaces.every(([, s]) => Number.isInteger(s.layer) && s.tileMeters > 0 && s.present && s.source),
  `${surfaces.length} surfaces`);
ck('layers are unique and contiguous from 0',
  (() => { const ls = surfaces.map(([, s]) => s.layer).sort((a, b) => a - b); return ls.every((l, i) => l === i); })(),
  surfaces.map(([n, s]) => `${n}:${s.layer}`).join(' '));

// Minimal JPEG/PNG dimension read (no image library on the pure-node path).
function dims(file) {
  const b = fs.readFileSync(path.join(OUT, path.basename(file)));
  if (b.subarray(1, 4).toString() === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), kind: 'png' };
  let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const mk = b[i + 1]; if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), kind: 'jpg' }; i += 2 + b.readUInt16BE(i + 2); }
  return { w: 0, h: 0, kind: '?' };
}

const albedo = dims(m.array.albedo);
ck('the albedo strip is 512 wide, one square tile per layer',
  albedo.w === 512 && albedo.h === 512 * m.array.layers, `${albedo.w}×${albedo.h} (${albedo.kind})`);

ck('every surface records the real source maps it was built from',
  surfaces.every(([, s]) => s.maps?.color), surfaces.map(([n, s]) => `${n}:${s.maps?.color ? '✓' : '✗'}`).join(' '));

// A truly flat swatch reads ~0; smooth real textures (white ceramic, plain
// concrete) sit around 7–8, which is still real luminance detail.
ck('no surface collapsed to a flat swatch',
  surfaces.every(([, s]) => s.variance > 3), surfaces.map(([n, s]) => `${n}:${s.variance}`).join(' '));

ck('the normal strip is a lossless PNG', m.array.normal.endsWith('.png') && dims(m.array.normal).kind === 'png');
const height=dims(m.array.height);
ck('every surface has real height/displacement and the height strip is lossless',
  surfaces.every(([,s])=>s.maps?.height)&&height.kind==='png'&&height.w===512&&height.h===512*m.array.layers);
const shader=fs.readFileSync(path.join(ROOT,'public/labs/chunk-surfer/src/render/r3d.js'),'utf8');
ck('height, normal and roughness all alter lighting before final colour',
  shader.includes('uSurfHeight')&&shader.includes('viewTs*(h0-.5)')&&shader.includes('nm.xy+=vec2(hx,hy)')&&shader.includes('surfaceOcclusion')&&shader.includes('surfRough'));

console.log(pass ? '\n✅ SURFACES PASSED' : '\n❌ SURFACE FAILURES');
process.exit(pass ? 0 : 1);
