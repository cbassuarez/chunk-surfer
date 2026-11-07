// Build the music-box keepsake overture as a mix of the three sources the game
// already owns: Seb's broken music-box recording (Clair de lune), the Bach
// Chaconne (12-recorder ensemble) and the Couperin harpsichord. Nothing is
// synthesised or re-composed — each source is a real recording, arranged and
// crushed to the game's lo-fi texture.
//
// Run: node tools/chunk_surfer/build-music-box-overture.mjs
// Output: assets/music-box/overture.wav (+ .m4a via ffmpeg when available).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loFi, LO_FI_DEFAULTS } from '../../src/audio/lo-fi.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const phrasesDir = join(root, 'assets', 'music-box', 'phrases');
const outWav = join(root, 'assets', 'music-box', 'overture.wav');

const SAMPLE_RATE = 44100;
const TARGET_RATE = 22050; // inside the 20-32 kHz window; 44.1k -> 22.05k hold factor 2.
const TMP = mkdtempSync(join(tmpdir(), 'keepsake-overture-'));

function readWav(path) {
  const bytes = readFileSync(path);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw Error(`Not a WAV: ${path}`);
  let channels = 1, rate = 44100, bits = 16, offset = 12, data = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') { channels = bytes.readUInt16LE(body + 2); rate = bytes.readUInt32LE(body + 4); bits = bytes.readUInt16LE(body + 14); }
    else if (id === 'data') data = bytes.subarray(body, body + size);
    offset = body + size + (size & 1);
  }
  if (!data || channels !== 1 || bits !== 16) throw Error(`Expected mono 16-bit WAV: ${path}`);
  const samples = new Float32Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
  return samples;
}

function decodeMp3(src) {
  const out = join(TMP, `${Math.random().toString(36).slice(2)}.wav`);
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-ac', '1', '-ar', String(SAMPLE_RATE), out], { encoding: 'utf8' });
  if (r.status !== 0) throw Error(`ffmpeg decode failed for ${src}: ${r.stderr}`);
  return readWav(out);
}

function writeWav(path, samples, rate = SAMPLE_RATE) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples.length * 2, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  writeFileSync(path, buffer);
}

// Source II's room: the same deterministic reflections as createStandingTearImpulse
// (src/audio/standing-tear-dsp.js), mono, so the chaconne is identical to how it
// plays in-game — a 6.8 s decay, pre-delay, coloured tail and six early taps.
function standingTearImpulse(decaySeconds = 6.8, rate = SAMPLE_RATE) {
  const length = Math.ceil(rate * decaySeconds), preDelay = .072;
  const values = new Float32Array(length);
  let state = (0x73555246 ^ 0x17ae239b) >>> 0, colour = 0;
  for (let i = Math.ceil(preDelay * rate); i < length; i++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0;
    colour += (state / 0xffffffff * 2 - 1 - colour) * .22;
    const time = i / rate, attack = Math.min(1, (time - preDelay) / .12);
    values[i] = colour * attack * Math.exp(-6.90775527898 * time / decaySeconds);
  }
  for (const [seconds, level] of [[.113, .62], [.197, -.47], [.337, .40], [.557, -.32], [.907, .24], [1.417, -.17]]) {
    const index = Math.round(seconds * rate);
    if (index < length) values[index] += level * Math.sqrt(rate * .025);
  }
  const energy = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  for (let i = 0; i < length; i++) values[i] /= energy;
  return values;
}

// Convolve a signal with the Source II impulse (FFT convolution via ffmpeg afir),
// at the same dry/wet as SOURCE_REST_MUSIC_MIX.
function applyReverb(samples, { decaySeconds = 6.8, dry = 0.72, wet = 0.86 } = {}) {
  const dryPath = join(TMP, 'dry.wav'), impulsePath = join(TMP, 'impulse.wav'), outPath = join(TMP, 'wet.wav');
  writeWav(dryPath, samples);
  writeWav(impulsePath, standingTearImpulse(decaySeconds));
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', dryPath, '-i', impulsePath, '-filter_complex', `afir=dry=${dry}:wet=${wet}`, '-ac', '1', '-ar', String(SAMPLE_RATE), outPath], { encoding: 'utf8' });
  if (r.status !== 0) throw Error(`ffmpeg afir failed: ${r.stderr}`);
  return readWav(outPath);
}

