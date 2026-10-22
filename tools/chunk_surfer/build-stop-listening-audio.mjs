// The ear room's sound bank, from real recordings (data/stop-listening.js
// STOP_LISTENING_SOURCES; licences in third_party/licenses/STOP-LISTENING-AUDIO.md).
//
//   node tools/chunk_surfer/build-stop-listening-audio.mjs [--fetch]
//
// --fetch downloads each source into its own directory under
// artifacts/stop-listening/sources/ (gitignored, with its sha256). Without it the
// sources already there are used. Output: public/audio/stop-listening/*.mp3 and
// manifest.json, which is all the runtime reads.
//
// WHAT IS DONE TO THEM, AND WHY IT IS DONE HERE. Events are cut where the gut
// actually moves (an energy gate over 20 ms frames), cleaned at the edges and
// levelled to one loudness. The dominant crushed branch has its own sample
// clock: 9-bit/24 kHz gut events, 8-bit/22.05 kHz wet events, 10-bit/32 kHz beds.
// These are actual held/quantised waveform rates, separate from MP3 encoding.
// Reverb and placement are the runtime's (audio/stop-listening-gut.js),
// because they depend on the room and on where he is standing.

import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { STOP_LISTENING_SOURCES, STOP_LISTENING_AUDIO_DIR } from '../../src/data/stop-listening.js';
import { STOP_LISTENING_CRUSH, bitcrush, levelMatch, signalStats } from './stop-listening-dsp.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const sourceDir = path.join(root, 'artifacts/stop-listening/sources');
const outDir = path.join(root, 'public', STOP_LISTENING_AUDIO_DIR);
const RATE = 44100;
const CRUSH = Object.freeze({ ...STOP_LISTENING_CRUSH.gut,
  method: 'fractional-clock-interpolated-signed-pcm-zero-order-hold',
  profiles: STOP_LISTENING_CRUSH });
const receiptDir = path.join(root, 'artifacts/ear-room-refinement');

// How many events each source gives. Long digestion recordings give the most;
// the one-shot squelches give what they have.
const EVENTS = {
  'borygmi-gurgles3': 10, 'borygmi-gurgles2': 8, 'starlite-tummy-grumble': 8, 'borygmi-gurgle1': 3,
  'borygmi-bubbling1': 3, 'borygmi-percolating1': 1, 'borygmi-groaning1': 1, 'christo13-squishing': 6,
  'cabled-mess-wet-sponge': 5, 'editor-adp-gooey-squish': 1, 'stephan-slime-smacking': 3,
};
// The continuous murmur under the events: two loops from the longest gut takes.
const BEDS = [
  { id: 'bed-a', source: 'borygmi-gurgles2', seconds: 22 },
  { id: 'bed-b', source: 'starlite-tummy-grumble', seconds: 22 },
];

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function sourceFile(source) {
  const dir = path.join(sourceDir, source.id);
  const ext = path.extname(new URL(source.download).pathname) || '.bin';
  return { dir, file: path.join(dir, `source${ext}`) };
}

function fetchSources() {
  for (const source of STOP_LISTENING_SOURCES) {
    const { dir, file } = sourceFile(source);
    fs.mkdirSync(dir, { recursive: true });
    const r = cp.spawnSync('curl', ['-sfL', '-m', '120', '-A', 'chunk-surfer-asset-build/1.0', '-o', file, source.download], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`could not fetch ${source.id}`);
  }
}

