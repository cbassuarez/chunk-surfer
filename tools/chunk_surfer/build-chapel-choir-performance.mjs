import fs from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const wav = fs.readFileSync(new URL('public/audio/chapel-choir/sicut-kyrie-i.wav', root));
let rate, channels, bits, data;
for (let at = 12; at + 8 < wav.length;) {
  const name = wav.toString('ascii', at, at + 4), size = wav.readUInt32LE(at + 4);
  if (name === 'fmt ') { channels = wav.readUInt16LE(at + 10); rate = wav.readUInt32LE(at + 12); bits = wav.readUInt16LE(at + 22); }
  if (name === 'data') data = wav.subarray(at + 8, at + 8 + size);
  at += 8 + size + size % 2;
}
if (rate !== 48000 || channels !== 1 || bits !== 16 || !data) throw Error('Expected the shipped mono PCM choir passage');
const hz = 40, frames = data.length / 2, levels = [];
let envelope = 0;
for (let k = 0; k <= Math.ceil(frames / rate * hz); k++) {
  const start = Math.floor(k / hz * rate), end = Math.min(frames, start + Math.round(rate * .05));
  let energy = 0;
  for (let i = start; i < end; i++) energy += (data.readInt16LE(i * 2) / 32768) ** 2;
  const rms = Math.sqrt(energy / Math.max(1, end - start));
  // Collective voiced energy only, before any electronic gate. This is not
  // phoneme recognition or an invented set of individual vocal recordings.
  const target = Math.max(0, Math.min(1, (rms - .004) / .10)) ** .55;
  envelope += (target - envelope) * (1 - Math.exp(-1 / hz / (target > envelope ? .055 : .14)));
  levels.push(Math.round(envelope * 255));
}
const result = { sourceSHA256: createHash('sha256').update(wav).digest('hex'), duration: frames / rate,
  hz, method: '50ms RMS windows; 55ms attack, 140ms release, collective pre-amplification vocal energy', levels };
fs.writeFileSync(new URL('src/data/generated/chapel-choir-performance.js', root),
  `// Generated from the real choir PCM by build-chapel-choir-performance.mjs.\nexport const CHAPEL_CHOIR_PERFORMANCE=Object.freeze(${JSON.stringify(result)});\n`);
console.log(JSON.stringify({ duration: result.duration, hz, values: levels.length, sourceSHA256: result.sourceSHA256 }));