// Linear-interpolation stretch (2x = half speed), for the slow closing pad.
function stretch(samples, factor) {
  const out = new Float32Array(Math.round(samples.length * factor));
  for (let i = 0; i < out.length; i++) {
    const src = i / factor, a = Math.floor(src), b = Math.min(samples.length - 1, a + 1), f = src - a;
    out[i] = samples[a] * (1 - f) + samples[b] * f;
  }
  return out;
}

const phrase = (id) => readWav(join(phrasesDir, `${id}.wav`));
const p1 = phrase('phrase_1'), p2 = phrase('phrase_2'), p3 = phrase('phrase_3'), p4 = phrase('phrase_4'), p5 = phrase('phrase_5');
// The Bach is Seb's chaconne exactly as the game ships it: no reverb, no
// bitcrush, no remastering — its own processing is the recording.
const bach = decodeMp3(join(root, 'public', 'audio', 'source-rest', 'seb-bach-chaconne-105.mp3'));
const couperin = decodeMp3(join(root, 'artifacts', 'couperin-live12', 'audio', 'Couperin-human-reference.wav'));

function trim(samples, seconds) { return samples.subarray(0, Math.min(samples.length, Math.round(seconds * SAMPLE_RATE))); }
function concat(...arrays) { const total = arrays.reduce((n, a) => n + a.length, 0); const out = new Float32Array(total); let o = 0; for (const a of arrays) { out.set(a, o); o += a.length; } return out; }
// The game's existing radio dial cut (src/audio/radio-dial-cut.js), rendered
// offline with the same parameters: detent clicks, a bandpass static sweep and a
// heterodyne whistle sliding down. Reused verbatim so the overture's station
// changes sound like the cab radio, not an invented hiss.
function radioDialCutPcm(seconds = 0.95, rate = SAMPLE_RATE) {
  const A = { clicks: [0, .06, .13, .21], land: .8,
    static: { attack: .05, release: .92, level: .16, sweep: [[0, 700], [.25, 2600], [.5, 1400], [.72, 3200], [.9, 1800]] },
    whistle: { from: 2400, to: 600, seconds: .5, level: .022 } };
  const n = Math.max(1, Math.round(seconds * rate));
  const out = new Float32Array(n);
  let seed = 4417 >>> 0;
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const lin = (t, a, b, v0, v1) => t <= a ? v0 : t >= b ? v1 : v0 + (v1 - v0) * (t - a) / (b - a);
  const expEnv = (t, a, b, v0, v1) => t <= a ? v0 : t >= b ? v1 : v0 * Math.pow(v1 / v0, (t - a) / (b - a));

  // Detents: highpassed noise tick + 140 Hz shaft thunk.
  const click = (at, level = 1) => {
    const s = Math.round(at * rate), f0 = 1800, Q = 0.7071, w0 = 2 * Math.PI * f0 / rate, alpha = Math.sin(w0) / (2 * Q);
    const b0 = (1 + Math.cos(w0)) / 2, b1 = -(1 + Math.cos(w0)), b2 = (1 + Math.cos(w0)) / 2, a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < Math.round(.03 * rate) && s + i < n; i++) {
      const t = i / rate, x = noise();
      const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      out[s + i] += y * lin(t, 0, .002, 0, .22 * level) * expEnv(t, .002, .02, 1, .0005 / (.22 * level));
    }
    for (let i = 0; i < Math.round(.04 * rate) && s + i < n; i++) {
      const t = i / rate;
      out[s + i] += Math.sin(2 * Math.PI * 140 * i / rate) * lin(t, 0, .003, 0, .1 * level) * expEnv(t, .003, .03, 1, .0005 / (.1 * level));
    }
  };
  for (const at of A.clicks) click(at * seconds / .95);
  click(A.land * seconds / .95, 1.25);

  // The band between stations: bandpass static, de-emphasis low-pass, swept
  // through the dial and captured (squelched) the moment the needle lands.
  { const sweep = A.static.sweep, Q = 1.2, lpHz = 5200, lpQ = 0.55;
    const fAt = (t) => { const u = t / seconds; for (let k = 1; k < sweep.length; k++) if (u <= sweep[k][0]) { const [u0, h0] = sweep[k - 1], [u1, h1] = sweep[k]; return h0 + (h1 - h0) * (u - u0) / (u1 - u0); } return sweep[sweep.length - 1][1]; };
    const env = (t) => {
      const L = A.static.level, att = A.static.attack * seconds, land = A.land * seconds, rel = A.static.release * seconds;
      if (t < att) return t / att * L;
      if (t < land) return L;
      if (t < land + .035) return L * (1 - .93 * (t - land) / .035);
      return L * .07 * Math.max(0, 1 - (t - land - .035) / (rel - land - .035));
    };
    let bx1 = 0, bx2 = 0, by1 = 0, by2 = 0, lx1 = 0, lx2 = 0, ly1 = 0, ly2 = 0;
    const lpW0 = 2 * Math.PI * lpHz / rate, lpA = Math.sin(lpW0) / (2 * lpQ);
    const lpB0 = (1 - Math.cos(lpW0)) / 2, lpB1 = 1 - Math.cos(lpW0), lpB2 = (1 - Math.cos(lpW0)) / 2, lpA0 = 1 + lpA, lpA1 = -2 * Math.cos(lpW0), lpA2 = 1 - lpA;
    const end = Math.min(n, Math.round(A.static.release * seconds * rate));
    for (let i = 0; i < end; i++) {
      const t = i / rate, f0 = fAt(t), w0 = 2 * Math.PI * f0 / rate, alpha = Math.sin(w0) / (2 * Q);
      const b0 = alpha, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
      const x = noise();
      const by = (b0 / a0) * x + (b2 / a0) * bx2 - (a1 / a0) * by1 - (a2 / a0) * by2;
      bx2 = bx1; bx1 = x; by2 = by1; by1 = by;
      const ly = (lpB0 / lpA0) * by + (lpB1 / lpA0) * lx1 + (lpB2 / lpA0) * lx2 - (lpA1 / lpA0) * ly1 - (lpA2 / lpA0) * ly2;
      lx2 = lx1; lx1 = by; ly2 = ly1; ly1 = ly;
      out[i] += ly * env(t);
    }
  }

  // A carrier crossed on the way: the whistle sliding down.
  { const s = Math.round(.06 * seconds * rate), dur = Math.round((.12 + A.whistle.seconds) * seconds * rate);
    const f0t = .08 * seconds, f1t = f0t + A.whistle.seconds; let phase = 0;
    for (let i = 0; i < dur && s + i < n; i++) {
      const t = i / rate, tt = .06 * seconds + t;
      const freq = tt <= f0t ? A.whistle.from : tt >= f1t ? A.whistle.to : A.whistle.from * Math.pow(A.whistle.to / A.whistle.from, (tt - f0t) / (f1t - f0t));
      phase += 2 * Math.PI * freq / rate;
      out[s + i] += Math.sin(phase) * lin(tt, .08 * seconds, .12 * seconds, 0, A.whistle.level) * lin(tt, .1 * seconds, .1 * seconds + A.whistle.seconds, 1, 0);
    }
  }
  return out;
}