function decode(file) {
  const r = cp.spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr}`);
  const buf = r.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
}

function encode(samples, file) {
  const r = cp.spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-',
    '-ar', '32000', '-c:a', 'libmp3lame', '-b:a', '80k', file], { input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength) });
  if (r.status !== 0) throw new Error(`ffmpeg could not encode ${file}: ${r.stderr}`);
}

// One-pole high-pass at 60 Hz: phone-mic rumble and DC out, nothing audible lost.
function highpass(x, hz = 60) {
  const a = Math.exp(-2 * Math.PI * hz / RATE), y = new Float32Array(x.length);
  let px = 0, py = 0;
  for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; }
  return y;
}

function frames(x, hop = Math.round(RATE * 0.02)) {
  const out = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let e = 0;
    for (let k = i; k < i + hop; k++) e += x[k] * x[k];
    out.push(Math.sqrt(e / hop));
  }
  return { rms: out, hop };
}

const percentile = (values, p) => { const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// Where the gut moves: frames over a gate set from the recording's own floor,
// merged across short gaps, kept between a quarter-second and three and a half.
function eventRegions(x) {
  const { rms, hop } = frames(x);
  const floor = percentile(rms, 0.2), peak = percentile(rms, 0.995);
  const gate = Math.max(floor * 2.8, peak * 0.08);
  const regions = [];
  let start = -1, quiet = 0;
  for (let i = 0; i <= rms.length; i++) {
    const on = i < rms.length && rms[i] > gate;
    if (on) { if (start < 0) start = i; quiet = 0; continue; }
    if (start < 0) continue;
    quiet += 1;
    if (quiet * hop / RATE < 0.18 && i < rms.length) continue;
    const end = i - quiet + 1;
    regions.push({ start, end });
    start = -1; quiet = 0;
  }
  const out = [];
  for (const r of regions) {
    let a = r.start, b = r.end;
    const maxFrames = Math.round(3.5 * RATE / hop), minFrames = Math.round(0.25 * RATE / hop);
    while (b - a > maxFrames) {
      // Split a long run at its quietest frame in the back half of the window.
      let cut = a + maxFrames, low = Infinity;
      for (let i = a + Math.round(maxFrames * 0.5); i < a + maxFrames; i++) if (rms[i] < low) { low = rms[i]; cut = i; }
      out.push({ start: a, end: cut });
      a = cut;
    }
    if (b - a >= minFrames) out.push({ start: a, end: b });
  }
  return out.map((r) => {
    let energy = 0;
    for (let i = r.start; i < r.end; i++) energy += rms[i] * rms[i];
    return { from: r.start * hop, to: r.end * hop, energy };
  });
}

function rmsOf(x) { let e = 0; for (const v of x) e += v * v; return Math.sqrt(e / Math.max(1, x.length)); }

// Common loudness, with a peak ceiling so a single slap does not set the level.
function level(x, targetDb) {
  const rms = rmsOf(x), peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const gain = Math.min(10 ** (targetDb / 20) / Math.max(1e-9, rms), 10 ** (-3 / 20) / Math.max(1e-9, peak));
  return x.map((v) => v * gain);
}

function fadeEdges(x, inS = 0.008, outS = 0.06) {
  const a = Math.round(inS * RATE), b = Math.round(outS * RATE);
  for (let i = 0; i < a && i < x.length; i++) x[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / a);
  for (let i = 0; i < b && i < x.length; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / b);
  return x;
}

function loopBed(x, seconds) {
  // The steadiest window: the one whose frame energy varies least, with enough
  // in it to be a sound. Then its tail is crossfaded into its head.
  const { rms, hop } = frames(x);
  const span = Math.round(seconds * RATE / hop), xf = Math.round(1.5 * RATE);
  let best = 0, bestScore = Infinity;
  const median = percentile(rms, 0.5);
  for (let i = 0; i + span < rms.length; i += 10) {
    const w = rms.slice(i, i + span), mean = w.reduce((a, b) => a + b, 0) / span;
    const varc = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / span) / Math.max(1e-9, mean);
    const score = varc + (mean < median ? 2 : 0);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  const a = best * hop, n = span * hop;
  const out = x.slice(a, a + n);
  for (let i = 0; i < xf; i++) {
    const t = i / xf;
    out[i] = out[i] * Math.sin(t * Math.PI / 2) + x[a + n + i] * Math.cos(t * Math.PI / 2);
  }
  return { samples: out, from: a / RATE };
}

if (process.argv.includes('--fetch')) fetchSources();
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (f.endsWith('.mp3')) fs.unlinkSync(path.join(outDir, f));

const manifest = { crush: CRUSH, rate: 32000, events: [], beds: [], sources: [] };
const receipt = { processingSampleRate: RATE, encoding: { codec: 'MP3', rate: 32000, channels: 1, kbps: 80 },
  profiles: STOP_LISTENING_CRUSH, files: [], sources: manifest.sources,
  matchReference: 'Previous bank treatment: 8-bit, every-third-sample (14.7 kHz), 32% parallel mix; identical source cuts before MP3 encoding.',
  runtimeUnchanged: 'Voice positions, cadence, pitch, directional filtering, synthetic room reverb and monitor/recording mute preserved.',
  validation: 'Technical measurements; human authoring comparison and fresh-player validation remain pending.' };
function processGrain(input, profile, file) {
  // Reproduce the previous bank's pre-encoding treatment only as a level
  // reference. Its parallel hold lost energy on some wet transients: matching
  // an uncrushed take instead would make the new bank up to 1.5 dB louder.
  const reference = new Float32Array(input.length);
  let held = 0;
  for (let i = 0; i < input.length; i++) {
    if (i % 3 === 0) held = Math.round(input[i] * 128) / 128;
    reference[i] = input[i] * .68 + held * .32;
  }
  const samples = levelMatch(bitcrush(input, RATE, profile), reference);
  const before = signalStats(reference), after = signalStats(samples);
  if (!after.finite || after.peakDb > -2.999) throw new Error(`Invalid processed audio ${file}`);
  receipt.files.push({ file, profile, source: signalStats(input), before, after, rmsChangeDb: after.rmsDb - before.rmsDb });
  return samples;
}
for (const source of STOP_LISTENING_SOURCES) {
  const { file } = sourceFile(source);
  if (!fs.existsSync(file)) throw new Error(`${source.id}: no source at ${path.relative(root, file)} (run with --fetch)`);
  manifest.sources.push({ id: source.id, sha256: sha(fs.readFileSync(file)) });
  const x = highpass(decode(file));
  // A one-shot shorter than the gate's own statistics is all event: keep it whole.
  const found = eventRegions(x);
  const regions = (found.length ? found : [{ from: 0, to: x.length, energy: 1 }])
    .sort((a, b) => b.energy - a.energy).slice(0, EVENTS[source.id] || 2)
    .sort((a, b) => a.from - b.from);
  regions.forEach((r, n) => {
    const pre = Math.round(0.04 * RATE), post = Math.round(0.14 * RATE);
    const cut = x.slice(Math.max(0, r.from - pre), Math.min(x.length, r.to + post));
    const name = `${source.id}-${String(n + 1).padStart(2, '0')}.mp3`;
    const profile = STOP_LISTENING_CRUSH[source.role === 'gut' ? 'gut' : 'wet'];
    const samples = processGrain(fadeEdges(level(cut, -20)), profile, name);
    encode(samples, path.join(outDir, name));
    manifest.events.push({ id: `${source.id}-${n + 1}`, file: name, source: source.id, role: source.role,
      seconds: +(samples.length / RATE).toFixed(3), from: +(Math.max(0, r.from - pre) / RATE).toFixed(3), crush: profile });
  });
}
for (const bed of BEDS) {
  const source = STOP_LISTENING_SOURCES.find((s) => s.id === bed.source);
  const looped = loopBed(highpass(decode(sourceFile(source).file)), bed.seconds);
  const name = `${bed.id}.mp3`;
  const samples = processGrain(level(looped.samples, -27), STOP_LISTENING_CRUSH.bed, name);
  encode(samples, path.join(outDir, name));
  manifest.beds.push({ id: bed.id, file: name, source: bed.source, seconds: bed.seconds, from: +looped.from.toFixed(3), crush: STOP_LISTENING_CRUSH.bed });
}
manifest.processingSampleRate = RATE;
manifest.encoding = receipt.encoding;
manifest.levelReference = receipt.matchReference;
for (const entry of [...manifest.events, ...manifest.beds]) {
  const measurement = receipt.files.find((file) => file.file === entry.file);
  entry.levels = { beforeRmsDb: measurement.before.rmsDb, rmsDb: measurement.after.rmsDb,
    peakDb: measurement.after.peakDb, finite: measurement.after.finite, rmsChangeDb: measurement.rmsChangeDb };
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.mkdirSync(receiptDir, { recursive: true });
fs.writeFileSync(path.join(receiptDir, 'audio-processing.json'), `${JSON.stringify(receipt, null, 2)}\n`);
const bytes = fs.readdirSync(outDir).reduce((sum, f) => sum + fs.statSync(path.join(outDir, f)).size, 0);
console.log(`stop-listening audio: ${manifest.events.length} events, ${manifest.beds.length} beds, ${(bytes / 1024).toFixed(0)} KB`);
