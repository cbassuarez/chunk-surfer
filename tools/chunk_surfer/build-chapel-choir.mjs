import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { CHAPEL_CHOIR_SOURCE as source, CHAPEL_CHOIR_SCORE } from '../../src/data/chapel-choir.js';
import { renderGainChannels } from '../../src/audio/chapel-choir-score.js';

// Run with a local original recording already retrieved from source.download.
// No network side effect, synthesized voices or source separation.
const input = process.argv[2];
if (!input) throw Error('Pass the original, unedited source MP3 path');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (hash(await fs.readFile(input)) !== source.originalSHA256) throw Error('Original recording hash differs');
const out = new URL('../../public/audio/chapel-choir/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const file = 'sicut-kyrie-i.wav';
const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', input,
  '-af', 'atrim=start=0:end=80.1,asetpts=PTS-STARTPTS,pan=mono|c0=0.5*c0+0.5*c1,volume=3dB,afade=t=in:st=0:d=0.025,afade=t=out:st=79.7:d=0.4,apad=whole_dur=88',
  '-ar', '48000', '-c:a', 'pcm_s16le', '-map_metadata', '-1', new URL(file, out).pathname], { encoding: 'utf8' });
if (result.status) throw Error(result.stderr);
const bytes = await fs.readFile(new URL(file, out));
// Precompute once at build time instead of blocking walking on first entry.
const gain = renderGainChannels(CHAPEL_CHOIR_SCORE, { voices: 1, controlHz: 12000 });
const controlBytes = Buffer.from(gain.channels[0].buffer);
await fs.writeFile(new URL('sicut-gain.f32', out), controlBytes);
const manifest = { version: 1, sourceKind: source.sourceKind, title: source.title,
  duration: source.duration, independentParts: 0, scoreParts: source.scoreParts,
  tracks: [{ id: 'sicut-ensemble', file, sha256: hash(bytes),
    source: source.url, licenceUrl: source.licenceUrl, anchor: 'front', projectionAnchor: 'rear' }],
  control: { file: 'sicut-gain.f32', sampleRate: gain.sampleRate, frames: gain.length, sha256: hash(controlBytes) },
  originalSHA256: source.originalSHA256, changes: source.changes,
};
await fs.writeFile(new URL('manifest.json', out), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ file, bytes: bytes.length, sha256: manifest.tracks[0].sha256, sourceKind: manifest.sourceKind, independentParts: 0 }));
await import('./build-chapel-choir-performance.mjs');
