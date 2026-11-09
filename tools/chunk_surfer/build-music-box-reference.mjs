// Offline preparation only. This never opens an audio device or starts playback.
// Supply the long voice memo extracted from the user's reference packet.
// node tools/chunk_surfer/build-music-box-reference.mjs /path/to/long-voice-memo.m4a
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source || !fs.statSync(source).isFile()) throw Error('Supply the long reference voice memo as the sole argument.');
const root = new URL('../../', import.meta.url);
const asset = file => new URL(`assets/music-box/${file}`, root);
const shipped = file => new URL(`public/music-box/${file}`, root);
const definitions = [
  { file: 'clair-de-lune-worn.wav', channels: 2,
    filters: 'atrim=start=65:end=111.3,asetpts=PTS-STARTPTS,highpass=f=80:p=1,volume=0.8,afade=t=in:st=0:d=0.005,afade=t=out:st=46.18:d=0.12' },
  { file: 'release-slip.wav', channels: 1,
    filters: 'atrim=start=6.04:end=6.66,asetpts=PTS-STARTPTS,highpass=f=500:p=2,lowpass=f=10000:p=1,afade=t=in:st=0:d=0.003,afade=t=out:st=0.57:d=0.05' },
  { file: 'handling-rattle.wav', channels: 1,
    filters: 'atrim=start=12.6:end=13.2,asetpts=PTS-STARTPTS,highpass=f=350:p=2,lowpass=f=10000:p=1,afade=t=in:st=0:d=0.003,afade=t=out:st=0.55:d=0.05' },
];
fs.mkdirSync(new URL('assets/music-box/', root), { recursive: true });
fs.mkdirSync(new URL('public/music-box/', root), { recursive: true });
const hashes = {};
for (const item of definitions) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-af', item.filters,
    '-ar', '48000', '-ac', String(item.channels), '-c:a', 'pcm_s16le', fileURLToPath(asset(item.file))], { stdio: ['ignore', 'pipe', 'pipe'] });
  const bytes = fs.readFileSync(asset(item.file)); fs.writeFileSync(shipped(item.file), bytes);
  hashes[item.file] = createHash('sha256').update(bytes).digest('hex');
}

