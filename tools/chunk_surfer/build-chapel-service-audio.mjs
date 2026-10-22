// Build only the chapel service bank. Never reads or writes the Ear Room bank.
// node tools/chunk_surfer/build-chapel-service-audio.mjs [--fetch]
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import { CHAPEL_SERVICE_AUDIO_DIR, CHAPEL_SERVICE_AUDIO_SOURCES, CHAPEL_SERVICE_AUDIO_CLIPS } from '../../src/data/chapel-service-audio.js';

const root = path.resolve(import.meta.dirname, '../..'), rate = 44100;
const artifact = path.join(root, 'artifacts/chapel-service');
const sources = path.join(artifact, 'sources');
const out = path.join(root, 'public', CHAPEL_SERVICE_AUDIO_DIR);
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const run = (args, input = undefined) => {
  const result = cp.spawnSync('ffmpeg', ['-v', 'error', ...args], { input, maxBuffer: 128 * 1024 * 1024 });
  if (result.status) throw new Error(String(result.stderr));
  return result.stdout;
};
const decode = (file) => { const data = run(['-i', file, '-ac', '1', '-ar', `${rate}`, '-f', 'f32le', '-']);
  return new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4).slice(); };
const rms = (data) => Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / Math.max(1, data.length));
function stats(data) {
  let peak = 0, finite = true;
  for (const value of data) { peak = Math.max(peak, Math.abs(value)); finite &&= Number.isFinite(value); }
  return { duration: data.length / rate, rmsDb: 20 * Math.log10(Math.max(1e-12, rms(data))), peakDb: 20 * Math.log10(Math.max(1e-12, peak)), finite };
}
function highpass(data, hz) {
  const a = Math.exp(-2 * Math.PI * hz / rate), result = new Float32Array(data.length);
  let previous = 0, held = 0;
  for (let i = 0; i < data.length; i++) { held = a * (held + data[i] - previous); previous = data[i]; result[i] = held; }
  return result;
}
function lowpass(data, hz) {
  const a = 1 - Math.exp(-2 * Math.PI * hz / rate), result = new Float32Array(data.length);
  let held = 0;
  for (let i = 0; i < data.length; i++) { held += a * (data[i] - held); result[i] = held; }
  return result;
}
function processClip(data, clip) {
  // Keep the speaker's phrase, breaths, pauses and captured room tail. The
  // filters remove sub-bass and brittle preview fizz; no denoise, time stretch,
  // pitch shift, reversal, bitcrushing, generated choir or added reverb.
  const cut = data.slice(Math.round(clip.cutAt.from * rate), Math.round(clip.cutAt.to * rate));
  const filtered = lowpass(highpass(cut, clip.role === 'movement' ? 55 : 65), clip.role === 'room' ? 7000 : 9000);
  const peak = filtered.reduce((p, value) => Math.max(p, Math.abs(value)), 0);
  const gain = Math.min(10 ** (clip.rmsDb / 20) / Math.max(1e-12, rms(filtered)),
    10 ** (-6 / 20) / Math.max(1e-12, peak));
  const edgeIn = Math.round(.012 * rate), edgeOut = Math.round((clip.role === 'room' ? .2 : .08) * rate);
  for (let i = 0; i < filtered.length; i++) {
    const entrance = i < edgeIn ? .5 - .5 * Math.cos(Math.PI * i / edgeIn) : 1;
    const end = filtered.length - 1 - i;
    const exit = end < edgeOut ? .5 - .5 * Math.cos(Math.PI * end / edgeOut) : 1;
    filtered[i] *= gain * entrance * exit;
  }
  return filtered;
}

fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(artifact, { recursive: true });
const decoded = new Map(), sourceManifest = [];
for (const source of CHAPEL_SERVICE_AUDIO_SOURCES) {
  const dir = path.join(sources, source.id), file = path.join(dir, 'source.mp3');
  if (process.argv.includes('--fetch')) {
    fs.mkdirSync(dir, { recursive: true });
    const result = cp.spawnSync('curl', ['-fLsS', '--max-time', '45', '--max-filesize', '2000000', source.download, '-o', file], { stdio: 'inherit' });
    if (result.status) throw new Error(`Could not fetch ${source.id}`);
  }
  if (!fs.existsSync(file)) throw new Error(`Missing source: ${file}`);
  const bytes = fs.readFileSync(file);
  if (sha(bytes) !== source.audioSHA) throw new Error(`Source identity changed: ${source.id}`);
  if (!['CC0 1.0', 'CC BY 3.0', 'CC BY 4.0'].includes(source.licence)) throw new Error(`Unsupported source licence ${source.licence}`);
  decoded.set(source.id, decode(file));
  const page = path.join(dir, 'source-page.html');
  sourceManifest.push({ ...source, bytes: bytes.length, encoding: 'Freesound HQ MP3 preview, original source licence retained',
    sourcePageSHA: fs.existsSync(page) ? sha(fs.readFileSync(page)) : null });
}
const clips = [], rendered = new Map();
for (const definition of CHAPEL_SERVICE_AUDIO_CLIPS) {
  const samples = processClip(decoded.get(definition.source), definition);
  const file = path.join(out, definition.file);
  run(['-y', '-f', 'f32le', '-ar', `${rate}`, '-ac', '1', '-i', '-', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', file], Buffer.from(samples.buffer));
  const final = decode(file), measured = stats(final);
  if (!measured.finite || measured.peakDb >= -1 || measured.duration < .5) throw new Error(`Invalid cue ${definition.id}`);
  rendered.set(definition.id, final);
  const { rmsDb: targetRmsDb, ...clip } = definition;
  clips.push({ ...clip, duration: measured.duration, gain: definition.gain, targetRmsDb,
    audioSHA: sha(fs.readFileSync(file)), bytes: fs.statSync(file).size, channels: 1, sampleRate: rate,
    measured, tail: definition.role === 'response' || definition.role === 'room' ? 'Original field-recorded room response retained; no added baked reverb.'
      : definition.role === 'priest' ? 'Original recitation pause/tail retained; acoustic provenance unspecified by recorder. No added baked reverb.'
        : 'Original foley envelope retained; no added baked reverb.' });
}
const manifest = { version: 1, sampleRate: rate, clips, sources: sourceManifest,
  processing: { channels: 1, codec: 'MP3', kbps: 96, sourceSampleRate: rate, highpassHz: '65, or 55 for movement', lowpassHz: '9000, or 7000 for room',
    peakCeilingDb: -6, preserved: ['Human timing', 'Whole clause groups', 'Source breathing and pauses', 'Natural field-recording tails'],
    absent: ['Bitcrush', 'Pitch or time shift', 'Reversal', 'Synthesized vocals', 'Overdubbed clone congregation', 'Added baked reverb'] },
  validation: { technical: 'All encoded files decoded and checked finite, duration and peak.',
    auditory: 'Author listening and in-room review pending; this tool environment does not support audio input.', player: 'Pending participants.' } };
fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// A source-bank audition, deliberately separate from the game's spatial mix.
const order = ['priest-pater-address', 'priest-pater-bread', 'priest-pater-deliverance',
  'response-amen', 'priest-communion-invitation', 'priest-communion-blessing', 'response-amen', 'movement-cloth', 'movement-pew'];
const seconds = 90, audition = new Float32Array(seconds * rate), timeline = [];
let cursor = 1;
for (const id of order) {
  const clip = clips.find((item) => item.id === id), samples = rendered.get(id), gain = clip.role === 'movement' ? .45 : .8;
  const start = Math.round(cursor * rate);
  if (start + samples.length >= audition.length) throw new Error('Audition overflow');
  for (let i = 0; i < samples.length; i++) audition[start + i] += samples[i] * gain;
  timeline.push({ id, at: cursor, duration: clip.duration, gain });
  cursor += samples.length / rate + 1.15;
}
run(['-y', '-f', 'f32le', '-ar', `${rate}`, '-ac', '1', '-i', '-', '-c:a', 'pcm_s16le', path.join(artifact, 'source-bank-audition.wav')], Buffer.from(audition.buffer));
const bytes = clips.reduce((sum, clip) => sum + clip.bytes, 0);
const receipt = { clips: clips.length, eventClips: clips.filter((clip) => clip.role !== 'room').length,
  roomBeds: clips.filter((clip) => clip.role === 'room').length, bytes, seconds: clips.reduce((sum, clip) => sum + clip.duration, 0),
  highestDecodedPeakDb: Math.max(...clips.map((clip) => clip.measured.peakDb)), finite: clips.every((clip) => clip.measured.finite),
  audition: { file: 'artifacts/chapel-service/source-bank-audition.wav', ...stats(audition), timeline,
    purpose: 'Ordered source-bank authoring audition with whole phrases and original tails; not the actual gameplay score or native output.' },
  sourcePages: sourceManifest.map(({ id, sourcePageSHA, url, licence, audioSHA }) => ({ id, sourcePageSHA, url, licence, audioSHA })),
  limitations: manifest.validation };
fs.writeFileSync(path.join(artifact, 'audio-build.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ clips: clips.length, events: receipt.eventClips, beds: receipt.roomBeds, bytes, highestDecodedPeakDb: receipt.highestDecodedPeakDb }));
