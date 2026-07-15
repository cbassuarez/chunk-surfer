import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SAMPLE_RATE = 48000;
const SOURCE_HUM_HZ = 252.2;
const LICENSE_ID = 'cc0-bigsoundbank-3445-3446';
const OUTPUT_DIR = resolve('public/assets/audio/bell-tower');
const SOURCES = Object.freeze([
  Object.freeze({
    id: 3446,
    role: 'clean single blow and handstroke basis',
    url: 'https://bigsoundbank.com/UPLOAD/bwf-en/3446.wav',
    pageUrl: 'https://bigsoundbank.com/bell-1-o-clock-s3446.html',
    sha256: 'f9f598a9236b709d4560cb9ce2067172a3eac8ec2189a26185c65d990251764a',
    contactOffsetSamples: 2068,
  }),
  Object.freeze({
    id: 3445,
    role: 'alternate real attack for backstroke basis',
    url: 'https://bigsoundbank.com/UPLOAD/bwf-en/3445.wav',
    pageUrl: 'https://bigsoundbank.com/bell-5-o-clock-s3445.html',
    sha256: '95a3b850e82a0340da4eb1dc0fadf5b32c4de23a6af957923d7f4885cbfa4371',
    contactOffsetSamples: 1202,
  }),
]);
const BELLS = Object.freeze([
  Object.freeze({ bell: 1, note: 'Bb4', frequency: 466.16, gainDb: -14 }),
  Object.freeze({ bell: 2, note: 'A4', frequency: 440.00, gainDb: -13.5 }),
  Object.freeze({ bell: 3, note: 'G4', frequency: 392.00, gainDb: -13 }),
  Object.freeze({ bell: 4, note: 'F4', frequency: 349.23, gainDb: -12.5 }),
  Object.freeze({ bell: 5, note: 'Eb4', frequency: 311.13, gainDb: -12 }),
  Object.freeze({ bell: 6, note: 'D4', frequency: 293.66, gainDb: -11.5 }),
  Object.freeze({ bell: 7, note: 'C4', frequency: 261.63, gainDb: -11 }),
  Object.freeze({ bell: 8, note: 'Bb3', frequency: 233.08, gainDb: -10.5 }),
]);

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function download(source, target) {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`${source.url} returned ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  const digest = createHash('sha256').update(await readFile(target)).digest('hex');
  if (digest !== source.sha256) throw new Error(`source ${source.id} SHA-256 changed: ${digest}`);
}

async function renderStem(input, output, bell, stroke) {
  const ratio = bell.frequency / SOURCE_HUM_HZ;
  const filter = [
    `asetrate=${(SAMPLE_RATE * ratio).toFixed(6)}`,
    `aresample=${SAMPLE_RATE}`,
    `atempo=${(1 / ratio).toFixed(9)}`,
    'apad=pad_dur=12',
    'atrim=duration=12',
  ].join(',');
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    '-af', filter, '-map_metadata', '-1', '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'pcm_s24le',
    '-metadata', `title=Ellery bell ${bell.bell} ${stroke}`,
    '-metadata', 'artist=Joseph SARDIN & Axeline T.; derived for Chunk Surfer',
    '-metadata', 'copyright=CC0 / WTFPL / Public domain',
    '-metadata', `comment=Derived from BigSoundBank 3445/3446; hum tuned from ${SOURCE_HUM_HZ} Hz to ${bell.frequency} Hz`,
    output,
  ]);
}

const work = await mkdtemp(join(tmpdir(), 'chunk-surfer-bells-'));
try {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const sourceFiles = new Map();
  for (const source of SOURCES) {
    const target = join(work, `source-${source.id}.wav`);
    await download(source, target);
    sourceFiles.set(source.id, target);
  }

  const handBase = join(work, 'hand-base.wav');
  const backBase = join(work, 'back-base.wav');
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', sourceFiles.get(3446),
    '-af', `atrim=start_sample=${SOURCES[0].contactOffsetSamples},asetpts=PTS-STARTPTS`,
    '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'pcm_s24le', handBase,
  ]);
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', sourceFiles.get(3445), '-i', sourceFiles.get(3446),
    '-filter_complex',
    `[0:a]atrim=start_sample=${SOURCES[1].contactOffsetSamples},asetpts=PTS-STARTPTS,atrim=end=1.6[attack];` +
    `[1:a]atrim=start_sample=${SOURCES[0].contactOffsetSamples},asetpts=PTS-STARTPTS,atrim=start=1.4[tail];` +
    '[attack][tail]acrossfade=d=0.2:c1=tri:c2=tri[out]',
    '-map', '[out]', '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'pcm_s24le', backBase,
  ]);

  const entries = [];
  for (const bell of BELLS) for (const stroke of ['hand', 'back']) {
    const fileName = `bell-${String(bell.bell).padStart(2, '0')}-${stroke}-01.wav`;
    await renderStem(stroke === 'hand' ? handBase : backBase, join(OUTPUT_DIR, fileName), bell, stroke);
    entries.push({
      bell: bell.bell,
      stroke,
      variation: 0,
      url: fileName,
      contactOffsetSamples: 0,
      gainDb: bell.gainDb,
      licenseId: LICENSE_ID,
    });
  }

  const manifest = {
    schema: 1,
    sampleRate: SAMPLE_RATE,
    contactAlignment: 'sample-offset',
    status: 'prototype-clock-strike-derived',
    provenanceFile: 'credits.json',
    entries,
  };
  const credits = {
    licenseId: LICENSE_ID,
    license: 'CC0 / WTFPL / Public domain',
    authors: ['Joseph SARDIN', 'Axeline T.'],
    publisher: 'BigSoundBank / LaSonotheque',
    sourceFiles: SOURCES.map(({ contactOffsetSamples, ...source }) => source),
    modifications: [
      'contact-aligned to sample zero',
      `source hum measured at ${SOURCE_HUM_HZ} Hz and pitch-scaled to the Ellery eight-bell note set`,
      'handstroke uses source 3446; backstroke uses the first source-3445 attack crossfaded into the clean source-3446 decay',
      'converted to mono 48 kHz 24-bit PCM and padded to 12 seconds without per-file loudness normalization',
    ],
    limitation: 'Prototype clock-hammer-derived bank. These are real tower-bell recordings, but not moving-bell handstroke/backstroke test blows.',
  };
  await writeFile(join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(OUTPUT_DIR, 'credits.json'), `${JSON.stringify(credits, null, 2)}\n`);
  console.log(`wrote ${entries.length} bell stems to ${OUTPUT_DIR}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