// The old isolated whirr was mostly rattle. A released winding must excite
// pitched steel. This is an authored comb rake made from real attacks in the
// validated performance, never from the mislabelled half-second tine bank.
// Source pitch, sample order within each grain, and playback rate stay intact.
const releaseSeconds = .62, rate = 48000;
const combGrains = [
  { sourceStartSeconds: 67.2027, seconds: .28, atSeconds: 0, dominantHz: 1862.5 },
  { sourceStartSeconds: 70.5677, seconds: .28, atSeconds: .018, dominantHz: 1564.5 },
  { sourceStartSeconds: 73.3977, seconds: .28, atSeconds: .041, dominantHz: 1398.2 },
  { sourceStartSeconds: 77.3427, seconds: .28, atSeconds: .066, dominantHz: 1246.6 },
  { sourceStartSeconds: 79.1527, seconds: .30, atSeconds: .092, dominantHz: 1108.9 },
  { sourceStartSeconds: 80.3477, seconds: .30, atSeconds: .122, dominantHz: 1037.8 },
  { sourceStartSeconds: 75.0177, seconds: .32, atSeconds: .156, dominantHz: 830.6 },
  { sourceStartSeconds: 73.6727, seconds: .36, atSeconds: .194, dominantHz: 790.3 },
];
function pcm(filters) {
  const bytes = execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-af', filters, '-ar', String(rate), '-ac', '1', '-f', 'f32le', 'pipe:1'],
    { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64_000_000 });
  const values = new Float32Array(bytes.length / 4);
  for (let i = 0; i < values.length; i++) values[i] = bytes.readFloatLE(i * 4);
  return values;
}
const recordedComb = pcm('highpass=f=350:p=1,lowpass=f=10000:p=1');
const recordedWhirr = pcm('atrim=start=6.04:end=6.66,asetpts=PTS-STARTPTS,highpass=f=500:p=2,lowpass=f=10000:p=1');
const tone = new Float32Array(Math.round(releaseSeconds * rate));
for (const grain of combGrains) {
  const start = Math.round(grain.sourceStartSeconds * rate), length = Math.round(grain.seconds * rate), at = Math.round(grain.atSeconds * rate);
  let square = 0;
  for (let i = 0; i < length; i++) square += recordedComb[start + i] ** 2;
  const rms = Math.sqrt(square / length), gain = Math.min(4, .067 / Math.max(.00001, rms));
  for (let i = 0; i < length && at + i < tone.length; i++) {
    const elapsed = i / rate, remain = (length - i) / rate;
    const envelope = Math.min(1, elapsed / .0015) * Math.min(1, remain / .055);
    tone[at + i] += recordedComb[start + i] * gain * envelope;
  }
}
const release = new Float32Array(tone.length);
let peak = 0;
for (let i = 0; i < release.length; i++) {
  const elapsed = i / rate, remain = (release.length - i) / rate;
  const edge = Math.min(1, elapsed / .0015) * Math.min(1, remain / .055);
  // The mechanical layer sits underneath the comb, never in place of it.
  release[i] = (tone[i] + (recordedWhirr[i] || 0) * .12) * edge;
  peak = Math.max(peak, Math.abs(release[i]));
}
const peakGain = .88 / Math.max(.00001, peak);
const wav = Buffer.alloc(44 + release.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(release.length * 2, 40);
for (let i = 0; i < release.length; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, release[i] * peakGain)) * 32767), 44 + i * 2);
const tonalFile = 'release-tonal-slip.wav';
fs.writeFileSync(asset(tonalFile), wav); fs.writeFileSync(shipped(tonalFile), wav);
hashes[tonalFile] = createHash('sha256').update(wav).digest('hex');
const provenance = {
  kind: 'user-recorded-sankyo-reference',
  reference: 'Long supplied voice memo in music-box.zip; personal source filenames omitted.',
  clip: { startSeconds: 65, endSeconds: 111.3, durationSeconds: 46.3 },
  processing: ['Sample-accurate trim 65.0–111.3 s; timestamps reset before fades', '80 Hz first-order highpass',
    'Fixed 0.8 gain for decoded AAC headroom; no loudness riding', '5 ms leading edge fade', '120 ms trailing edge fade', '48 kHz stereo 16-bit PCM'],
  pitch: 'Unchanged; playbackRate always 1',
  timing: 'Unchanged within the clip. Approximately one repeated melodic pass; full-cylinder boundary has not been confirmed by listening.',
  operation: 'The user confirms manual winding-pin turning produces the phrases; releasing the broken winding slams/slips. Both supplied memos demonstrate the broken mechanism. There is no healthy release-start playback.',
  faults: 'The continuous performance retains its recorded irregularities. The release is an explicitly authored arrangement of recorded comb attacks over a quiet recorded whirr; no reverse transport, invented missing-tine mask, synthesized substitute melody or digital degradation.',
  mechanicalContact: { reference: 'Short supplied 15.59-second memo retained as failure reference',
    use: 'Not used for individual key contacts: it includes phone placement, and those contacts have not been correlated confidently with the mechanism.' },
  releaseCandidate: { reference: 'Recorded comb attacks from the long memo’s validated Clair de lune performance, with its earlier winding whirr underneath',
    file: tonalFile, seconds: releaseSeconds, playbackRate: 1, combGrains,
    underlay: { sourceStartSeconds: 6.04, sourceEndSeconds: 6.66, relativeGain: .12 },
    processing: ['350 Hz highpass and 10 kHz lowpass on recorded comb', '1.5 ms attack / 55 ms release grain envelopes',
      'Overlapping attacks at fixed original pitch', 'Comb dominates; recorded whirr mixed underneath at 0.12 gain', 'Static peak headroom at 0.88; 48 kHz mono 16-bit PCM'],
    interpretation: 'Every slip has pitched comb sound. This rake is deliberately authored from real notes, not claimed as a measured release or literal reverse-pin transcription. The cylinder keeps its forward source position. No phone-counter impact is used.' },
  handlingCandidate: { reference: 'Long supplied memo mechanical section', startSeconds: 12.6, endSeconds: 13.2, seconds: .6,
    processing: ['350 Hz highpass', '10 kHz lowpass', '3 ms / 50 ms edge fades', '48 kHz mono 16-bit PCM'],
    interpretation: 'A recorded mechanical rattle candidate for moving the held object. This is not a new diagnosis of its broken part. Short-memo counter impacts are excluded.' },
  acceptance: 'Offline waveform, spectral and packaged-PCM checks only. Listening, exact cycle boundary and release acceptance remain pending.',
  sha256: hashes,
};
fs.writeFileSync(asset('reference-performance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
process.stdout.write(`Prepared ${definitions.length + 1} recordings without playback.\n`);
