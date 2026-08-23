// THE TAPE, BAKED.
//
// Turns a video into the horizon: a static cloud of splats where the Z axis is
// the recording's own duration. Every metre further in is a frame further into
// the tape, and the frames behind you stay standing, which is the only honest
// way to render a codec that survives by holding on to the last picture it had.
//
// WHY THIS IS NOT A VIDEO TEXTURE. A <video> gives you one frame at a time and
// the horizon needs all of them at once, standing in depth. Baking also means
// the walk is not tied to a decoder's playback clock: the body sets the
// playhead, so stopping stops the picture as well as the score.
//
// WHAT COMES OUT
//   horizon-tape.bin    interleaved splat records, SORTED BY SLICE. The sort is
//                       the whole performance story: a contiguous slice window
//                       is an attribute byte-offset plus an instance count, so
//                       the render pass uploads nothing per frame and allocates
//                       nothing per frame.
//   horizon-tape.json   slice ranges, extents, and the tape's duration.
//   audio/horizon/*.opus  the score, mono (see PART 4 of the plan: a 259s
//                       stereo buffer decodes to ~99MB of float32 and is not
//                       safe on low-end machines).
//
// ADAPTIVE SPLATS. A fixed grid of quads reads as a wall of pixels, not as a
// cloud. So each block is classified and sized by what the codec did to it:
// flat fields merge upward into a few big lazy quads, and the macroblock damage
// shatters into small jittered ones. The mosh is the detail; the colour fields
// are the architecture. Spending the same number of splats on both would throw
// the budget at the parts of the frame with nothing in them.
//
// Usage:  node tools/chunk_surfer/build-horizon-tape.mjs --src <video>
//         HORIZON_TAPE_SRC=<video> npm run assets:horizon-tape

import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SOURCE_HORIZON,
  SOURCE_TIER_BY_ID,
} from '../../src/data/source-level.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(ROOT, 'public/assets');
const OUT_BIN = path.join(OUT_DIR, 'horizon-tape.bin');
const OUT_JSON = path.join(OUT_DIR, 'horizon-tape.json');
const OUT_AUDIO_DIR = path.join(OUT_DIR, 'audio/horizon');
const OUT_AUDIO = path.join(OUT_AUDIO_DIR, 'cyber-theremin-i.opus');

// ── the bake ────────────────────────────────────────────────────────────────

// Sampling resolution. Deliberately small: at 2 metres a slice and a 40-metre
// wall, one source pixel is already most of a metre, and anything finer is
// detail nobody can resolve from the floor. It also keeps the whole decode in
// memory as one 11MB buffer instead of a streaming problem.
const FRAME_W = 160;
const FRAME_H = 90;
// Base block, in source pixels. 32x18 blocks a slice before merging/shattering.
const BLOCK = 5;
const COLS = FRAME_W / BLOCK;
const ROWS = FRAME_H / BLOCK;

// World mapping. X is across the corridor, Y is up from the tier floor, Z is
// depth — which is time. The frame is hung slightly wider than it is tall on
// purpose: the source composition is two colour fields either side of a vertical
// seam, and the seam has to read as somewhere you can walk down.
const SPAN_X = 128; // total width, metres
const SPAN_Y = 40; // total height, metres
const FLOOR = SOURCE_TIER_BY_ID.horizon.height;

// Classification thresholds, in 0..255 luma variance.
const FLAT_VARIANCE = 12;
const MOSH_VARIANCE = 900;
const MOSH_SHARDS = 5;

// Fixed-point scales for the binary record.
const POS_SCALE = 32; // i16 → ±1024 metres at 1/32m
const SIZE_SCALE = 8; // u8 → 0..32 metres at 1/8m

const RECORD_BYTES = 16;

function parseArgs(argv) {
  const args = { src: process.env.HORIZON_TAPE_SRC || '' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--src') args.src = argv[i + 1];
  }
  return args;
}

function requireBinary(name) {
  const probe = spawnSync(name, ['-version'], { stdio: 'ignore' });
  if (probe.error) throw new Error(`${name} is required to bake the horizon tape and is not on PATH`);
}

function probeDuration(src) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', src,
  ]).toString().trim();
  const seconds = Number(out);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`could not read a duration from ${src}`);
  return seconds;
}

