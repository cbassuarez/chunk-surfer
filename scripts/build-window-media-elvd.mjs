// Append-only ingest for the ELDV / end-of-life-dream media bank.
// Sources are acquired separately; this build never downloads at runtime or build time.
// Everything here ships through the standard window-media shader (violet-dither),
// same as the original bank: silent vp9 webm + h264 mp4 + poster, loop-dissolved.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_DIR = resolve(process.argv[2] || join(ROOT, 'artifacts/window-media-elvd/source-media'));
const OUT_DIR = join(ROOT, 'public', 'window-media');
const MANIFEST_PATH = join(ROOT, 'content', 'media', 'window-media.media.json');
const CREDITS_PATH = join(ROOT, 'src', 'data', 'window-media-elvd-sources.js');

// `clinical` marks body/decay footage so reduced-dread mode can stand it down.
// The boar trims the uploader's text bumper: first hard scene cut at ~5.0s.
const SOURCES = Object.freeze([
  { id: 'apoptosis-organelles', file: 'apoptosis-organelles.ogv', start: 0, duration: 7, width: 480, height: 480, fps: 15, sensitivity: 'clinical',
    sourceTitle: 'Stage-specific changes in organelles during apoptosis (S5)', creator: 'Nolin F, Michel J, Wortham L, Tchelidze P, Banchet V, Lalun N, Terryn C, Ploton D', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Stage-Specific-Changes-in-the-Water-Na%2B-Cl--and-K%2B-Contents-of-Organelles-during-Apoptosis-pone.0148727.s005.ogv' },
  { id: 'boar-corpse-decomposition', file: 'boar-corpse-decomposition.webm', start: 5, duration: 18, width: 640, height: 360, fps: 15, sensitivity: 'clinical',
    sourceTitle: 'Common wild pig (boar) corpse decomposition timelapse', creator: 'Ant Timelapse', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Common_wild_pig_(boar)_corpse_decomposition_timelapse_in_4K_13SpAUlZ6Qc.webm', note: 'text bumper removed (start at 5.0s)' },
  { id: 'microfilariae', file: 'microfilariae.ogv', start: 1.3, duration: 8, width: 480, height: 360, fps: 15, sensitivity: 'clinical',
    sourceTitle: 'L. sigmodontis microfilariae (filarial worms) S9', creator: 'Ziewer S, Hübner M, Dubben B, Hoffmann W, Bain O, Martin C, Hoerauf A, Specht S', license: 'CC BY 2.5', licenseUrl: 'https://creativecommons.org/licenses/by/2.5/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Immunization-with-L.-sigmodontis-Microfilariae-Reduces-Peripheral-Microfilaraemia-after-Challenge-pntd.0001558.s009.ogv' },
  { id: 'mitotic-catastrophe', file: 'mitotic-catastrophe.ogv', start: 0, duration: 6, width: 480, height: 480, fps: 15, sensitivity: 'clinical',
    sourceTitle: 'Mitotic catastrophe in the absence of apoptosis (p53-null cells) S3', creator: 'Fragkos M, Beard P', license: 'CC BY 2.5', licenseUrl: 'https://creativecommons.org/licenses/by/2.5/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Mitotic-Catastrophe-Occurs-in-the-Absence-of-Apoptosis-in-p53-Null-Cells-with-a-Defective-G1-pone.0022946.s003.ogv' },
  { id: 'orion-nebula-flythrough', file: 'orion-nebula-flythrough.ogv', start: 0, duration: 18, width: 640, height: 360, fps: 15, sensitivity: 'none',
    sourceTitle: 'Orion Nebula 3D fly-through (HST)', creator: 'NASA, ESA, F. Summers, G. Bacon, L. Frattare, Z. Levay, K. Litaker (STScI)', license: 'Public domain', licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Orion_Nebula_3D_Fly-Through_-_HST.ogv' },
  { id: 'schistosoma-eggs', file: 'schistosoma-eggs.ogv', start: 0, duration: 8, width: 480, height: 480, fps: 15, sensitivity: 'clinical',
    sourceTitle: 'Schistosoma mansoni eggs in the gut of mice (confocal) S2', creator: 'Holtfreter M, Stachs O, Reichard M, Loebermann M, Guthoff R, Reisinger E', license: 'CC BY 2.5', licenseUrl: 'https://creativecommons.org/licenses/by/2.5/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Confocal-Laser-Scanning-Microscopy-for-Detection-of-Schistosoma-mansoni-Eggs-in-the-Gut-of-Mice-pone.0018799.s002.ogv' },
  { id: 'sea-nettle-jellyfish', file: 'sea-nettle-jellyfish.ogv', start: 0, duration: 15, width: 480, height: 360, fps: 15, sensitivity: 'none',
    sourceTitle: 'Chrysaora quinquecirrha — sea nettle jellyfish', creator: 'Gh5046', license: 'Public domain', licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Chrysaora_quinquecirrha-Sea_nettle_(jellyfish).ogv' },
  { id: 'starling-murmuration', file: 'starling-murmuration-480p.webm', start: 0, duration: 15, width: 640, height: 360, fps: 15, sensitivity: 'none',
    sourceTitle: 'Starling Murmuration', creator: 'Karen Roe', license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Flock_of_starlings_(Sturnus_vulgaris).webm' },
]);

function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function run(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`ffmpeg failed (${result.status}): ${args.at(-1)}`);
}
// Standard loop-dissolve: the clip crossfades into its own head for a seamless loop.
function filterFor(spec) {
  const scale = `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height}`;
  const offset = Math.max(0.01, spec.duration - 0.25).toFixed(3);
  return `[0:v]fps=${spec.fps},${scale},split=2[whole][head];`
    + `[whole]trim=duration=${spec.duration},setpts=PTS-STARTPTS[a];`
    + `[head]trim=duration=0.25,setpts=PTS-STARTPTS[b];`
    + `[a][b]xfade=transition=fade:duration=0.25:offset=${offset},format=yuv420p[v]`;
}

mkdirSync(OUT_DIR, { recursive: true });
const before = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const owned = new Set(SOURCES.map((s) => s.id));
const retained = (before.assets || []).filter((a) => !owned.has(a.id));
const records = [];
for (const spec of SOURCES) {
  const source = join(SOURCE_DIR, spec.file);
  statSync(source);
  const webm = join(OUT_DIR, `${spec.id}.webm`);
  const mp4 = join(OUT_DIR, `${spec.id}.mp4`);
  const poster = join(OUT_DIR, `${spec.id}.png`);
  const common = ['-ss', String(spec.start), '-i', source, '-filter_complex', filterFor(spec), '-map', '[v]', '-an', '-t', String(spec.duration), '-r', String(spec.fps)];
  run([...common, '-c:v', 'libvpx-vp9', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-crf', '34', '-b:v', '0', '-g', String(spec.fps), webm]);
  run([...common, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-g', String(spec.fps), '-keyint_min', String(spec.fps), '-sc_threshold', '0', '-movflags', '+faststart', mp4]);
  run(['-ss', String(spec.start + 0.2), '-i', source, '-vf', `fps=1,scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height}`, '-frames:v', '1', '-an', poster]);
  records.push({
    id: spec.id, kind: 'video', path: `window-media/${spec.id}.webm`, aspectRatio: spec.width / spec.height, width: spec.width, height: spec.height, fps: spec.fps,
    trim: { startSeconds: spec.start, durationSeconds: spec.duration, loopDissolveSeconds: 0.25 }, sensitivity: spec.sensitivity,
    source: { file: spec.file, sha256: sha256(source), title: spec.sourceTitle, creator: spec.creator, license: spec.license, licenseUrl: spec.licenseUrl, url: spec.sourceUrl },
    derivatives: {
      webm: { path: `window-media/${spec.id}.webm`, codec: 'vp9', sha256: sha256(webm), bytes: statSync(webm).size },
      mp4: { path: `window-media/${spec.id}.mp4`, codec: 'h264', sha256: sha256(mp4), bytes: statSync(mp4).size },
      poster: { path: `window-media/${spec.id}.png`, codec: 'png', sha256: sha256(poster), bytes: statSync(poster).size },
    },
    modifications: ['trimmed', 'loop-dissolved', 'resized', 'silent transcode', 'color processed'],
  });
}
const manifest = { ...before, assets: [...retained, ...records], extensions: { ...(before.extensions || {}), 'elvd-media': { generatedBy: 'scripts/build-window-media-elvd.mjs', sourceDirectory: 'artifacts/window-media-elvd/source-media', assetIds: SOURCES.map((s) => s.id) } } };
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
const credits = SOURCES.map((s) => ({ id: s.id, title: s.sourceTitle, author: s.creator, url: s.sourceUrl, licence: s.license, licenceUrl: s.licenseUrl, changes: ['trimmed', 'loop-dissolved', 'resized', 'silent transcode', 'color processed', ...(s.note ? [s.note] : [])].join('; ') }));
writeFileSync(CREDITS_PATH, `// Generated by scripts/build-window-media-elvd.mjs.\n// ELDV / end-of-life-dream media bank — new source credits only.\nexport const WINDOW_MEDIA_ELVD_SOURCES=Object.freeze(${JSON.stringify(credits, null, 2)}.map(Object.freeze));\n`);
console.log(JSON.stringify({ preserved: retained.length, added: records.map((a) => a.id) }));
