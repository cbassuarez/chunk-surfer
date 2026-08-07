// The threshold mask the 1-bit pass dithers against.
//
// WHY NOT BAYER. pixel-mesh/shader.js thresholds against bayer4 — a 4x4 ORDERED
// matrix indexed by mesh cell. Sixteen levels, repeating every four cells. That
// is a regular lattice by construction, and it is the square plaid that shows up
// on every flat wall in every lighting state. No amount of work on the ambient
// field or on texture tiling could remove it, because it is not in the signal;
// it is in the ruler the signal is measured against.
//
// Blue noise is the standard answer: energy pushed into the high frequencies, so
// there is no periodic structure at any scale the eye integrates, and the dots
// distribute evenly at every threshold level rather than clumping into a grid.
//
// VOID-AND-CLUSTER (Ulichney 1993). The classic construction, and it is worth
// knowing why it is three phases rather than one. You start from an arbitrary
// binary pattern and relax it until every 1 is as far from its neighbours as the
// torus allows; that gives you a well-distributed seed. Then you RANK every
// pixel: first by removing the tightest clusters one at a time (those ranks go
// below the seed), then by filling the largest voids (above it). The rank order
// IS the threshold order, which is what makes the mask correct at every level
// and not just at 50%.
//
//   node tools/chunk_surfer/build-blue-noise.mjs [--size 64] [--out <path>]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const N = Math.max(8, parseInt(argOf('--size', '64'), 10));
const OUT = path.resolve(argOf('--out', 'public/assets/blue-noise-64.png'));

// Ulichney's filter. Sigma 1.5 is the value the paper settles on: wide enough
// that a pixel feels its neighbours' neighbours, tight enough that the result
// stays high-frequency. The filter WRAPS, because the mask has to tile.
const SIGMA = 1.5;
const RADIUS = Math.min(Math.floor(N / 2), Math.ceil(SIGMA * 3));
const kernel = [];
for (let dy = -RADIUS; dy <= RADIUS; dy++) {
  for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    const w = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
    if (w > 1e-6) kernel.push([dx, dy, w]);
  }
}

const idx = (x, y) => ((y % N) + N) % N * N + (((x % N) + N) % N);

/** Energy field: how crowded each pixel is, toroidally. */
function filter(binary) {
  const out = new Float64Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!binary[idx(x, y)]) continue;
      for (const [dx, dy, w] of kernel) out[idx(x + dx, y + dy)] += w;
    }
  }
  return out;
}

/** Tightest cluster = the 1 sitting in the most crowded place. */
function tightestCluster(binary, energy) {
  let best = -1, bestVal = -Infinity;
  for (let i = 0; i < N * N; i++) {
    if (binary[i] && energy[i] > bestVal) { bestVal = energy[i]; best = i; }
  }
  return best;
}

/** Largest void = the 0 sitting in the emptiest place. */
function largestVoid(binary, energy) {
  let best = -1, bestVal = Infinity;
  for (let i = 0; i < N * N; i++) {
    if (!binary[i] && energy[i] < bestVal) { bestVal = energy[i]; best = i; }
  }
  return best;
}

function splat(energy, i, sign) {
  const x = i % N, y = (i / N) | 0;
  for (const [dx, dy, w] of kernel) energy[idx(x + dx, y + dy)] += sign * w;
}

// ── the seed ────────────────────────────────────────────────────────────────
// A deterministic PRNG, so the mask is reproducible: this is a checked-in asset
// and it must not change identity between machines or builds.
let seed = 0x9e3779b9 >>> 0;
const rand = () => {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
};

const total = N * N;
const ones = Math.max(1, Math.round(total * 0.1));
const binary = new Uint8Array(total);
for (let placed = 0; placed < ones;) {
  const i = Math.floor(rand() * total);
  if (!binary[i]) { binary[i] = 1; placed++; }
}

// Relax: move the tightest cluster into the largest void until it is stable.
let energy = filter(binary);
for (let guard = 0; guard < total * 4; guard++) {
  const c = tightestCluster(binary, energy);
  binary[c] = 0; splat(energy, c, -1);
  const v = largestVoid(binary, energy);
  if (v === c) { binary[c] = 1; splat(energy, c, +1); break; }
  binary[v] = 1; splat(energy, v, +1);
}

const rank = new Int32Array(total).fill(-1);
const prototype = Uint8Array.from(binary);

// Phase 1 — remove the seed's ones, tightest cluster first. Ranks count DOWN
// from ones-1, because these are the pixels that turn on earliest.
{
  const work = Uint8Array.from(prototype);
  let e = filter(work);
  for (let r = ones - 1; r >= 0; r--) {
    const c = tightestCluster(work, e);
    work[c] = 0; splat(e, c, -1);
    rank[c] = r;
  }
}

// Phase 2 — fill voids from the seed up to half. Ranks count UP from ones.
// Phase 3 — past half, the roles swap: the MINORITY is now the zeros, so the
// measure becomes the tightest cluster of zeros in the complement. Getting this
// swap right is what keeps the mask uniform in the top half instead of letting
// it clump.
{
  const work = Uint8Array.from(prototype);
  let e = filter(work);
  const half = Math.floor((total + 1) / 2);
  for (let r = ones; r < total; r++) {
    let target;
    if (r < half) {
      target = largestVoid(work, e);
    } else {
      const inv = new Uint8Array(total);
      for (let i = 0; i < total; i++) inv[i] = work[i] ? 0 : 1;
      target = tightestCluster(inv, filter(inv));
    }
    work[target] = 1; splat(e, target, +1);
    rank[target] = r;
  }
}

// ── encode ──────────────────────────────────────────────────────────────────
// Ranks map to 0..255. An 8-bit mask over 4096 ranks means ~16 ranks share a
// byte, which is still 256 usable threshold levels against Bayer's 16.
const bytes = Buffer.alloc(total);
for (let i = 0; i < total; i++) bytes[i] = Math.min(255, Math.floor((rank[i] / total) * 256));

function png(gray, size) {
  const raw = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0;
    gray.copy(raw, y * (size + 1) + 1, y * size, (y + 1) * size);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, png(bytes, N));
console.log(`wrote ${path.relative(process.cwd(), OUT)} (${N}x${N}, ${total} ranks)`);
