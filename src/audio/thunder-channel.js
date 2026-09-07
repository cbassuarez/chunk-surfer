// THUNDER, BUILT AS A LIGHTNING CHANNEL.
//
// The published listening test of competing thunder synths (Fineberg et al.,
// 2022, n=54) scored a real recording at 8.17/10 and the best synthetic model at
// 6.15. The complaints written down about the synthetic ones were "too perfect",
// "suspicious initial strike", "unnatural sense of perfectness". That is not a
// filter-tuning failure. It is structural: a signal model builds thunder out of
// noise layers with envelopes, so its SHAPE is a designer's guess, and a guess
// is smooth in a way weather never is.
//
// Real thunder's shape is not a guess. It is geometry. Ribner & Roy (JASA 72(6),
// 1982) state the whole algorithm in one line:
//
//     the received pressure signature is essentially a CONVOLUTION OF AN N WAVE
//     WITH A CHANNEL-SHAPE FUNCTION
//
// Build the lightning and the sound falls out of it. Two consequences from the
// same paper are why it is worth doing properly rather than approximating:
//
//   COLLINEAR RUNS CANCEL, KINKS DO NOT. Emission from successive collinear
//   segments largely cancels except as they approach perpendicularity to the
//   sound rays; the uncancelled emission from corners and kinks is what accounts
//   for the long duration of real thunder.
//
//   THE SAME FLASH IS A CLAP OR A RUMBLE DEPENDING ON WHERE YOU STAND. An
//   observer near the perpendicular plane bisecting a tortuous segment hears the
//   group of pulses as a loud clap; an observer outside that zone hears the same
//   source as low-amplitude rumbling.
//
// No signal model can produce that second one at all, and it is free here.
//
// WHY THIS FILE HAS NO WEB AUDIO IN IT.
//
// The convolution is sparse — a few hundred impulses against a short kernel — so
// it is a loop, not a node graph. Writing it as plain arithmetic into a
// Float32Array buys three things a graph cannot: it is unit-testable in Node
// with no AudioContext, it is deterministic from a seed so a strike can be
// rendered to a .wav and LISTENED to, and it can be rendered at the flash and
// played at the thunder — storm.js already holds every strike for distance/343
// seconds, which is 1.2s at 400m and 20s at 7km, so the audible frame never does
// the work.

const C0 = 343;                 // m/s
const P0 = 101325;              // Pa

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