// Normalise a station to a shared loudness so the radio scan is balanced, not
// a loud box then a faint harpsichord.
function normalizeRms(samples, targetRms = 0.05) {
  let sum = 0; for (const v of samples) sum += v * v;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  if (rms < 1e-4) return samples;
  const out = new Float32Array(samples.length), g = targetRms / rms;
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g;
  return out;
}

// Standard radio output treatment: band-limit to a small speaker (300 Hz - 6 kHz)
// and a little saturation, so the Couperin reads as a station through the cab
// radio rather than a clean file. The Bach stays untouched; the box is lo-fi.
function biquadLowpass(samples, f0, Q, rate = SAMPLE_RATE) {
  const w0 = 2 * Math.PI * f0 / rate, alpha = Math.sin(w0) / (2 * Q);
  const b0 = (1 - Math.cos(w0)) / 2, b1 = 1 - Math.cos(w0), b2 = (1 - Math.cos(w0)) / 2, a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  const out = new Float32Array(samples.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) { const x = samples[i], y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y; }
  return out;
}
function biquadHighpass(samples, f0, Q, rate = SAMPLE_RATE) {
  const w0 = 2 * Math.PI * f0 / rate, alpha = Math.sin(w0) / (2 * Q);
  const b0 = (1 + Math.cos(w0)) / 2, b1 = -(1 + Math.cos(w0)), b2 = (1 + Math.cos(w0)) / 2, a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  const out = new Float32Array(samples.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) { const x = samples[i], y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y; }
  return out;
}
function radioOutput(samples) {
  let out = biquadHighpass(samples, 300, 0.7);
  out = biquadLowpass(out, 6000, 0.7);
  const sat = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) sat[i] = Math.tanh(out[i] * 1.4) * 0.85;
  return sat;
}

