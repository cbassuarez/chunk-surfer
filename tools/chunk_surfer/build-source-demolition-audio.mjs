// node tools/chunk_surfer/build-source-demolition-audio.mjs [--fetch]
// Preserves the licensed sources; rebuilds only the new small bank and
// editable PCM cuts. No existing Source, tower, chapel or Ear bank is touched.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import { SOURCE_DEMOLITION_AUDIO_DIR, SOURCE_DEMOLITION_AUDIO_SOURCES as SOURCES,
  SOURCE_DEMOLITION_AUDIO_CLIPS as CLIPS, SOURCE_DEMOLITION_AUDIO as CONFIG } from '../../src/data/source-demolition-audio.js';
import { SOURCE_DEMOLITION as ENCOUNTER, SOURCE_DEMOLITION_CUES as CUES } from '../../src/data/source-demolition.js';

const root = path.resolve(import.meta.dirname, '../..'), rate = 48000;
const artifact = path.join(root, 'artifacts/source-demolition'), output = path.join(root, 'public', SOURCE_DEMOLITION_AUDIO_DIR);
const materials = path.join(artifact, 'materials');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function run(args, input) {
  const r = cp.spawnSync('ffmpeg', ['-v', 'error', ...args], { input, maxBuffer: 128 * 1024 * 1024 });
  if (r.status) throw new Error(String(r.stderr)); return r.stdout;
}
const decode = file => { const b = run(['-i', file, '-vn', '-ac', '1', '-ar', `${rate}`, '-f', 'f32le', '-']); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice(); };
function measure(a) { let energy = 0, peak = 0, finite = true;
  for (const x of a) { energy += x * x; peak = Math.max(peak, Math.abs(x)); finite &&= Number.isFinite(x); }
  return { seconds: a.length / rate, rmsDb: 20 * Math.log10(Math.max(1e-12, Math.sqrt(energy / a.length))), peakDb: 20 * Math.log10(Math.max(1e-12, peak)), finite };
}
for (const dir of [artifact, output, materials]) fs.mkdirSync(dir, { recursive: true });
const decoded = new Map(), sources = [];
for (const source of SOURCES) {
  const dir = path.join(artifact, 'sources', source.id), file = path.join(dir, source.sourceFile), page = path.join(dir, 'source-page.html');
  fs.mkdirSync(dir, { recursive: true });
  if (process.argv.includes('--fetch')) for (const [url, target] of [[source.download, file], [source.url, page]]) {
    const r = cp.spawnSync('curl', ['-fLsS', '--max-time', '120', '--max-filesize', '65000000', url, '-o', target], { stdio: 'inherit' });
    if (r.status) throw new Error(`Source download failed: ${source.id}`);
  }
  const bytes = fs.readFileSync(file), html = fs.readFileSync(page);
  if (sha(bytes) !== source.sourceSHA) throw new Error(`Source identity changed: ${source.id}`);
  if (!/creativecommons\.org\/(?:publicdomain\/zero\/1\.0)/.test(html.toString())) throw new Error(`Missing original CC0 proof: ${source.id}`);
  decoded.set(source.id, decode(file)); sources.push({ ...source, bytes: bytes.length, sourcePageSHA: sha(html) });
}
const clips = [];
for (const c of CLIPS) {
  const raw = decoded.get(c.source); let cut = raw.slice(Math.round(c.from * rate), Math.round(c.to * rate));
  if (cut.length < (c.to - c.from) * rate - 2) throw new Error(`Cut range ${c.id}`);
  const sourceMeasured = measure(cut);
  if (c.contour === 'recorded-body') {
    // Lift the body that is actually recorded. Gentle broadband compression
    // reduces the outsized captured peaks before levelling; a small low shelf
    // keeps the real panel/debris mass. No generated sub, pitch or time stretch.
    const b = run(['-f', 'f32le', '-ar', `${rate}`, '-ac', '1', '-i', '-', '-af',
      'bass=g=2.5:f=165:t=q:w=.7,acompressor=threshold=.04:ratio=1.7:attack=8:release=160:knee=2.5:detection=rms',
      '-f', 'f32le', '-'], Buffer.from(cut.buffer));
    cut = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice();
  }
  const s = measure(cut), level = Math.min(10 ** ((c.rmsDb - s.rmsDb) / 20), 10 ** ((-9 - s.peakDb) / 20));
  for (let i = 0; i < cut.length; i++) {
    const attack = Math.min(1, i / (.008 * rate)), release = Math.min(1, (cut.length - 1 - i) / (.065 * rate));
    cut[i] *= level * Math.sin(attack * Math.PI / 2) ** 2 * Math.sin(release * Math.PI / 2) ** 2;
  }
  const pcm = path.join(materials, `${c.id}.wav`), encoded = path.join(output, c.file);
  const input = Buffer.from(cut.buffer);
  // Conservative preview cleanup only. Keep real chronology, transients and
  // captured machine/debris tail; no baked reverb, pitch shift or explosion.
  run(['-y', '-f', 'f32le', '-ar', `${rate}`, '-ac', '1', '-i', '-', '-af', 'highpass=f=55,lowpass=f=9500', '-c:a', 'pcm_s24le', pcm], input);
  run(['-y', '-i', pcm, '-c:a', 'libmp3lame', '-b:a', '112k', encoded]);
  const measured = measure(decode(encoded)), bytes = fs.statSync(encoded).size;
  if (!measured.finite || measured.peakDb > -5 || measured.seconds < .2) throw new Error(`Bad encoded material ${c.id}`);
  clips.push({ ...c, duration: measured.seconds, sampleRate: rate, channels: 1, bytes, audioSHA: sha(fs.readFileSync(encoded)), measured, sourceMeasured, editablePCM: `materials/${c.id}.wav`, editableSHA: sha(fs.readFileSync(pcm)) });
}
const bytes = clips.reduce((n, c) => n + c.bytes, 0), seconds = Number(clips.reduce((n, c) => n + c.duration, 0).toFixed(6)), decodedBytes = clips.reduce((n, c) => n + Math.round(c.duration * rate) * 4, 0);
if (bytes > CONFIG.maxEncodedBytes || decodedBytes > CONFIG.maxDecodedBytes) throw new Error('Demolition sound bank exceeds its bounded budget');
const encounter = { sequenceId: ENCOUNTER.sequenceId, site: 'First nothingness immediately beyond the Source get-in',
  commitment: 'Actual outward capsule crossing of the passable doorway throat, not unlatch/first white pixel/loaded pose',
  coordinates: 'Metres along/across from the actual Source doorway; root maps real physical part anchors',
  cues: CUES.map(({ type, at }) => ({ type, at })),
  validation: 'Current first-shore source and technical tests only. Earlier late-Outskirts video is historical; first-shore output/listening and participants pending.' };
