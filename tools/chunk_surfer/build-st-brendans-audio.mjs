// Rebuild only St Brendan's recorded-material bank, from preserved sources.
// --fetch downloads the verified source preview and its original license page.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import { ST_BRENDANS_AUDIO_DIR, ST_BRENDANS_AUDIO_SOURCES, ST_BRENDANS_AUDIO_CLIPS } from '../../src/data/st-brendans-audio.js';

const root = path.resolve(import.meta.dirname, '../..');
const artifact = path.join(root, 'artifacts/st-brendans');
const output = path.join(root, 'public', ST_BRENDANS_AUDIO_DIR);
const rate = 48000;
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const run = args => { const r = cp.spawnSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 128 * 1024 * 1024 }); if (r.status) throw new Error(String(r.stderr)); return r.stdout; };
const decode = file => { const b = run(['-i', file, '-ar', `${rate}`, '-ac', '1', '-f', 'f32le', '-']); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice(); };
const stats = a => { let energy = 0, peak = 0, finite = true; for (const x of a) { energy += x * x; peak = Math.max(peak, Math.abs(x)); finite &&= Number.isFinite(x); }
  return { duration: a.length / rate, rmsDb: 20 * Math.log10(Math.max(1e-12, Math.sqrt(energy / a.length))), peakDb: 20 * Math.log10(Math.max(1e-12, peak)), finite }; };
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(artifact, { recursive: true });
const buffers = new Map(), sources = [];
for (const source of ST_BRENDANS_AUDIO_SOURCES) {
  const dir = path.join(artifact, 'sources', source.id), file = path.join(dir, 'source.mp3'), page = path.join(dir, 'source-page.html');
  fs.mkdirSync(dir, { recursive: true });
  if (process.argv.includes('--fetch')) for (const [url, target] of [[source.download, file], [source.url, page]]) {
    const r = cp.spawnSync('curl', ['-fLsS', '--max-time', '60', '--max-filesize', '12000000', url, '-o', target], { stdio: 'inherit' });
    if (r.status) throw new Error(`Could not fetch ${source.id}`);
  }
  const bytes = fs.readFileSync(file), html = fs.readFileSync(page);
  if (sha(bytes) !== source.audioSHA) throw new Error(`Changed source ${source.id}`);
  if (!html.toString().includes('creativecommons.org/publicdomain/zero/1.0/')) throw new Error(`Missing CC0 page proof ${source.id}`);
  buffers.set(source.id, decode(file));
  sources.push({ ...source, bytes: bytes.length, pageSHA: sha(html), encoding: 'Freesound HQ MP3 preview; not the uncompressed original upload' });
}
const clips = [];
for (const clip of ST_BRENDANS_AUDIO_CLIPS) {
  const source = buffers.get(clip.source), cut = source.slice(Math.round(clip.from * rate), Math.round(clip.to * rate));
  if (cut.length < (clip.to - clip.from) * rate - 2) throw new Error(`Invalid source range ${clip.id}`);
  // Preserve original time, pitch, transients and naturally recorded tails.
  // Only remove sub-bass/brittle preview extremes, level and fade the edits.
  const before = stats(cut), level = Math.min(10 ** ((clip.rmsDb - before.rmsDb) / 20), 10 ** ((-8 - before.peakDb) / 20));
  for (let i = 0; i < cut.length; i++) {
    const attack = clip.kind === 'air' ? 1.8 : .006, release = clip.kind === 'air' ? 2.3 : .028;
    cut[i] *= level * Math.sin(Math.min(1, i / (attack * rate)) * Math.PI / 2) ** 2 * Math.sin(Math.min(1, (cut.length - 1 - i) / (release * rate)) * Math.PI / 2) ** 2;
  }
  const raw = path.join(artifact, `.${clip.id}.f32`), file = path.join(output, clip.file);
  fs.writeFileSync(raw, Buffer.from(cut.buffer));
  run(['-y', '-f', 'f32le', '-ar', `${rate}`, '-ac', '1', '-i', raw, '-af', clip.kind === 'air' ? 'highpass=f=70,lowpass=f=6500' : 'highpass=f=55,lowpass=f=10000', '-c:a', 'libmp3lame', '-b:a', '112k', file]);
  fs.unlinkSync(raw);
  const measured = stats(decode(file));
  if (!measured.finite || measured.peakDb > -5 || measured.duration < .25) throw new Error(`Bad encoded clip ${clip.id}`);
  clips.push({ ...clip, duration: measured.duration, bytes: fs.statSync(file).size, audioSHA: sha(fs.readFileSync(file)), measured });
}
const manifest = { version: 1, sampleRate: rate, clips, sources,
  processing: 'Mono 48 kHz 112 kbps MP3. Excerpts, level, edge fades and HP/LP only. Original timing and pitch. No reversal, bitcrush, added baked reverb or synthesized mechanism.',
  limitations: ['Not a recording or measured IR of St Brendan\'s.', 'Floorboard and door-latch recordings adapted as timber/iron mechanism.', 'Existing shared tonal bell bank remains clock-hammer-derived, not eight independently recorded moving bells.', 'Author listening and player perceptual validation pending.'] };
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const receipt = { clips: clips.length, bytes: clips.reduce((n, c) => n + c.bytes, 0), seconds: clips.reduce((n, c) => n + c.duration, 0), decodedMonoBytes: Math.ceil(clips.reduce((n, c) => n + c.duration, 0) * rate * 4), highestPeakDb: Math.max(...clips.map(c => c.measured.peakDb)), allFinite: clips.every(c => c.measured.finite), sources: sources.map(({ id, audioSHA, pageSHA, licence, url }) => ({ id, audioSHA, pageSHA, licence, url })), limitations: manifest.limitations };
fs.writeFileSync(path.join(artifact, 'audio-build.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
