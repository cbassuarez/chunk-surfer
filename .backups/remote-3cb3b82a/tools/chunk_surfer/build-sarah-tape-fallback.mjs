// THE TAPE UNDER THE LAST LIGHT, until Seb records the real one. Each spoken line of
// source-space.last-light goes through the game's own local formant voice and the
// same voice profile the live dialog uses, then lands on its script cue, so the
// captions stay in step and a real last-light.mp3 can replace this with no other change.
//
// Voices only. The room's hiss is the game's own tape hiss, started by main alongside
// this; a bed baked in here would double it, and would stop where this file stops.
//   node tools/chunk_surfer/build-sarah-tape-fallback.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderSamSamples, profileFor } from '../../src/audio/sam-voice.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = path.join(ROOT, 'public/assets/audio/outskirts');
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/narrative/source-space.last-light.story.json'), 'utf8')).nodes.recording.lines;
const RATE = 16000, TAIL = 2.5, LEAD = .12, MAX_HURRY = 1.75;
// Who is heard through what. `you` is him, on tape, not him here and now.
const VOICE = { you: 'recordist', sarah: 'sarah' };
// Stage notes are the actors', not the words': how a line sits, then gone from the text.
const DELIVERY = [[/whisper/i, { gain: .52, rate: 1 }], [/\blow\b/i, { gain: .82, rate: .9 }]];

function biquad(input, type, hz, q = .707) {
  const w = 2 * Math.PI * hz / RATE, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
  const b = type === 'lp' ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha, out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i], y = (b[0] * x + b[1] * x1 + b[2] * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}
// `rate` is pitch and pace at once, as playbackRate is in the live voice. The wobble
// is the same slow LFO on that rate: a tape that doesn't quite hold its speed.
function retime(samples, fromRate, rate, wobble) {
  const out = [], step = fromRate / RATE * rate;
  let at = 0, t = 0;
  while (at < samples.length - 1) {
    const i = Math.floor(at), f = at - i;
    out.push(samples[i] * (1 - f) + samples[i + 1] * f);
    at += step * (1 + wobble * Math.sin(2 * Math.PI * .95 * t)); t += 1 / RATE;
  }
  return Float32Array.from(out);
}
// A line too long for its slot is tightened, not pitched up: `rate` is the character's
// voice, and a line that needed hurrying shouldn't become somebody else.
function tighten(input, factor) {
  if (factor <= 1.001) return input;
  const frame = Math.round(RATE * .036), out = new Float32Array(Math.ceil(input.length / factor) + frame), weight = new Float32Array(out.length), hop = Math.round(frame / 2);
  for (let k = 0; ; k++) {
    const from = Math.round(k * hop * factor), to = k * hop;
    if (from + frame >= input.length) break;
    for (let i = 0; i < frame; i++) { const w = Math.sin(Math.PI * (i + .5) / frame) ** 2; out[to + i] += input[from + i] * w; weight[to + i] += w; }
  }
  let end = out.length; while (end > 0 && weight[end - 1] === 0) end--;
  const result = new Float32Array(end);
  for (let i = 0; i < end; i++) result[i] = weight[i] > .001 ? out[i] / weight[i] : 0;
  return result;
}
function smear(input, { time, feedback, mix }) {
  const delay = Math.max(1, Math.round(time * RATE)), out = new Float32Array(input.length + delay * 5), tap = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const dry = input[i] || 0, wet = i >= delay ? dry0(input, i - delay) + tap[i - delay] * feedback : 0;
    tap[i] = wet; out[i] = dry + wet * mix;
  }
  return out;
}
const dry0 = (input, i) => input[i] || 0;
let noiseState = 0x51ac7e;
const noise = () => { noiseState = noiseState + 0x6d2b79f5 >>> 0; let t = noiseState; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 * 2 - 1; };