// A radio scan: every station keeps playing from t=0 (each has its own transport);
// seeking only changes which one is audible, so tuning back to a station resumes
// it at its later position, never from the start. The music box loops its five
// phrase playthroughs, cleanest first: the opening phrase is the established
// mid-recording take, not the transport-heavy first wind-up (whose phone-set-down
// and wind-up noise we avoid entirely).
//
// Each station gets its own voice:
//   box      -> lo-fi (the broken keepsake, bitcrushed)
//   bach     -> clean (Source II recording, untouched)
//   couperin -> standard radio output (band-limited + saturated)
const boxLoop = concat(p5, p4, p3, p2, p1);
const stations = {
  box: { samples: normalizeRms(loFi(boxLoop, { bits: 10, sampleRate: SAMPLE_RATE, targetRate: TARGET_RATE })), loop: true },
  bach: { samples: normalizeRms(bach), loop: false },
  couperin: { samples: normalizeRms(radioOutput(couperin)), loop: false },
};
// Which station is heard when, aligned to the Ophanim prologue dialogue parts
// (src/data/opening-prologue.js, cumulative stage seconds):
//   reveal   0 - 27   wheels open            -> box
//   talk    27 - 100  Ellery, school, boy    -> Bach Chaconne
//   fates  100 - 182  the twenty-four eyes   -> Couperin
//   last   182 - 212  the last eye dark      -> box (its transport advanced)
const schedule = [
  { station: 'box', at: 0.0, until: 27.0, gain: 1.0 },
  { station: 'bach', at: 27.0, until: 100.0, gain: 0.82 },
  { station: 'couperin', at: 100.0, until: 182.0, gain: 0.78 },
  { station: 'box', at: 182.0, until: 212.0, gain: 0.7 },
];
const SEEK = 3.0, TUNE = 1.1, END_SECONDS = 212.0;
const master = new Float32Array(Math.round(END_SECONDS * SAMPLE_RATE));
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));

function activeAt(t) {
  for (const s of schedule) {
    if (t >= s.at && t < s.until) {
      let g = s.gain, local = t - s.at, dur = s.until - s.at;
      if (local < SEEK) g *= ease(local / SEEK);
      if (dur - local < SEEK) g *= ease((dur - local) / SEEK);
      return { station: stations[s.station], gain: g };
    }
  }
  return { station: null, gain: 0 };
}

for (let i = 0; i < master.length; i++) {
  const t = i / SAMPLE_RATE, active = activeAt(t);
  if (active.station) {
    const dur = active.station.samples.length / SAMPLE_RATE;
    const pos = active.station.loop ? t % dur : Math.min(t, dur - 1e-4);
    master[i] = active.station.samples[Math.floor(pos * SAMPLE_RATE)] * active.gain;
  }
}
// The dial cut sits in the gap at each station change.
for (let k = 1; k < schedule.length; k++) {
  const at = Math.round((schedule[k].at - TUNE * 0.55) * SAMPLE_RATE);
  const sweep = radioDialCutPcm(TUNE);
  for (let i = 0; i < sweep.length && at + i < master.length && at + i >= 0; i++) master[at + i] += sweep[i] * 0.5;
}
let peak = 0; for (const v of master) peak = Math.max(peak, Math.abs(v));
if (peak > 1e-4) for (let i = 0; i < master.length; i++) master[i] *= 0.88 / peak;
const fadeIn = Math.round(4.0 * SAMPLE_RATE), fadeOut = Math.round(16.0 * SAMPLE_RATE);
for (let i = 0; i < fadeIn; i++) master[i] *= i / fadeIn;
for (let i = 0; i < fadeOut; i++) master[master.length - 1 - i] *= ease(i / fadeOut);

writeWav(outWav, master, SAMPLE_RATE);
console.log(`wrote ${outWav}  (${(master.length / SAMPLE_RATE).toFixed(1)}s)`);
console.log(`stations: box (lo-fi) + Bach (seb-bach-chaconne-105, unprocessed) + Couperin (radio output), radio-seek aligned to the prologue dialogue`);

const ffmpeg = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', outWav, '-c:a', 'aac', '-b:a', '160k', outWav.replace(/\.wav$/, '.m4a')], { encoding: 'utf8' });
if (ffmpeg.status === 0) console.log(`wrote ${outWav.replace(/\.wav$/, '.m4a')}`);
else if (ffmpeg.error) console.log('ffmpeg unavailable; WAV only:', ffmpeg.error);
