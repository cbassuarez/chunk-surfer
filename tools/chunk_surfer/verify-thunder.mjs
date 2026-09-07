// LISTEN TO IT.
//
// Thunder is a sound, so the only test that decides anything is hearing it. The
// model in src/audio/thunder-channel.js is pure and has no Web Audio in it
// precisely so this file can exist: it renders strikes to .wav from Node, with
// no browser, no AudioContext and no game running.
//
//   node tools/chunk_surfer/verify-thunder.mjs [outDir]
//
// Writes a grid of distances x listener positions x where you are standing, and
// prints the measured character of each so the numbers and the ears can be
// compared against each other.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { makeChannel, renderThunder, thunderGain, characteristicHz, absorptionCutoffHz } from '../../src/audio/thunder-channel.js';
import { propagateSpectrum } from '../../src/audio/acoustic-propagation.js';

const SR = 48000;
const outDir = process.argv[2] || 'tmp/thunder';

function wav(samples, sampleRate = SR) {
  const n = samples.length;
  const buffer = Buffer.alloc(44 + n * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + n * 2, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  }
  return buffer;
}

// The loudest 150ms, which is the part that reads as a clap if there is one.
function peakWindow(s, sr, ms = 150) {
  const n = Math.round((sr * ms) / 1000);
  let best = 0, at = 0, acc = 0;
  for (let i = 0; i < s.length; i += 1) {
    acc += s[i] * s[i];
    if (i >= n) acc -= s[i - n] * s[i - n];
    if (acc > best) { best = acc; at = i - n + 1; }
  }
  return { at: Math.max(0, at), n };
}
function bandDb(s, sr, i0, n, f) {
  const w = (2 * Math.PI * f) / sr, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i += 1) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    const v = s[i0 + i] * h + c * s1 - s2; s2 = s1; s1 = v;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / n;
}
function character(r) {
  const s = r.samples, sr = r.sampleRate;
  let peak = 0, sum = 0;
  for (let i = 0; i < s.length; i += 1) { peak = Math.max(peak, Math.abs(s[i])); sum += s[i] * s[i]; }
  const rms = Math.sqrt(sum / s.length);
  const { at, n } = peakWindow(s, sr);
  const bands = [125, 500, 2000].map((f) => bandDb(s, sr, at, n, f));
  const ref = Math.max(...bands);
  return {
    // A clap is peaky, a rumble is not. This is the clap/rumble axis, measured.
    crest: +(peak / rms).toFixed(1),
    seconds: +r.seconds.toFixed(2),
    top: +(20 * Math.log10(bands[2] / ref)).toFixed(0),   // 2kHz below the loudest band
  };
}

// Indoors is a tilt, not a fader — see the note in thunder-channel.js. The
// occlusion rises with how much building is stacked over your head, and
// propagateSpectrum turns it into the band gains.
const WHERE = [
  ['outdoor', 0],
  ['ground', 0.67],
  ['basement', 1],
];

mkdirSync(outDir, { recursive: true });
console.log(`thunder -> ${outDir}\n`);
console.log('  f_max  50kJ/m %d Hz   300kJ/m %d Hz', characteristicHz(50e3) | 0, characteristicHz(300e3) | 0);
console.log('  air    200m cutoff %d Hz   7km cutoff %d Hz\n', absorptionCutoffHz(200) | 0, absorptionCutoffHz(7000) | 0);
console.log('  file                                crest  secs  2kHz  gain');

// WHERE THE CHANNEL ACTUALLY POINTS.
//
// A cloud-to-ground channel is vertical near the ground, so a listener standing
// on the ground is broadside to that part wherever they stand. The end-on/
// broadside distinction lives in the horizontal in-cloud development, so the
// azimuth to sweep has to be read off the channel rather than assumed — the
// first version of this file assumed it and ended up putting the "end-on"
// listener directly on top of the strike, which is why it came back brighter.
function inCloudAzimuth(channel) {
  let x = 0, z = 0;
  for (const seg of channel.segments) {
    if (seg.mid[1] < 1300) continue;
    x += seg.dir[0] * seg.length;
    z += seg.dir[2] * seg.length;
  }
  return Math.atan2(x, z);
}

for (const [distance, energy] of [[200, 1], [1000, 0.75], [7000, 0.35]]) {
  // Built at the origin, so the listener is the thing that moves.
  const channel = makeChannel(1337, { distance: 0, bearing: 0, energy });
  const azimuth = inCloudAzimuth(channel);
  const place = (a) => [Math.sin(a) * distance, 1.7, Math.cos(a) * distance];
  // BROADSIDE vs END-ON. The same flash, heard from two places. If these two
  // files sound alike the model has failed and nothing else matters.
  for (const [side, listener] of [
    ['broadside', place(azimuth + Math.PI / 2)],
    ['endon', place(azimuth)],
  ]) {
    for (const [where, occlusion] of WHERE) {
      const bands = occlusion
        ? propagateSpectrum({ low: 1, mid: 1, high: 1 }, { occlusion })
        : null;
      const r = renderThunder(channel, { sampleRate: SR, listener, bands });
      const gain = thunderGain(distance, energy);
      const out = new Float32Array(r.samples.length);
      // Rendered at the level it actually plays at, so the files can be compared
      // to each other and to the rest of the mix rather than only to themselves.
      for (let i = 0; i < out.length; i += 1) out[i] = r.samples[i] * gain * 5.6;
      const name = `${distance}m-${side}-${where}.wav`;
      writeFileSync(join(outDir, name), wav(out, SR));
      const c = character(r);
      console.log(`  ${name.padEnd(34)} ${String(c.crest).padStart(5)} ${String(c.seconds).padStart(5)} ${String(c.top).padStart(5)} ${gain.toFixed(3)}`);
    }
  }
}
console.log('\n  broadside vs endon at the same distance is the Ribner & Roy test:');
console.log('  one is a clap and one is a rumble, and it is the same lightning.');
