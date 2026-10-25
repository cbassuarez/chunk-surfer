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
import { STOP_LISTENING_MESH, STOP_LISTENING_SHEET_DOCUMENT, STOP_LISTENING_EAR_SCALE } from '../../src/data/stop-listening.js';

const root = path.resolve(import.meta.dirname, '../..');
const surfaceOnly = process.argv.includes('--surface-only');
const anatomyOnly = process.argv.includes('--anatomy-only') || surfaceOnly;
const work = path.join(root, 'artifacts/stop-listening');
const script = path.join(import.meta.dirname, 'build-stop-listening.py');
const out = path.join(root, 'public/assets/stop-listening.glb');
const stats = path.join(root, 'public/assets/stop-listening.stats.json');
const credits = path.join(root, 'public/assets/stop-listening.credits.json');
const geometry = path.join(root, 'src/data/generated/stop-listening-geometry.js');
const sheetOut = path.join(root, STOP_LISTENING_SHEET_DOCUMENT.path);
const working = path.join(work, 'stop-listening.working.glb');
const report = path.join(work, anatomyOnly ? 'stop-listening-anatomy-build.json' : 'stop-listening-build.json');
const sheetPng = path.join(work, 'take-sheet.png');

fs.mkdirSync(work, { recursive: true });
const blender = process.env.BLENDER_BIN || (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const run = cp.spawnSync(blender, ['--background', '--factory-startup', '--threads', '2', '--python', script, '--',
  '--output', working, '--report', report, '--sheet', sheetPng, '--work', work,
  '--ear-scale', String(STOP_LISTENING_EAR_SCALE),
  ...(anatomyOnly ? ['--anatomy-only'] : []),
  '--blend', path.join(work, anatomyOnly ? 'stop-listening-anatomy.blend' : 'stop-listening.blend')], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || '2' } });
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
let { json, bin } = chunks(fs.readFileSync(working));
delete json.extensionsUsed; delete json.extensionsRequired; strip(json);
// Explicit glTF factor semantics opt these newly authored tissue materials out
// of the legacy unmapped roughness-squaring conversion. No renderer-wide
// material or post-process setting is changed by this pack.
for (const mat of json.materials || []) if (/^stop listening (ear |floor wet$)/.test(mat.name || '')) {
  mat.extras = { materialFactors: 'gltf', ...(/^stop listening ear /.test(mat.name)
    ? {tissueSurface:{version:1,profile:'severed-auricle',preservePigment:true,localSpecular:true}} : {}) };
  if(/^stop listening ear /.test(mat.name)){
    const role=mat.name.split(' ').at(-1);
    mat.pbrMetallicRoughness.baseColorFactor={skin:[1,1,1,1],deep:[1,1,1,1],wound:[.58,.22,.25,1]}[role];
    mat.pbrMetallicRoughness.metallicFactor=0;
    mat.pbrMetallicRoughness.roughnessFactor=role==='wound'?.45:1;
    mat.occlusionTexture={index:mat.pbrMetallicRoughness.metallicRoughnessTexture.index,strength:.5};
  }
}
if (json.animations || json.skins || json.accessors.some((a) => a.sparse)) throw new Error('unsupported dynamic GLB');
if (json.nodes.some((n) => n.matrix || n.translation || n.rotation || n.scale || n.children?.length)) throw new Error('identity flat roots required');
for (const mesh of json.meshes) for (const p of mesh.primitives) {
  if ((p.mode ?? 4) !== 4 || !Number.isInteger(p.indices)) throw new Error(`${mesh.name}: indexed triangles required`);
  if (!Number.isInteger(p.attributes.NORMAL)) throw new Error(`${mesh.name}: normals required`);
  if (p.targets?.length) throw new Error(`${mesh.name}: morph targets unsupported`);
}
for (const m of json.materials || []) if (m.alphaMode && !['OPAQUE', 'MASK'].includes(m.alphaMode)) throw new Error(`${m.name}: ${m.alphaMode}`);
const anatomyNames = [...STOP_LISTENING_MESH.ears, ...STOP_LISTENING_MESH.heaps];
const expected = [...anatomyNames, ...(anatomyOnly ? [] : [
  ...Object.values(STOP_LISTENING_MESH.writing).flatMap((name) => [name, `${name}_pale`]), STOP_LISTENING_MESH.sheet])];
const names = json.meshes.map((m) => m.name).sort();
if (JSON.stringify(names) !== JSON.stringify([...expected].sort())) throw new Error(`mesh catalogue mismatch:\n${names}\n${[...expected].sort()}`);