// Decode the whole tape to raw RGB at the sampling resolution, evenly spaced
// across its duration. Raw rather than PNG frames on disk: it is one pipe, one
// buffer, and no temp directory to clean up.
function decodeSlices(src, seconds, slices) {
  const fps = slices / seconds;
  const bytesPerFrame = FRAME_W * FRAME_H * 3;
  const out = execFileSync('ffmpeg', [
    '-v', 'error',
    '-i', src,
    '-an',
    '-vf', `fps=${fps.toFixed(6)},scale=${FRAME_W}:${FRAME_H}:flags=area`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { maxBuffer: 1 << 30 });
  const got = Math.floor(out.length / bytesPerFrame);
  if (got < slices - 2) throw new Error(`decoded only ${got} of ${slices} slices — is the source shorter than it claims?`);
  const frames = [];
  for (let i = 0; i < slices; i += 1) {
    // fps sampling can land one frame short at the tail; hold the last picture
    // rather than emitting a hole. Datamosh would have done the same.
    const index = Math.min(i, got - 1);
    frames.push(out.subarray(index * bytesPerFrame, (index + 1) * bytesPerFrame));
  }
  return frames;
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Mean colour and luma variance of one block.
function blockStats(frame, col, row, span) {
  let r = 0, g = 0, b = 0, sum = 0, sumSq = 0, n = 0;
  const x0 = col * BLOCK, y0 = row * BLOCK;
  const x1 = Math.min(FRAME_W, x0 + BLOCK * span), y1 = Math.min(FRAME_H, y0 + BLOCK * span);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * FRAME_W + x) * 3;
      const pr = frame[i], pg = frame[i + 1], pb = frame[i + 2];
      r += pr; g += pg; b += pb;
      const l = luma(pr, pg, pb);
      sum += l; sumSq += l * l; n += 1;
    }
  }
  if (!n) return null;
  const mean = sum / n;
  return {
    r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n),
    variance: Math.max(0, sumSq / n - mean * mean),
    luma: mean,
  };
}

function colourDistance(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

// One slice of the tape becomes a handful of splats per block, at a size that
// depends on what the codec left there.
function sliceSplats(frame, sliceIndex, rand) {
  const splats = [];
  const merged = new Uint8Array(COLS * ROWS);
  const z = -(sliceIndex * SOURCE_HORIZON.sliceMetres);

  const push = (cx, cy, spanX, spanY, stat, kind, jitter = 0) => {
    // Frame space → world. Rows run top-down in the picture and bottom-up in the
    // world, so the tape is not hung upside down.
    const x = (cx / COLS - 0.5) * SPAN_X + (rand() - 0.5) * jitter;
    const y = FLOOR + (1 - cy / ROWS) * SPAN_Y + (rand() - 0.5) * jitter;
    splats.push({
      x, y,
      z: z + (rand() - 0.5) * jitter,
      sx: (spanX / COLS) * SPAN_X,
      sy: (spanY / ROWS) * SPAN_Y,
      r: stat.r, g: stat.g, b: stat.b,
      // Flat fields are the room's light, not its furniture: held back so the
      // damage reads through them instead of being buried.
      a: kind === 'flat' ? 150 : kind === 'mosh' ? 255 : 216,
      kind,
      seed: Math.floor(rand() * 256),
    });
  };

  // Pass one: merge flat 2x2 neighbourhoods of matching colour into one quad.
  for (let row = 0; row < ROWS - 1; row += 2) {
    for (let col = 0; col < COLS - 1; col += 2) {
      const quad = blockStats(frame, col, row, 2);
      if (!quad || quad.variance > FLAT_VARIANCE) continue;
      const parts = [
        blockStats(frame, col, row, 1), blockStats(frame, col + 1, row, 1),
        blockStats(frame, col, row + 1, 1), blockStats(frame, col + 1, row + 1, 1),
      ];
      if (parts.some((p) => !p || colourDistance(p, quad) > 18)) continue;
      for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) merged[(row + dr) * COLS + col + dc] = 1;
      push(col + 1, row + 1, 2, 2, quad, 'flat');
    }
  }

  // Pass two: everything the merge did not claim.
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (merged[row * COLS + col]) continue;
      const stat = blockStats(frame, col, row, 1);
      if (!stat) continue;
      if (stat.variance >= MOSH_VARIANCE) {
        // Macroblock damage. One quad here would average the noise back into a
        // flat colour and throw away the only thing worth looking at, so it
        // becomes a handful of small splats that keep their spread.
        for (let s = 0; s < MOSH_SHARDS; s += 1) {
          push(col + 0.5, row + 0.5, 0.45, 0.45, stat, 'mosh', 1.6);
        }
        continue;
      }
      push(col + 0.5, row + 0.5, 1, 1, stat, stat.variance > FLAT_VARIANCE * 6 ? 'edge' : 'flat');
    }
  }

  return splats;
}

// Deterministic, so a rebuild is byte-identical and the credits hash means
// something.
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const KIND_FLAGS = { flat: 0, edge: 1, mosh: 2 };