const manifest = { version: 1, sampleRate: rate, clips, sources, encounter,
  processing: 'Mono48kHz,112kbpsMP3; exact source cuts, peak-limited levelling, edge fades,55Hzhigh-pass/9.5kHzlow-pass. The single Oulu body passage has a2.5dB shelf165Hz and gentle1.7:1 RMS compression(8msattack/160msrelease/threshold.04/knee2.5) before levelling. Original pitch/timing; no added baked reverb, synthetic sub/monster, choir, crowd, generic whoosh or bitcrush. Spirit residue is a filtered send of the same playing passage, not replayed source audio.',
  limits: { encodedBytes: CONFIG.maxEncodedBytes, decodedBytes: CONFIG.maxDecodedBytes, simultaneousVoices: CONFIG.maxVoices },
  limitations: ['Documentary Oulu footage records local panel demolition; roof frames stay standing in inspected samples.', 'The wood material is a licensed MP3 preview of discrete takes, not an uncompressed microphone master.', 'The stone field preview was background-cleaned by its recorder; this later contact is not the tower cue or a recorded large-scale structural failure.', 'Original camera delay, microphone processing and absolute source scale are unmeasured.', 'Runtime short reflection model and distance arrival delay are authored approximations, not measured site acoustics.', 'Author listening and unfamiliar-player perceptual validation remain pending.'] };
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const obsolete of ['shell-peel.mp3', 'fall-settle.mp3']) {
  const file = path.join(output, obsolete); if (fs.existsSync(file)) fs.unlinkSync(file);
}
const receipt = { clips: clips.length, bytes, seconds, decodedBytes, highestPeakDb: Math.max(...clips.map(c => c.measured.peakDb)), allFinite: clips.every(c => c.measured.finite), encounter, sourceHashes: sources.map(({ id, sourceSHA, sourcePageSHA, url, licence }) => ({ id, sourceSHA, sourcePageSHA, url, licence })), method: manifest.processing, limitations: manifest.limitations };
fs.writeFileSync(path.join(artifact, 'audio-build.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
