// Build the architectural surface atlases the WebGL world renderer samples:
// four texture arrays (albedo, normal, roughness, height), one slot per
// real surface. Sources are standard PBR sets — Poliigon (BaseColor/Normal/
// Roughness) and ambientCG-style (COL/NRM/GLOSS) — downscaled from 4K and packed.
// Gloss maps are inverted to roughness. These are seam-tileable, so a single tile
// repeats across a whole floor or wall without a visible join.
//
//   node tools/chunk_surfer/build-surfaces.mjs
//
// Sources live under ~/Downloads (large, not vendored). A missing set packs a
// neutral tile in its slot and is disclosed in surfaces.json, so the build never
// hard-fails on an absent download. The material→slot mapping lives in the shader.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'public/labs/chunk-surfer/assets/surfaces');
const DL = path.join(process.env.HOME, 'Downloads');
// Each surface is one 512px tile; the three maps are stacked as vertical strips
// (tile per slot) and uploaded as WebGL2 texture arrays — proper mipmaps, REPEAT
// wrap, and anisotropy, none of which an atlas allows.
const SIZE = 512;

// slot → { dir under ~/Downloads, tile (world metres per repeat), kind }
const SURFACES = {
  wall_brick:       { slot: 0, dir: 'Poliigon_BrickWallReclaimed_8320',     tile: 3.0, kind: 'wall' },
  wall_stonebrick:  { slot: 1, dir: 'StoneBricksSplitface001',              tile: 2.6, kind: 'wall' },
  floor_wood:       { slot: 2, dir: 'Poliigon_WoodFloorAsh_4186',           tile: 2.4, kind: 'floor' },
  floor_quartzite:  { slot: 3, dir: 'Poliigon_StoneQuartzite_8060',         tile: 2.8, kind: 'floor' },
  floor_pooltile:   { slot: 4, dir: 'TilesSquarePoolMixed001',              tile: 1.2, kind: 'floor' },
  floor_ceramic:    { slot: 5, dir: 'Poliigon_TilesCeramicWhite_6956',      tile: 1.2, kind: 'floor' },
  floor_terrazzo:   { slot: 6, dir: 'Poliigon_TerrazzoTilePolished_4818',   tile: 2.2, kind: 'floor' },
  wall_travertine:  { slot: 7, dir: 'TilesTravertine001',                   tile: 2.8, kind: 'wall' },
  wall_rammedearth: { slot: 8, dir: 'RammedEarth018',                       tile: 3.2, kind: 'wall' },
  wall_concrete:    { slot: 9, dir: 'Poliigon_ConcreteWallCladding_7856',   tile: 2.8, kind: 'wall' },
};

// Recursively list files once per set folder.
function walkFiles(dir) {
  const out = [];
  const rec = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else out.push(p); } };
  if (fs.existsSync(dir)) rec(dir);
  return out;
}
// Find the best map of a kind, honouring both naming schemes and skipping the
// 16-bit TIFFs, previews, AO/DISP/REFL/metalness variants.
function pickMap(files, kind) {
  const img = files.filter((f) => /\.(jpe?g|png|tiff?)$/i.test(f) && !/preview/i.test(f));
  const has = (f, ...res) => res.some((r) => r.test(path.basename(f)));
  const pats = {
    color: [/_basecolor/i, /_color/i, /_col[_.]/i, /_albedo/i, /_diffuse/i],
    normal: [/_normalgl/i, /_normal[_.]/i, /_nrm[_.]/i],
    rough: [/_roughness/i, /_rough[_.]/i],
    gloss: [/_gloss/i],
    height: [/_displacement/i, /_disp[_.]/i, /_height/i, /_bump[_.]/i],
  };
  // Note: no _metalness guard — some sets suffix every map with _METALNESS, and
  // the real metalness map matches none of the colour/normal/rough patterns anyway.
  const bad = /(_ao[_.]|_disp|_refl|_bump|preview|16_)/i;
  const match = (list) => img.filter((f) => list.some((r) => r.test(path.basename(f))) && !bad.test(path.basename(f))).sort((a, b) => (/\.jpe?g$/i.test(a) ? 0 : 1) - (/\.jpe?g$/i.test(b) ? 0 : 1));
  if (kind === 'rough') {
    const r = match(pats.rough); if (r[0]) return { file: r[0], invert: false };
    const g = match(pats.gloss); if (g[0]) return { file: g[0], invert: true };   // gloss → roughness
    return null;
  }
  if(kind==='height'){
    const m=img.filter((f)=>pats.height.some((r)=>r.test(path.basename(f)))&&!/(preview|16_)/i.test(path.basename(f)))
      .sort((a,b)=>(/\.tiff?$/i.test(a)?1:0)-(/\.tiff?$/i.test(b)?1:0));
    return m[0]?{file:m[0]}:null;
  }
  const m = match(pats[kind]); return m[0] ? { file: m[0] } : null;
}

