// The ear room's prop pack. Blender makes every mesh and the take sheet's image
// (build-stop-listening.py); this wrapper checks the result against the runtime's
// strict glTF subset and writes the files the game and the specs read.
//
//   node tools/chunk_surfer/build-stop-listening.mjs
//
// Isolated: it never rebuilds a shared pack. Outputs:
//   public/assets/stop-listening.glb                 the pack (r3d loads it optionally)
//   public/assets/stop-listening.{stats,credits}.json
//   src/data/generated/stop-listening-geometry.js    bounds, for wall contact and specs
//   assets/paper/inspect/stop-listening-take-sheet.webp   what [E] on the sheet reads
// Work files (.blend, the raw renders) stay in artifacts/stop-listening/.

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { STOP_LISTENING_MESH, STOP_LISTENING_SHEET_DOCUMENT } from '../../src/data/stop-listening.js';

const root = path.resolve(import.meta.dirname, '../..');
const work = path.join(root, 'artifacts/stop-listening');
const script = path.join(import.meta.dirname, 'build-stop-listening.py');
const out = path.join(root, 'public/assets/stop-listening.glb');
const stats = path.join(root, 'public/assets/stop-listening.stats.json');
const credits = path.join(root, 'public/assets/stop-listening.credits.json');
const geometry = path.join(root, 'src/data/generated/stop-listening-geometry.js');
const sheetOut = path.join(root, STOP_LISTENING_SHEET_DOCUMENT.path);
const working = path.join(work, 'stop-listening.working.glb');
const report = path.join(work, 'stop-listening-build.json');
const sheetPng = path.join(work, 'take-sheet.png');

fs.mkdirSync(work, { recursive: true });
const blender = process.env.BLENDER_BIN || (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const run = cp.spawnSync(blender, ['--background', '--factory-startup', '--python', script, '--',
  '--output', working, '--report', report, '--sheet', sheetPng, '--work', work,
  '--blend', path.join(work, 'stop-listening.blend')], { stdio: ['ignore', 'pipe', 'inherit'] });
if (run.error) throw run.error;
const log = run.stdout.toString();
if (run.status !== 0) { process.stdout.write(log); throw new Error(`Blender exited ${run.status}`); }
process.stdout.write(log.split('\n').filter((line) => line.startsWith('STOP LISTENING')).join('\n') + '\n');

// ── the runtime's glTF subset ───────────────────────────────────────────────
function chunks(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('not a GLB 2');
  let at = 12, json = null, bin = null;
  while (at < bytes.length) {
    const n = bytes.readUInt32LE(at), kind = bytes.readUInt32LE(at + 4), body = bytes.subarray(at + 8, at + 8 + n);
    if (kind === 0x4e4f534a) json = JSON.parse(body.toString('utf8').trim());
    if (kind === 0x004e4942) bin = Buffer.from(body);
    at += 8 + n;
  }
  if (!json || !bin) throw new Error('GLB missing JSON or BIN');
  return { json, bin };
}
const strip = (v) => { if (!v || typeof v !== 'object') return; delete v.extensions; delete v.extras; for (const c of Object.values(v)) strip(c); };
const { json, bin } = chunks(fs.readFileSync(working));
delete json.extensionsUsed; delete json.extensionsRequired; strip(json);
if (json.animations || json.skins || json.accessors.some((a) => a.sparse)) throw new Error('unsupported dynamic GLB');
if (json.nodes.some((n) => n.matrix || n.translation || n.rotation || n.scale || n.children?.length)) throw new Error('identity flat roots required');
for (const mesh of json.meshes) for (const p of mesh.primitives) {
  if ((p.mode ?? 4) !== 4 || !Number.isInteger(p.indices)) throw new Error(`${mesh.name}: indexed triangles required`);
  if (!Number.isInteger(p.attributes.NORMAL)) throw new Error(`${mesh.name}: normals required`);
  if (p.targets?.length) throw new Error(`${mesh.name}: morph targets unsupported`);
}
for (const m of json.materials || []) if (m.alphaMode && !['OPAQUE', 'MASK'].includes(m.alphaMode)) throw new Error(`${m.name}: ${m.alphaMode}`);
const expected = [...STOP_LISTENING_MESH.ears, ...STOP_LISTENING_MESH.heaps,
  ...Object.values(STOP_LISTENING_MESH.writing).flatMap((name) => [name, `${name}_pale`]), STOP_LISTENING_MESH.sheet];
const names = json.meshes.map((m) => m.name).sort();
if (JSON.stringify(names) !== JSON.stringify([...expected].sort())) throw new Error(`mesh catalogue mismatch:\n${names}\n${[...expected].sort()}`);

const pad = (buf, fill) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, fill)]);
const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20);
const binChunk = pad(bin, 0);
const head = Buffer.alloc(12); head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
const ch = (kind, body) => { const h = Buffer.alloc(8); h.writeUInt32LE(body.length, 0); h.writeUInt32LE(kind, 4); return Buffer.concat([h, body]); };
fs.writeFileSync(out, Buffer.concat([head, ch(0x4e4f534a, jsonChunk), ch(0x004e4942, binChunk)]));

// ── what the game and the specs read ────────────────────────────────────────
const built = JSON.parse(fs.readFileSync(report, 'utf8'));
const bounds = Object.fromEntries(Object.entries(built.meshes).sort().map(([name, m]) => [name, m.bounds]));
fs.writeFileSync(geometry, `// Generated by tools/chunk_surfer/build-stop-listening.mjs. Do not edit.
// Runtime-axis bounds (metres) of the ear room's meshes, for wall contact and specs.
export const STOP_LISTENING_BOUNDS = Object.freeze(${JSON.stringify(bounds)});
`);
fs.writeFileSync(stats, `${JSON.stringify({
  bytes: fs.statSync(out).size, triangles: built.triangles,
  meshes: Object.fromEntries(Object.entries(built.meshes).sort().map(([name, m]) => [name, { triangles: m.triangles, materials: m.materials }])),
}, null, 2)}\n`);
fs.writeFileSync(credits, `${JSON.stringify({
  pack: 'stop-listening',
  source: 'Modelled procedurally in Blender by tools/chunk_surfer/build-stop-listening.py; no third-party meshes or textures.',
  fonts: 'Take sheet set in the vendored URW base35 faces (assets/fonts, AGPL-3.0 with the font embedding exception).',
}, null, 2)}\n`);
fs.mkdirSync(path.dirname(sheetOut), { recursive: true });
await sharp(sheetPng).webp({ quality: 88 }).toFile(sheetOut);
console.log(`wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB), ${path.relative(root, sheetOut)}`);
