// Render the Sarah tape through the game's own dialog TTS (SAM) as a fallback,
// using the exact voice profiles from src/audio/sam-voice.js — sarah (band-limited,
// smeared) and recordist (tape hiss + wobble) — then stitch it with tape hiss and
// gaps into one recording.
//
// Run: node tools/chunk_surfer/build-sarah-playback-tape-fallback.mjs
import { renderSamSamples, profileFor } from '../../src/audio/sam-voice.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RATE = 22050;
const GAP = 0.42;

const LINES = [
  { who: 'sarah', text: 'Row F. You had the recorder on your knee. You were setting a level while I said it.' },
  { who: 'sarah', text: "Don't record this." },
  { who: 'recordist', text: "I'm not recording." },
  { who: 'sarah', text: "You're always recording." },
  { who: 'sarah', text: 'You never played me back. Not once. I used to think it was kindness.' },
  { who: 'recordist', text: 'It was. You hated it.' },
  { who: 'sarah', text: 'I hated hearing myself. You liked that I hated it. It meant you got to keep it all and never once be asked about it.' },
  { who: 'sarah', text: 'You kept all of it, then.' },
  { who: 'recordist', text: 'I keep everything. That is the job. That has always been the job.' },
  { who: 'sarah', text: 'You kept me changing. You never once kept me working.' },
  { who: 'sarah', text: 'You were so good about it. Every appointment. Every form. You told people you were proud of me.' },
  { who: 'recordist', text: 'I was proud of you.' },
  { who: 'sarah', text: 'You were proud of the change. You liked who I was turning into and you liked being the one standing next to her.' },
  { who: 'sarah', text: "You never asked what I wanted to make. Not in three years. You asked what I wanted to be called." },
  { who: 'recordist', text: 'Sarah.' },
  { who: 'recordist', text: 'I never asked her what she wanted to be called. I asked her three hundred times and never once about that.' },
];

// --- offline DSP matching the voice profiles ---
function biquad(samples, type, f0, Q, rate = RATE) {
  const w0 = 2 * Math.PI * f0 / rate, alpha = Math.sin(w0) / (2 * Q);
  const out = new Float32Array(samples.length);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass') { b0 = (1 - Math.cos(w0)) / 2; b1 = 1 - Math.cos(w0); b2 = b0; a0 = 1 + alpha; a1 = -2 * Math.cos(w0); a2 = 1 - alpha; }
  else { b0 = (1 + Math.cos(w0)) / 2; b1 = -(1 + Math.cos(w0)); b2 = b0; a0 = 1 + alpha; a1 = -2 * Math.cos(w0); a2 = 1 - alpha; }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i], y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}
function resample(samples, factor) { // factor >1 speeds up (raises pitch)
  const out = new Float32Array(Math.round(samples.length / factor));
  for (let i = 0; i < out.length; i++) {
    const src = i * factor, a = Math.floor(src), b = Math.min(samples.length - 1, a + 1), f = src - a;
    out[i] = samples[a] * (1 - f) + samples[b] * f;
  }
  return out;
}
function smear(samples, { time = 0.11, feedback = 0.3, mix = 0.35 }) {
  const d = Math.max(1, Math.round(time * RATE)), buf = new Float32Array(d), out = new Float32Array(samples.length);
  let idx = 0;
  for (let i = 0; i < samples.length; i++) {
    const delayed = buf[idx];
    buf[idx] = samples[i] + delayed * feedback;
    out[i] = samples[i] + delayed * mix;
    idx = (idx + 1) % d;
  }
  return out;
}
function hiss(seconds, level = 0.01) {
  const n = Math.round(seconds * RATE), out = new Float32Array(n);
  let seed = 0x9e3779b9 >>> 0, lp = 0;
  for (let i = 0; i < n; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1; lp += (noise - lp) * 0.15;
    out[i] = lp * level;
  }
  return out;
}
function gain(samples, g) { const out = new Float32Array(samples.length); for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g; return out; }

function processVoice(samples, who) {
  const p = profileFor(who) || {};
  let s = samples;
  if (p.rate && p.rate !== 1) s = resample(s, p.rate);
  if (p.hp) s = biquad(s, 'highpass', p.hp, 0.7);
  if (p.lp) s = biquad(s, 'lowpass', p.lp, 0.7);
  if (p.smear) s = smear(s, p.smear);
  if (p.gain) s = gain(s, p.gain);
  return { samples: s, hissLevel: p.hiss || 0 };
}

function writeWav(path, samples, rate = RATE) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  writeFileSync(path, buf);
}

// Render each line, keep its voice hiss, and lay the tape.
const chunks = [];
for (const line of LINES) {
  const r = await renderSamSamples(line.text, { speaker: line.who });
  if (!r?.samples?.length) { console.log('  (skip) ' + line.text); continue; }
  const { samples, hissLevel } = processVoice(r.samples, line.who);
  chunks.push({ samples, hissLevel });
  console.log(`  ${line.who.padEnd(10)} ${line.text.slice(0, 52)}`);
}

// Assemble: line, then a gap of tape hiss; a continuous hiss bed runs under it.
let total = 0;
for (const c of chunks) total += c.samples.length + Math.round(GAP * RATE);
const master = new Float32Array(total);
let pos = 0;
for (const c of chunks) {
  master.set(c.samples, pos); pos += c.samples.length;
  const gap = Math.round(GAP * RATE);
  const g = hiss(GAP, 0.006); // the tape's idle hiss between lines
  master.set(g.subarray(0, Math.min(gap, g.length)), pos); pos += gap;
}
// A very low room/tape bed under everything.
const bed = hiss(master.length / RATE, 0.0035);
for (let i = 0; i < master.length; i++) master[i] += bed[i];

// Gentle fades.
const fin = Math.round(0.3 * RATE), fout = Math.round(1.2 * RATE);
for (let i = 0; i < fin; i++) master[i] *= i / fin;
for (let i = 0; i < fout; i++) master[master.length - 1 - i] *= i / fout;

const out = join(root, 'assets', 'music-box', 'sarah-tape-fallback.wav');
writeWav(out, master);
console.log(`wrote ${out}  (${(master.length / RATE).toFixed(1)}s)`);