// Deterministic, so one seed is one strike forever. Same generator the bell
// tower uses for its impulse responses.
export function thunderRng(seed = 1) {
  let state = (Math.floor(Number(seed) || 1) >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ── THE ONE LENGTH SCALE ─────────────────────────────────────────────────────
//
// Few (1969): the cylindrical shock from the channel relaxes at a radius set
// entirely by the energy deposited per unit length, and that radius sets the
// spectral peak. E0 is a physical quantity, not a taste knob.
//
//   R_c   = sqrt(E0 / (pi * p0))
//   f_max = c0 * sqrt(p0 / E0) = c0 / (1.77 * R_c)
//
// 50 kJ/m -> R_c 0.40m, f_max 488Z.  300 kJ/m -> 0.97m, 199Hz. Measured thunder
// peaks near 100Hz for claps and ~50Hz for rumble with the power-spectrum
// maximum "of the order of 200Hz", so the relation lands in the right place.
//
// Note the direction: a MORE energetic stroke is LOWER pitched, because it
// pushes a bigger cylinder. Near strikes do not crack because their source
// spectrum is bright — they crack because nothing has absorbed the top yet.
export function relaxationRadius(e0) {
  return Math.sqrt(Math.max(1, e0) / (Math.PI * P0));
}
export function characteristicHz(e0) {
  return C0 * Math.sqrt(P0 / Math.max(1, e0));
}

// ── AIR EATS THE TOP ─────────────────────────────────────────────────────────
//
// ISO 9613-1 atmospheric absorption at 20C / 70% RH — a storm is humid — in
// dB per metre at octave centres. This is the most convincing distance cue there
// is, and it has to be applied PER PATH LENGTH rather than once globally,
// because the near end and the far end of one channel have travelled different
// distances and arrive inside the same thunder.
const ABSORPTION = Object.freeze([
  [63, 0.0001], [125, 0.0004], [250, 0.0010], [500, 0.0019],
  [1000, 0.0037], [2000, 0.0097], [4000, 0.0329], [8000, 0.1170],
]);

export function absorptionDbPerMetre(hz) {
  const f = Math.max(1, Number(hz) || 1);
  if (f <= ABSORPTION[0][0]) return ABSORPTION[0][1];
  const last = ABSORPTION[ABSORPTION.length - 1];
  if (f >= last[0]) return last[1];
  for (let i = 1; i < ABSORPTION.length; i += 1) {
    const [f1, a1] = ABSORPTION[i];
    if (f > f1) continue;
    const [f0, a0] = ABSORPTION[i - 1];
    // Log-log, because both axes are exponential in this band.
    const t = Math.log(f / f0) / Math.log(f1 / f0);
    return Math.exp(Math.log(a0) + t * (Math.log(a1) - Math.log(a0)));
  }
  return last[1];
}

// The frequency above which this path has thrown away `dbLimit` decibels. Used
// as the corner of the kernel's lowpass, so absorption is a real filter derived
// from a real table rather than a curve someone liked the shape of.
export function absorptionCutoffHz(metres, dbLimit = 12) {
  const r = Math.max(1, Number(metres) || 1);
  if (absorptionDbPerMetre(20000) * r <= dbLimit) return 20000;
  let lo = 20, hi = 20000;
  for (let i = 0; i < 40; i += 1) {
    const mid = Math.sqrt(lo * hi);
    if (absorptionDbPerMetre(mid) * r > dbLimit) hi = mid; else lo = mid;
  }
  return Math.sqrt(lo * hi);
}

// ── THE CHANNEL ──────────────────────────────────────────────────────────────
//
// A seeded 3D polyline in metres, listener at the origin. Tortuosity at two
// scales, which is the thing that matters: MACRO (~100m, wide turns) supplies
// the delay spread that makes thunder last for seconds, and MESO (~10m) supplies
// the kinks that keep radiating when the macro run has cancelled itself out.
//
// Real cloud-to-ground channels run 2-8km. The part below cloud base climbs; the
// part inside the cloud wanders nearly horizontally, and that horizontal wander
// is where a long roll comes from.
const CLOUD_BASE = 1300;
const MACRO_M = 100;
const MESO_M = 10;

export function makeChannel(seed = 1, { distance = 1200, bearing = 0, energy = 0.7 } = {}) {
  const rand = thunderRng(seed);
  const d = Math.max(60, Number(distance) || 60);
  const e = clamp(energy, 0, 1);
  // Where it hits the ground, relative to a listener standing at the origin.
  const gx = Math.sin(bearing) * d;
  const gz = Math.cos(bearing) * d;

  const length = 2000 + rand() * 6000;
  // Energy per unit length. Higher up the channel is weaker than the return
  // stroke near the ground, so E0 falls with height.
  const e0Base = 60e3 + e * 180e3;

  const points = [[gx, 0, gz]];
  // Straight up to start with; the macro walk bends it from there.
  let dir = [0, 1, 0];
  let travelled = 0;

  while (travelled < length && points.length < 1400) {
    // MACRO: a wide turn every ~100m. Below the cloud it is pulled back upright,
    // because a bolt to ground goes to ground. Above it, the bias is released and
    // the channel spreads sideways.
    const head = points[points.length - 1];
    const inCloud = head[1] > CLOUD_BASE;
    const spread = inCloud ? 0.75 : 0.42;         // radians, roughly +-30..43deg
    dir = perturb(dir, spread, rand);
    if (!inCloud) dir = towards(dir, [0, 1, 0], 0.55);
    else dir = towards(dir, [dir[0], 0.10, dir[2]], 0.45);
    dir = normalise(dir);

    const macro = MACRO_M * (0.6 + rand() * 0.8);
    const steps = Math.max(1, Math.round(macro / MESO_M));
    let meso = dir;
    for (let s = 0; s < steps && travelled < length; s += 1) {
      // MESO: the kinks. Small angles, but they are what survives when the run
      // as a whole has cancelled.
      meso = normalise(perturb(meso, 0.30, rand));
      const step = MESO_M * (0.7 + rand() * 0.6);
      const prev = points[points.length - 1];
      const next = [prev[0] + meso[0] * step, Math.max(0, prev[1] + meso[1] * step), prev[2] + meso[2] * step];
      points.push(next);
      travelled += step;
    }
  }

  const segments = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) continue;
    const height = (a[1] + b[1]) / 2;
    segments.push({
      mid: [(a[0] + b[0]) / 2, height, (a[2] + b[2]) / 2],
      dir: [dx / len, dy / len, dz / len],
      length: len,
      e0: e0Base * (0.30 + 0.70 * Math.exp(-height / 2000)),
    });
  }
  return { segments, points, length: travelled, distance: d, bearing, energy: e, seed };
}