const spoken = lines.map((line, index) => ({ line, index })).filter(({ line }) => VOICE[line.who]);
const nextCue = spoken.map(({ line }, i) => spoken[i + 1]?.line.at ?? Infinity);
const seconds = Math.max(...lines.map(l => Number(l.at) || 0)) + TAIL;
const mix = new Float32Array(Math.ceil(seconds * RATE));
const report = [];
for (let i = 0; i < spoken.length; i++) {
  const { line } = spoken[i], speaker = VOICE[line.who], profile = profileFor(speaker);
  const note = /^\(([^)]*)\)/.exec(line.text)?.[1] || '', text = line.text.replace(/\([^)]*\)/g, ' ').trim();
  const delivery = DELIVERY.find(([test]) => test.test(note))?.[1] || { gain: 1, rate: 1 };
  const { samples, sampleRate, provider } = await renderSamSamples(text, { speaker });
  if (provider === 'sam-js') throw Error('This bake must use the local voice: sam-js is not ours to redistribute.');
  // The script's beats win: a line too long for its slot speeds up, within reason.
  const room = nextCue[i] === Infinity ? seconds - line.at - .2 : nextCue[i] - line.at - LEAD;
  const natural = samples.length / sampleRate / (profile.rate * delivery.rate), hurry = Math.max(1, Math.min(MAX_HURRY, natural / room));
  let voice = tighten(retime(samples, sampleRate, profile.rate * delivery.rate, profile.wobble || 0), hurry);
  // The line's own length, before the smear's quiet tail runs on under the next cue.
  const said = voice.length / RATE;
  voice = biquad(biquad(voice, 'hp', profile.hp), 'lp', profile.lp);
  if (profile.smear) voice = smear(voice, profile.smear);
  const start = Math.round(line.at * RATE), gain = profile.gain * delivery.gain;
  for (let s = 0; s < voice.length && start + s < mix.length; s++) mix[start + s] += voice[s] * gain;
  // His tape has its own hiss under him; it comes and goes with him, as in the live voice.
  if (profile.hiss) for (let s = 0; s < voice.length && start + s < mix.length; s++) mix[start + s] += noise() * profile.hiss;
  report.push({ at: line.at, who: line.who, speaker, seconds: +said.toFixed(2), room: +room.toFixed(2), hurry: +hurry.toFixed(2), text });
}
let peak = 0; for (const v of mix) peak = Math.max(peak, Math.abs(v));
const scale = .82 / (peak || 1), pcm = Buffer.alloc(mix.length * 2);
for (let i = 0; i < mix.length; i++) {
  // No click where the file starts and ends.
  const fade = Math.min(1, i / (RATE * .02), (mix.length - 1 - i) / (RATE * .05));
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[i] * scale * fade)) * 32767), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
const bytes = Buffer.concat([header, pcm]), file = path.join(OUT, 'sarah-tape-fallback.wav');
fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(file, bytes);
fs.writeFileSync(path.join(OUT, 'sarah-tape-fallback.credits.json'), JSON.stringify({
  generator: 'tools/chunk_surfer/build-sarah-tape-fallback.mjs', authored: 'Rendered in this repository by the game\'s local formant voice (src/audio/sam-voice.js). No third-party audio and no sam-js output.',
  thirdParty: [], sha256: crypto.createHash('sha256').update(bytes).digest('hex'), seconds: +(mix.length / RATE).toFixed(2), lines: report,
}, null, 1) + '\n');
console.log(`sarah-tape-fallback.wav ${(bytes.length / 1048576).toFixed(2)} MB, ${(mix.length / RATE).toFixed(1)} s, ${report.length} spoken lines, ${report.filter(r => r.hurry > 1).length} hurried, ${report.filter(r => r.seconds > r.room).length} over their slot`);
for (const r of report) if (r.hurry > 1 || r.seconds > r.room) console.log(String(r.at).padStart(5), r.speaker.padEnd(9), `${r.seconds}s in ${r.room}s x${r.hurry}`, r.text.slice(0, 44));
