// Build the heating header's christmas tree in Blender.
//
//   npm run assets:plant-header
//
// Writes tools/chunk_surfer/prop-sources/plant_header_manifold.glb, which
// build-props.mjs then imports over the procedural mesh of the same name (see
// SOURCES there). Running this is optional: a missing file leaves the fallback
// in place and the game builds exactly as before, which is the same contract
// every other imported prop has.
//
// The Blender binary is resolved the way build-vegetation.mjs resolves it, so
// BLENDER_BIN overrides on machines that keep it somewhere else.

import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(import.meta.dirname, 'build-plant-header.py');
const OUT_DIR = path.join(import.meta.dirname, 'prop-sources');
const OUT = path.join(OUT_DIR, 'plant_header_manifold.glb');
const REPORT = path.join(OUT_DIR, 'plant_header_manifold.report.json');

const blender = process.env.BLENDER_BIN
  || (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');

const fail = (message) => { console.error(`plant header: ${message}`); process.exit(1); };

if (!fs.existsSync(blender)) fail(`Blender executable does not exist: ${blender}`);
if (!fs.existsSync(SCRIPT)) fail(`missing ${path.relative(ROOT, SCRIPT)}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const result = childProcess.spawnSync(blender, [
  '--background', '--factory-startup', '--python-exit-code', '1',
  '--python', SCRIPT, '--', OUT, REPORT,
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

if (result.error) fail(String(result.error.message || result.error));
if (result.status !== 0) {
  console.error(result.stdout || '');
  console.error(result.stderr || '');
  fail(`Blender exited ${result.status}`);
}
if (!fs.existsSync(OUT)) fail('Blender reported success but wrote no GLB');

let report = null;
try { report = JSON.parse(fs.readFileSync(REPORT, 'utf8')); } catch (_) { /* the GLB is the artefact */ }
const bytes = fs.statSync(OUT).size;
console.log(`plant header: ${path.relative(ROOT, OUT)}  ${(bytes / 1024).toFixed(1)}kB`
  + (report ? `  ${report.triangles} tris  thread pitch ${report.threadPitch}m` : ''));