function normalise(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}
function perturb(v, amount, rand) {
  return [
    v[0] + (rand() * 2 - 1) * amount,
    v[1] + (rand() * 2 - 1) * amount,
    v[2] + (rand() * 2 - 1) * amount,
  ];
}
function towards(v, target, mix) {
  return [
    v[0] + (target[0] - v[0]) * mix,
    v[1] + (target[1] - v[1]) * mix,
    v[2] + (target[2] - v[2]) * mix,
  ];
}

// ── THE CHANNEL-SHAPE FUNCTION ───────────────────────────────────────────────
//
// One impulse per segment: when it arrives, and how loud it is from here. The
// SPREAD OF THE DELAYS IS THE DURATION OF THE THUNDER — nothing sets the length
// of a roll except how much further one end of the bolt is than the other.
//
// Directivity is the standard line-source pattern, |sinc(k*L*cos(theta)/2)| with
// theta from the segment axis: unity broadside, and for a segment many
// wavelengths long, nulled end-on. That single term is the whole Ribner & Roy
// result — a straight run pointing at you nulls segment by segment, a straight
// run across you fires every segment at nearly the same delay and lands as one
// clap, and a tortuous channel puts segments at every angle so you get a spread
// of moderate arrivals, which is a rumble.
//
// BROADBAND SOURCES HAVE NO NULLS. |sinc| evaluated at one frequency has deep
// zeros at exact angles, and a first version of this used it directly — which
// meant a segment could be silenced by a tenth of a degree, and whether a strike
// two hundred metres away had a crack at all came down to which side of a null
// its lowest segment happened to fall on. A shock is broadband: every frequency
// nulls at a different angle, so the nulls fill in and what survives is the
// ENVELOPE of |sinc|, which is unity broadside and falls as 1/x end-on. That is
// this, and it is both smoother and more honest than the thing it replaces.
const directivity = (x) => 1 / Math.sqrt(1 + x * x);

export function channelShape(channel, listener = [0, 1.7, 0]) {
  const out = [];
  const lx = listener[0] || 0, ly = listener[1] || 0, lz = listener[2] || 0;
  for (const seg of channel.segments) {
    const dx = lx - seg.mid[0], dy = ly - seg.mid[1], dz = lz - seg.mid[2];
    const r = Math.hypot(dx, dy, dz);
    if (r < 1) continue;
    const cosTheta = (dx * seg.dir[0] + dy * seg.dir[1] + dz * seg.dir[2]) / r;
    const hz = characteristicHz(seg.e0);
    const k = (2 * Math.PI * hz) / C0;
    const d = directivity((k * seg.length * cosTheta) / 2);
    // Spherical spreading; a longer segment radiates more.
    out.push({ delay: r / C0, amp: (d * seg.length) / r, r, hz, cosTheta });
  }
  return out;
}

// ── THE N WAVE ───────────────────────────────────────────────────────────────
//
// A shock: instantaneous rise, linear fall through zero to an equal negative,
// instantaneous return. Its width is 1/f_max, so E0 sets it. The lowpass folded
// in here is this path's own atmospheric absorption, which is why the kernel is
// built per distance bin rather than once.
export function nWaveKernel(e0, metres, sampleRate = 48000) {
  const hz = characteristicHz(e0);
  const n = Math.max(3, Math.round(sampleRate / hz));
  const cutoff = absorptionCutoffHz(metres);
  // Two cascaded one-poles: -12dB/oct, which is far closer to the real skirt
  // than a single pole and costs one more line.
  const tail = Math.ceil((sampleRate / Math.max(40, cutoff)) * 6);
  const out = new Float32Array(n + tail);
  for (let i = 0; i < n; i += 1) out[i] = 1 - (2 * i) / (n - 1);

  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < out.length; i += 1) {
    y1 += a * (out[i] - y1);
    y2 += a * (y1 - y2);
    out[i] = y2;
  }
  let peak = 0;
  for (let i = 0; i < out.length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  return { samples: out, peak, hz, cutoff };
}