function encode(splats) {
  const buffer = Buffer.alloc(splats.length * RECORD_BYTES);
  splats.forEach((s, i) => {
    const o = i * RECORD_BYTES;
    buffer.writeInt16LE(Math.round(s.x * POS_SCALE), o);
    buffer.writeInt16LE(Math.round(s.y * POS_SCALE), o + 2);
    buffer.writeInt16LE(Math.round(s.z * POS_SCALE), o + 4);
    buffer.writeUInt8(Math.min(255, Math.round(s.sx * SIZE_SCALE)), o + 6);
    buffer.writeUInt8(Math.min(255, Math.round(s.sy * SIZE_SCALE)), o + 7);
    buffer.writeUInt8(s.r, o + 8);
    buffer.writeUInt8(s.g, o + 9);
    buffer.writeUInt8(s.b, o + 10);
    buffer.writeUInt8(s.a, o + 11);
    buffer.writeUInt8(s.seed, o + 12);
    buffer.writeUInt8(KIND_FLAGS[s.kind], o + 13);
    buffer.writeUInt16LE(0, o + 14);
  });
  return buffer;
}

function buildAudio(src) {
  fs.mkdirSync(OUT_AUDIO_DIR, { recursive: true });
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-i', src,
    '-vn',
    // Mono, and that is not a compromise: the piece is a drone and every bit of
    // spatial interest out there comes from where the body is standing. Stereo
    // would double a decoded buffer that is already the largest thing the
    // horizon asks the machine to hold.
    '-ac', '1',
    '-c:a', 'libopus', '-b:a', '64k', '-application', 'audio',
    OUT_AUDIO,
  ]);
  return fs.statSync(OUT_AUDIO).size;
}

// ── main ────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
if (!args.src) {
  console.error('no source given. Pass --src <video> or set HORIZON_TAPE_SRC.');
  process.exit(1);
}
const src = path.resolve(args.src);
if (!fs.existsSync(src)) {
  console.error(`source not found: ${src}`);
  process.exit(1);
}

requireBinary('ffmpeg');
requireBinary('ffprobe');

const seconds = probeDuration(src);
const slices = SOURCE_HORIZON.slices;
console.log(`baking ${slices} slices from ${path.basename(src)} (${seconds.toFixed(2)}s)`);

const frames = decodeSlices(src, seconds, slices);
const random = makeRandom(0x54415045); // 'TAPE'

const ranges = [];
const all = [];
for (let i = 0; i < slices; i += 1) {
  const splats = sliceSplats(frames[i], i, random);
  ranges.push({ first: all.length, count: splats.length });
  for (const splat of splats) all.push(splat);
}

const binary = encode(all);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_BIN, binary);

const sha256 = crypto.createHash('sha256').update(binary).digest('hex');
const audioBytes = buildAudio(src);

const manifest = {
  schema: 1,
  id: 'chunk-surf.horizon-tape',
  recordBytes: RECORD_BYTES,
  posScale: POS_SCALE,
  sizeScale: SIZE_SCALE,
  slices,
  sliceMetres: SOURCE_HORIZON.sliceMetres,
  tapeSeconds: seconds,
  length: SOURCE_HORIZON.length,
  span: { x: SPAN_X, y: SPAN_Y },
  floor: FLOOR,
  splats: all.length,
  // first/count per slice. A visible window is ranges[a].first →
  // ranges[b].first+ranges[b].count, which is one contiguous draw.
  ranges,
  audio: { src: 'assets/audio/horizon/cyber-theremin-i.opus', channels: 1, seconds },
  sha256,
};
fs.writeFileSync(OUT_JSON, `${JSON.stringify(manifest, null, 2)}\n`);

const counts = all.reduce((acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] || 0) + 1 }), {});
fs.writeFileSync(path.join(OUT_DIR, 'horizon-tape.stats.json'), `${JSON.stringify({
  splats: all.length,
  perSlice: Math.round(all.length / slices),
  kinds: counts,
  bytes: binary.length,
  audioBytes,
  slices,
  tapeSeconds: seconds,
}, null, 2)}\n`);

fs.writeFileSync(path.join(OUT_DIR, 'horizon-tape.credits.json'), `${JSON.stringify({
  pack: {
    filename: 'horizon-tape.bin',
    author: 'Chunk Surfer project',
    source: 'tools/chunk_surfer/build-horizon-tape.mjs',
    origin: path.basename(src),
    license: 'project source',
    sha256,
    modifications: 'Video sampled to evenly spaced slices, block-classified by luma variance, and baked as depth-sorted splats where Z is the recording timeline. Audio downmixed to mono Opus.',
    splats: all.length,
    bytes: binary.length,
  },
}, null, 2)}\n`);

console.log(`wrote ${path.relative(ROOT, OUT_BIN)} — ${all.length} splats (${Math.round(all.length / slices)}/slice), ${(binary.length / 1e6).toFixed(2)}MB`);
console.log(`  kinds: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`wrote ${path.relative(ROOT, OUT_AUDIO)} — ${(audioBytes / 1e6).toFixed(2)}MB mono`);