// An ear refinement must not rerender the take sheet or replace wall pigment.
// Copy the referenced GLB byte ranges, rather than import/re-export those
// objects through Blender (which can reorder normals, UVs and image encoding).
// Compact the two sources into one buffer so replacing anatomy cannot leave a
// full obsolete pack appended underneath the new geometry.
if (anatomyOnly) {
  const previous = chunks(fs.readFileSync(out)), fresh = { json, bin };
  const next = structuredClone(previous.json), pieces = [], views = new Map(), accessors = new Map();
  let byteLength = 0;
  next.bufferViews = []; next.accessors = [];
  const viewFor = (source, id) => {
    const key = `${source === fresh ? 'new' : 'old'}:${id}`;
    if (views.has(key)) return views.get(key);
    const def = source.json.bufferViews[id], padding = (4 - byteLength % 4) % 4;
    if (padding) { pieces.push(Buffer.alloc(padding)); byteLength += padding; }
    const body = source.bin.subarray(def.byteOffset || 0, (def.byteOffset || 0) + def.byteLength), index = next.bufferViews.length;
    next.bufferViews.push({ ...structuredClone(def), buffer: 0, byteOffset: byteLength });
    pieces.push(body); byteLength += body.length; views.set(key, index); return index;
  };
  const accessorFor = (source, id) => {
    const key = `${source === fresh ? 'new' : 'old'}:${id}`;
    if (accessors.has(key)) return accessors.get(key);
    const def = structuredClone(source.json.accessors[id]), index = next.accessors.length;
    def.bufferView = viewFor(source, def.bufferView); next.accessors.push(def); accessors.set(key, index); return index;
  };
  next.materials = structuredClone(previous.json.materials || []);
  next.images=structuredClone(previous.json.images||[]);
  next.textures=structuredClone(previous.json.textures||[]);
  next.samplers=structuredClone(previous.json.samplers||[]);
  const imageSources=next.images.map(()=>previous),freshImages=new Map(),freshTextures=new Map(),freshSamplers=new Map();
  const imageFor=id=>{
    if(freshImages.has(id))return freshImages.get(id);
    const copy=structuredClone(fresh.json.images[id]);
    if(!Number.isInteger(copy.bufferView))throw Error('Ear tissue images must be embedded in the standalone pack');
    let index=copy.name?next.images.findIndex(image=>image.name===copy.name):-1;
    if(index<0){index=next.images.length;next.images.push(copy);imageSources.push(fresh);}
    else{next.images[index]=copy;imageSources[index]=fresh;}
    freshImages.set(id,index);return index;
  };
  const textureFor=id=>{
    if(freshTextures.has(id))return freshTextures.get(id);
    const copy=structuredClone(fresh.json.textures[id]);copy.source=imageFor(copy.source);
    if(Number.isInteger(copy.sampler)){
      if(!freshSamplers.has(copy.sampler)){
        const sampler=fresh.json.samplers[copy.sampler];let index=next.samplers.findIndex(s=>JSON.stringify(s)===JSON.stringify(sampler));
        if(index<0){index=next.samplers.length;next.samplers.push(structuredClone(sampler));}
        freshSamplers.set(copy.sampler,index);
      }
      copy.sampler=freshSamplers.get(copy.sampler);
    }
    let index=next.textures.findIndex(t=>JSON.stringify(t)===JSON.stringify(copy));
    if(index<0){index=next.textures.length;next.textures.push(copy);}
    freshTextures.set(id,index);return index;
  };
  const materialFor = (id) => {
    const mat=structuredClone(fresh.json.materials[id]);
    for(const ref of [mat.pbrMetallicRoughness?.baseColorTexture,mat.pbrMetallicRoughness?.metallicRoughnessTexture,mat.normalTexture,mat.occlusionTexture,mat.emissiveTexture])
      if(ref)ref.index=textureFor(ref.index);
    const existing = next.materials.findIndex((m) => m.name === mat.name);
    if (existing >= 0) { next.materials[existing] = structuredClone(mat); return existing; }
    next.materials.push(structuredClone(mat)); return next.materials.length - 1;
  };
  next.meshes = previous.json.meshes.map((old) => {
    const isNew = !surfaceOnly && anatomyNames.includes(old.name), source = isNew ? fresh : previous;
    const mesh = structuredClone(isNew ? fresh.json.meshes.find((m) => m.name === old.name) : old);
    if (!mesh) throw new Error(`missing replacement anatomy ${old.name}`);
    for (const primitive of mesh.primitives) {
      primitive.indices = accessorFor(source, primitive.indices);
      primitive.attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([name, id]) => [name, accessorFor(source, id)]));
      if (isNew) primitive.material = materialFor(primitive.material);
      else if(surfaceOnly&&/^stop listening ear /.test(previous.json.materials[primitive.material]?.name||'')){
        const name=previous.json.materials[primitive.material].name;
        primitive.material=materialFor(fresh.json.materials.findIndex(mat=>mat.name===name));
      }
    }
    return mesh;
  });
  // Repeated anatomy-only builds must replace the tissue maps, not retain
  // unreachable old textures which the runtime would still upload to the GPU.
  const refs=next.materials.flatMap(mat=>[mat.pbrMetallicRoughness?.baseColorTexture,
    mat.pbrMetallicRoughness?.metallicRoughnessTexture,mat.normalTexture,mat.occlusionTexture,mat.emissiveTexture].filter(Boolean));
  const textureIds=[...new Set(refs.map(ref=>ref.index))],textureMap=new Map(textureIds.map((id,i)=>[id,i]));
  next.textures=textureIds.map(id=>next.textures[id]);for(const ref of refs)ref.index=textureMap.get(ref.index);
  const imageIds=[...new Set(next.textures.map(texture=>texture.source))],imageMap=new Map(imageIds.map((id,i)=>[id,i]));
  next.images=imageIds.map(id=>next.images[id]);const keptImageSources=imageIds.map(id=>imageSources[id]);
  for(const texture of next.textures)texture.source=imageMap.get(texture.source);
  const samplerIds=[...new Set(next.textures.map(texture=>texture.sampler).filter(Number.isInteger))],samplerMap=new Map(samplerIds.map((id,i)=>[id,i]));
  next.samplers=samplerIds.map(id=>next.samplers[id]);for(const texture of next.textures)if(Number.isInteger(texture.sampler))texture.sampler=samplerMap.get(texture.sampler);
  for (const [i,image] of next.images.entries()) if (Number.isInteger(image.bufferView)) image.bufferView = viewFor(keptImageSources[i], image.bufferView);
  next.buffers = [{ byteLength }]; json = next; bin = Buffer.concat(pieces);
}