// ── RENDER ───────────────────────────────────────────────────────────────────
//
// Sparse convolution, binned so each bin carries its own N-wave: its own f_max
// from that part of the channel's E0, and its own absorption from that part's
// path length. That binning is what makes the near part of one flash crack while
// its own tail rumbles.
//
// `bands` is the indoor tilt, {low, mid, high} gains — see INDOORS below. It is
// an argument rather than a second code path, so there is one renderer.
const MAX_SECONDS = 14;
const SCATTER = 4;              // turbulent copies per arrival

export function renderThunder(channel, {
  sampleRate = 48000,
  listener = [0, 1.7, 0],
  bands = null,
  seed = null,
} = {}) {
  const rand = thunderRng(seed == null ? channel.seed * 7 + 3 : seed);
  const arrivals = channelShape(channel, listener);
  if (!arrivals.length) return { samples: new Float32Array(1), sampleRate, seconds: 0, arrivals: 0 };

  let t0 = Infinity, t1 = 0;
  for (const a of arrivals) { if (a.delay < t0) t0 = a.delay; if (a.delay > t1) t1 = a.delay; }
  const seconds = Math.min(MAX_SECONDS, t1 - t0 + 0.6);
  const total = Math.max(2, Math.ceil(seconds * sampleRate) + 1024);
  const out = new Float32Array(total);

  // Bin by path length and by f_max. Twelve kernels at the very most, built
  // lazily, and every arrival lands in the one that describes it.
  const kernels = new Map();
  const kernelFor = (r, e0) => {
    const rBin = Math.round(Math.log2(Math.max(60, r)) * 2);
    const eBin = Math.round(Math.log2(Math.max(1e3, e0)) * 2);
    const key = `${rBin}:${eBin}`;
    let kernel = kernels.get(key);
    if (!kernel) {
      kernel = nWaveKernel(Math.pow(2, eBin / 2), Math.pow(2, rBin / 2), sampleRate);
      kernels.set(key, kernel);
    }
    return kernel;
  };

  const e0For = new Map();
  for (const seg of channel.segments) e0For.set(seg, seg.e0);

  for (let i = 0; i < arrivals.length; i += 1) {
    const a = arrivals[i];
    if (a.amp <= 0) continue;
    const e0 = P0 * Math.pow(C0 / a.hz, 2);
    const kernel = kernelFor(a.r, e0);
    const k = kernel.samples;
    // TURBULENT SCATTERING. Each arrival reaches you as a small cluster rather
    // than as one clean pulse, because the kilometres in between are moving.
    // This is also the direct answer to the "unnatural sense of perfectness"
    // complaint: nothing in the render is allowed to land exactly on its
    // geometric time.
    for (let s = 0; s < SCATTER; s += 1) {
      const jitter = s === 0 ? 0 : (rand() * 2 - 1) * 0.010 * (1 + a.r / 3000);
      const weight = (s === 0 ? 1 : 0.36 * (1 - s / SCATTER)) * (0.75 + rand() * 0.5);
      const at = Math.round((a.delay - t0 + jitter) * sampleRate);
      if (at < 0) continue;
      const gain = a.amp * weight;
      const end = Math.min(k.length, total - at);
      for (let j = 0; j < end; j += 1) out[at + j] += k[j] * gain;
    }
    // GROUND REFLECTION, as an image source under the floor. At these ranges the
    // path difference is centimetres, so it is a comb rather than an echo — which
    // is what it actually is, and it is a lot of the colour.
    const image = Math.round((a.delay - t0 + (2 * 1.7 * 1.7) / (a.r * C0)) * sampleRate);
    if (image >= 0 && image < total) {
      const end = Math.min(k.length, total - image);
      for (let j = 0; j < end; j += 1) out[image + j] += k[j] * a.amp * 0.62;
    }
  }

  if (bands) applyBandTilt(out, sampleRate, bands);
  normalise01(out);
  // A near strike's channel runs kilometres past it, so the geometric tail can
  // be eight seconds of nothing. Trim what is below -60dB rather than carry it
  // and play it: two of these can overlap, and they are megabytes each.
  const trimmed = trimTail(out, sampleRate);
  return { samples: trimmed, sampleRate, seconds: trimmed.length / sampleRate, arrivals: arrivals.length };
}