async function tile(file, { greyscale = false, invert = false } = {}) {
  let s = sharp(file).resize(SIZE, SIZE, { fit: 'fill' });
  if (greyscale) s = s.greyscale();
  if (invert) s = s.negate({ alpha: false });
  return s.removeAlpha().png().toBuffer();
}
const solid = async (r, g, b) => sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: { r, g, b } } }).png().toBuffer();
async function variance(buf) {
  const { data } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
  let m = 0, sq = 0; for (const v of data) { m += v; sq += v * v; } m /= data.length; return +(sq / data.length - m * m).toFixed(1);
}

fs.mkdirSync(OUT, { recursive: true });
const order = Object.entries(SURFACES).sort((a, b) => a[1].slot - b[1].slot);
const LAYERS = Math.max(...order.map(([, c]) => c.slot)) + 1;
const albedoT = [], normalT = [], roughT = [], heightT=[];
const manifest = { version: 4, array: { tileSize: SIZE, layers: LAYERS, albedo: 'surfaces/surface-albedo.jpg', normal: 'surfaces/surface-normal.png', rough: 'surfaces/surface-rough.jpg', height:'surfaces/surface-height.png' }, surfaces: {} };

for (const [name, cfg] of order) {
  const files = walkFiles(path.join(DL, cfg.dir));
  const c = pickMap(files, 'color'), n = pickMap(files, 'normal'), r = pickMap(files, 'rough'), h=pickMap(files,'height');
  const top = cfg.slot * SIZE;                       // one tile per array layer, stacked
  const albedo = c ? await tile(c.file) : await solid(120, 118, 112);
  const normal = n ? await tile(n.file) : await solid(128, 128, 255);
  const rough = r ? await tile(r.file, { greyscale: true, invert: r.invert }) : await solid(150, 150, 150);
  const height=h?await tile(h.file,{greyscale:true}):await solid(128,128,128);
  albedoT.push({ input: albedo, left: 0, top }); normalT.push({ input: normal, left: 0, top }); roughT.push({ input: rough, left: 0, top });heightT.push({input:height,left:0,top});
  manifest.surfaces[name] = {
    layer: cfg.slot, kind: cfg.kind, tileMeters: cfg.tile, source: cfg.dir,
    maps: { color: c ? path.basename(c.file) : null, normal: n ? path.basename(n.file) : null, rough: r ? path.basename(r.file) + (r.invert ? ' (from gloss)' : '') : null, height:h?path.basename(h.file):null },
    present: !!c, variance: await variance(albedo),
  };
  console.log(`  · ${name}: layer ${cfg.slot}  ${c ? path.basename(c.file) : 'MISSING → neutral'}  norm=${!!n} rough=${!!r}${r?.invert ? '(gloss)' : ''} height=${!!h}`);
}

const strip = (bg) => ({ create: { width: SIZE, height: SIZE * LAYERS, channels: 3, background: bg } });
await sharp(strip({ r: 120, g: 118, b: 112 })).composite(albedoT).jpeg({ quality: 92 }).toFile(path.join(OUT, 'surface-albedo.jpg'));
await sharp(strip({ r: 128, g: 128, b: 255 })).composite(normalT).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'surface-normal.png'));
await sharp(strip({ r: 150, g: 150, b: 150 })).composite(roughT).jpeg({ quality: 90 }).toFile(path.join(OUT, 'surface-rough.jpg'));
await sharp(strip({r:128,g:128,b:128})).composite(heightT).png({compressionLevel:9}).toFile(path.join(OUT,'surface-height.png'));
// The single-image atlas from the previous approach is retired.
for (const f of ['surface-atlas.png']) fs.rmSync(path.join(OUT, f), { force: true });
fs.writeFileSync(path.join(OUT, 'surfaces.json'), JSON.stringify(manifest, null, 2) + '\n');
const missing = Object.values(manifest.surfaces).filter((s) => !s.present).length;
console.log(`wrote 4 texture-array strips (${SIZE}px × ${LAYERS} layers) — ${Object.keys(SURFACES).length - missing}/${Object.keys(SURFACES).length} from real sets`);