const pad = (buf, fill) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, fill)]);
const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20);
const binChunk = pad(bin, 0);
const head = Buffer.alloc(12); head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
const ch = (kind, body) => { const h = Buffer.alloc(8); h.writeUInt32LE(body.length, 0); h.writeUInt32LE(kind, 4); return Buffer.concat([h, body]); };
fs.writeFileSync(out, Buffer.concat([head, ch(0x4e4f534a, jsonChunk), ch(0x004e4942, binChunk)]));

// ── what the game and the specs read ────────────────────────────────────────
const built = JSON.parse(fs.readFileSync(report, 'utf8'));
if (anatomyOnly) {
  for (const mesh of json.meshes) if (surfaceOnly || !built.meshes[mesh.name]) {
    const positions = mesh.primitives.map((p) => json.accessors[p.attributes.POSITION]);
    built.meshes[mesh.name] = {
      triangles: mesh.primitives.reduce((n, p) => n + json.accessors[p.indices].count / 3, 0),
      bounds: { min: [0, 1, 2].map((i) => +Math.min(...positions.map((p) => p.min[i])).toFixed(4)), max: [0, 1, 2].map((i) => +Math.max(...positions.map((p) => p.max[i])).toFixed(4)) },
      materials: [...new Set(mesh.primitives.map((p) => json.materials[p.material].name))],
    };
  }
  built.triangles = Object.values(built.meshes).reduce((n, m) => n + m.triangles, 0);
}
const bounds = Object.fromEntries(Object.entries(built.meshes).sort().map(([name, m]) => [name, m.bounds]));
fs.writeFileSync(geometry, `// Generated by tools/chunk_surfer/build-stop-listening.mjs. Do not edit.
// Runtime-axis bounds (metres) of the ear room's meshes, for wall contact and specs.
export const STOP_LISTENING_BOUNDS = Object.freeze(${JSON.stringify(bounds)});
// Anatomy only: liquid around an ear is not its apparent size or a circulation obstacle.
export const STOP_LISTENING_FLESH_BOUNDS = Object.freeze(${JSON.stringify(built.fleshBounds)});
`);
fs.writeFileSync(stats, `${JSON.stringify({
  bytes: fs.statSync(out).size, triangles: built.triangles, earScale: built.earScale, artRevision: built.artRevision,
  tissueMaps:{width:512,height:512,uniqueTextures:3,channels:['sRGB pigment','tangent normal','R occlusion, G roughness, B metallic'],
    approximateRgba8ResidencyWithMipmaps:3*512*512*4*4/3},
  ...(built.heapSupport ? {heapSupport: Object.fromEntries(Object.entries(built.heapSupport).map(([name, {contacts, ...summary}]) => [name, summary]))} : {}),
  meshes: Object.fromEntries(Object.entries(built.meshes).sort().map(([name, m]) => [name, { triangles: m.triangles, materials: m.materials }])),
}, null, 2)}\n`);
fs.writeFileSync(credits, `${JSON.stringify({
  pack: 'stop-listening',
  source: 'Modelled procedurally in Blender by tools/chunk_surfer/build-stop-listening.py; no third-party meshes or textures.',
  anatomyReference:'https://elementsofmorphology.nih.gov/anatomy-ear.shtml (landmark reference only; no reference pixels or meshes copied)',
  fonts: 'Take sheet set in the vendored URW base35 faces (assets/fonts, AGPL-3.0 with the font embedding exception).',
}, null, 2)}\n`);
fs.mkdirSync(path.dirname(sheetOut), { recursive: true });
if (!anatomyOnly) await sharp(sheetPng).webp({ quality: 88 }).toFile(sheetOut);
console.log(`wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB); ${anatomyOnly ? 'preserved exact existing' : 'wrote'} ${path.relative(root, sheetOut)}`);
