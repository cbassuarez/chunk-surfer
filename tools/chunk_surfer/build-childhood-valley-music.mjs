// Rebuild from the four credited uploads, saved as <sourceVideoId>.mp4.
// Usage: node tools/chunk_surfer/build-childhood-valley-music.mjs /path/to/source-files
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error('Provide the directory with the four credited source videos.');
const root = resolve(import.meta.dirname, '../..');
const destination = join(root, 'public/audio/childhood-valley');
const cuePath = join(destination, 'phrase-cues.json');
const creditPath = join(destination, 'credits.json');
const sourceCues = JSON.parse(readFileSync(cuePath, 'utf8'));
const credits = JSON.parse(readFileSync(creditPath, 'utf8'));
const rate = 48000;
const tempo = 1.055;
const silence = Buffer.alloc(Math.round(.12 * rate) * 4);
const seconds = samples => Math.round(samples / rate * 1e6) / 1e6;
const raw = ['-f', 'f32le', '-ar', String(rate), '-ac', '1'];

function ffmpeg(args, input, log = 'error') {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-v', log, ...args], {
    input, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result;
}

function loudness(pcm) {
  const { stderr } = ffmpeg([...raw, '-i', '-', '-af', 'ebur128=peak=true', '-f', 'null', '-'], pcm, 'info');
  const summary = stderr.toString().split('Summary:').at(-1);
  return {
    lufs: Number(summary.match(/I:\s*(-?[\d.]+) LUFS/)[1]),
    peak: Number(summary.match(/Peak:\s*(-?[\d.]+) dBFS/)[1]),
  };
}

let offset = 0;
const cues = [];
const chunks = [];
const sourceHashes = {};
for (const cue of sourceCues) {
  const { sourceVideoId, sourceStartSeconds: start, sourceEndSeconds: end } = cue;
  const source = join(sourceDir, sourceVideoId + '.mp4');
  sourceHashes[sourceVideoId] ??= createHash('sha256').update(readFileSync(source)).digest('hex');
  const originalCount = Math.round((end - start) * rate);
  const sampleCount = Math.round(originalCount / tempo);
  const extracted = ffmpeg(['-i', source, '-ss', String(start), '-t', String(end - start), '-map', '0:a:0', ...raw, '-']).stdout;
  if (extracted.length !== originalCount * 4) throw new Error('Unexpected source duration for ' + cue.id);
  // Pad the input edge so WSOLA can flush its last window, then cut to the
  // intended sample count. This padding never becomes part of a playable cue.
  const filters = `apad=pad_dur=0.1,atempo=${tempo},atrim=end_sample=${sampleCount}`;
  const pcm = ffmpeg([...raw, '-i', '-', '-af', filters, ...raw, '-'], extracted).stdout;
  if (pcm.length !== sampleCount * 4) throw new Error('Unexpected output duration for ' + cue.id);
  const fadeIn = Math.round(.011 * rate);
  const fadeOut = Math.round((cue.mode === 'one-shot' ? .08 : .03) * rate);
  for (let i = 0; i < fadeIn; i++) {
    pcm.writeFloatLE(pcm.readFloatLE(i * 4) * i / (fadeIn - 1), i * 4);
  }
  for (let i = 0; i < fadeOut; i++) {
    const at = (sampleCount - i - 1) * 4;
    pcm.writeFloatLE(pcm.readFloatLE(at) * i / (fadeOut - 1), at);
  }
  const { lufs, peak } = loudness(pcm);
  const gainDb = Math.min(-23 - lufs, -3.5 - peak);
  const gain = 10 ** (gainDb / 20);
  for (let at = 0; at < pcm.length; at += 4) pcm.writeFloatLE(pcm.readFloatLE(at) * gain, at);

  if (chunks.length) {
    chunks.push(silence);
    offset += silence.length / 4;
  }
  if (!Array.isArray(cue.sourceExitSeconds)) throw new Error('Missing original cadence marks for ' + cue.id);
  const exitSeconds = cue.sourceExitSeconds.map(value => seconds(offset + Math.round((value - start) * rate / tempo)));
  cues.push({ ...cue, startSeconds: seconds(offset), endSeconds: seconds(offset + sampleCount), exitSeconds,
    gainDb: Math.round(gainDb * 100) / 100 });
  chunks.push(pcm);
  offset += sampleCount;
}

const temp = mkdtempSync(join(tmpdir(), 'childhood-valley-music-'));
try {
  const output = join(temp, 'master.mp3');
  ffmpeg([...raw, '-i', '-', '-c:a', 'libmp3lame', '-q:a', '2',
    '-metadata', 'title=Suite en ré mineur / La Montfermeil (Tannenried edits)',
    '-metadata', 'artist=Andrej Jovanić', '-metadata', 'composer=Robert de Visée',
    '-metadata', 'comment=Adapted under Creative Commons Attribution (YouTube). See credits.json.',
    output], Buffer.concat(chunks));
  const decoded = ffmpeg(['-i', output, ...raw, '-']).stdout;
  const { lufs, peak } = loudness(decoded);
  if (decoded.length !== offset * 4 || peak > -3) throw new Error('Master fails duration or peak validation.');
  const master = readFileSync(output);
  const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  writeFileSync(join(root, 'public', credits.asset), master);
  writeJson(cuePath, cues);
  writeJson(creditPath, {
    ...credits, bytes: master.length, sha256: createHash('sha256').update(master).digest('hex'),
    durationSeconds: decoded.length / 4 / rate, loudnessLufs: lufs, truePeakDbtp: peak,
    sourceVideoSha256: sourceHashes, tempoMultiplier: tempo,
    adaptation: 'Extracted and downmixed the original published performances. Pitch-preserving FFmpeg atempo runs at 1.055× before level matching, edge fades and a single MP3 encode. The 120 ms edit gaps remain outside the playable phrases. Dither and spatial reverb are applied in game.',
  });
  const entries = cues.map(({ id, startSeconds, endSeconds, exitSeconds }) =>
    `  '${id}': ${JSON.stringify([startSeconds, endSeconds, exitSeconds])},`);
  writeFileSync(join(root, 'src/audio/childhood-valley-music-cues.js'), [
    '// Generated by tools/chunk_surfer/build-childhood-valley-music.mjs.',
    '// Runtime times in seconds, including the accelerated cadence marks.',
    'export const HOME_VALLEY_MUSIC_CUES = Object.freeze({', ...entries, '});', '',
  ].join('\n'));
  console.log(`${cues.length} phrases, ${seconds(offset)}s, ${lufs} LUFS, ${peak} dBTP`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