// ── INDOORS IS A TILT, NOT A FADER ───────────────────────────────────────────
//
// Thunder is the one part of a storm a building cannot keep out, so nothing is
// withheld indoors — what changes is WHICH PART of it reaches you. A roof passes
// the low and stops the top, which is the same shape propagateSpectrum already
// describes for every other occluded sound in the building (low -18%, mid -46%,
// high -78%). Three one-poles, perfect reconstruction, so bands of {1,1,1} is
// bit-for-bit the outdoor render.
//
// The crossovers are placed against THIS material rather than at generic
// hi-fi points: thunder's weight is under 120Hz, its body is 120-800, and its
// crack is what lives above 800. Set at 300/2500 the whole audible top of a
// thunderclap fell inside "mid" and a basement took only four decibels off it,
// which is not what a building does.
const BAND_LO = 120, BAND_HI = 800;

function applyBandTilt(buffer, sampleRate, bands) {
  const gl = Math.max(0, Number(bands.low) ?? 1);
  const gm = Math.max(0, Number(bands.mid) ?? 1);
  const gh = Math.max(0, Number(bands.high) ?? 1);
  if (gl === 1 && gm === 1 && gh === 1) return;
  const a1 = 1 - Math.exp((-2 * Math.PI * BAND_LO) / sampleRate);
  const a2 = 1 - Math.exp((-2 * Math.PI * BAND_HI) / sampleRate);
  let lo = 0, mid = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const x = buffer[i];
    lo += a1 * (x - lo);
    mid += a2 * (x - mid);
    buffer[i] = lo * gl + (mid - lo) * gm + (x - mid) * gh;
  }
}

function trimTail(buffer, sampleRate, floor = 0.001) {
  let last = buffer.length - 1;
  while (last > sampleRate * 0.25 && Math.abs(buffer[last]) < floor) last -= 1;
  const end = Math.min(buffer.length, last + Math.round(sampleRate * 0.15));
  return end >= buffer.length ? buffer : buffer.slice(0, end);
}

function normalise01(buffer) {
  let peak = 0;
  for (let i = 0; i < buffer.length; i += 1) peak = Math.max(peak, Math.abs(buffer[i]));
  if (peak <= 1e-9) return;
  const scale = 1 / peak;
  for (let i = 0; i < buffer.length; i += 1) buffer[i] *= scale;
}

// ── LEVEL ────────────────────────────────────────────────────────────────────
//
// The render carries the CHARACTER; this carries the LEVEL, and they are kept
// apart on purpose — the buffer is peak-normalised so a distant strike is not
// quietly clipped by its own absorption, and the distance law is applied once,
// at the gain node.
//
// The ceiling is 0.17 and it stays there. The old value was 0.34, which was a
// mastering level rather than a weather level: a close crack arrived beside UI
// and dialogue at nearly half scale before the SFX bus. A better-sounding
// thunder is not a louder one.
export const NEAR = 300;
export const FAR = 7000;

export function thunderFar(distance) {
  return clamp((clamp(distance, 60, FAR * 1.5) - NEAR) / (FAR - NEAR), 0, 1);
}

export function thunderGain(distance = 1200, energy = 0.7) {
  // The inverse square, floored so a distant storm is still THERE.
  return clamp(0.14 * clamp(energy, 0, 1) * (1 - thunderFar(distance) * 0.72), 0.016, 0.17);
}

// ── WHERE YOU ARE STANDING ───────────────────────────────────────────────────
//
// Thunder is the one part of a storm a building cannot keep out, so nothing is
// withheld indoors and this never returns silence. What it returns is WHICH PART
// of the storm reaches you, as the same three band gains every other occluded
// sound in the building is described with.
//
// The building's general occlusion helper is no use here: acousticOcclusionDb
// ray-marches solid cells BETWEEN TWO POSITIONS IN THE PLAN, and thunder has no
// source cell — it is the sky. So the two facts that are actually available are
// the ones the flash already uses: whether there is sky over this cell, and how
// much building is stacked above you.
import { propagateSpectrum } from './acoustic-propagation.js';

export function thunderIndoorBands({ sky = true, floorsBelowRoof = 0 } = {}) {
  if (sky) return { low: 1, mid: 1, high: 1 };
  // A roof is most of the occlusion; each further floor adds less than the one
  // above it did, which is why this saturates rather than stacking linearly.
  const occlusion = clamp(0.42 + 0.15 * Math.max(0, floorsBelowRoof), 0, 1);
  return propagateSpectrum({ low: 1, mid: 1, high: 1 }, { occlusion });
}
