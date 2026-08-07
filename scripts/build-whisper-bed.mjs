// Bake the whisper bed's source takes into runtime assets.
//
// The takes are quiet, close, hand-held recordings of one sentence and its
// variations. Offline processing here is CLEANUP ONLY:
//
//   · highpass 120 Hz  — the loudest band in the raw takes (-50.8 dB below
//     300 Hz) is the recording's own rumble, not the voice, and it would sit on
//     top of the game's brown-noise room tone, which is lowpassed at 180 Hz
//   · trim the silence at each end so the scheduler's gaps are real gaps
//   · normalise every take to one RMS so the runtime's level maths means the
//     same thing whichever file it draws
//
// Deliberately NOT baked: the band limit. The bed's passband widens across the
// night (see game/whisper-tide.js), so the filter has to be a runtime node with
// an automated frequency. Baking it here would freeze the one thing that moves.
//
// Files land near full scale on purpose. Attenuation to the bed's actual
// (very small) playing level is the runtime's job; encoding a -48 dBFS take as
// a -48 dBFS mp3 would spend the encoder's bits on the noise floor.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const SOURCE_DIR = resolve('assets/hush/whispers');
const OUTPUT_DIR = resolve('public/audio/game/whispers');
const PROVENANCE = join(SOURCE_DIR, 'provenance.json');

const SAMPLE_RATE = 48000;
const HIGHPASS_HZ = 120;
// These takes have a ~13 dB crest factor, so a higher RMS target cannot be met
// without the peak ceiling clamping it — and a clamped file is normalised to its
// loudest plosive rather than to its voice, which put five decibels between the
// thirteen. -25 is the loudest RMS all thirteen reach with no clamping at all,
// which is what the bed needs: no utterance may stand out from the others.
const TARGET_RMS_DB = -25;
const PEAK_CEILING_DB = -1;
const SILENCE_FLOOR_DB = -60;   // conservative: the voice itself sits near -48
const BITRATE = '128k';

function run(command, args) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', fail);
    child.on('close', (code) => code === 0
      ? done(`${out}${err}`)
      : fail(new Error(`${command} exited ${code}\n${err.slice(-2000)}`)));
  });
}

// ffmpeg reports astats on stderr; pull one named measure out of it.
function measure(report, label) {
  const match = report.match(new RegExp(`${label}:\\s*(-?[\\d.]+|inf|-inf)`));
  if (!match) throw new Error(`ffmpeg did not report "${label}"`);
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

// Everything before the gain stage, so the measurement describes exactly what
// gets encoded.
const cleanupChain = [
  `highpass=f=${HIGHPASS_HZ}:poles=2`,
  'aformat=channel_layouts=mono',
  `silenceremove=start_periods=1:start_threshold=${SILENCE_FLOOR_DB}dB:start_silence=0.02:detection=rms`,
  'areverse',
  `silenceremove=start_periods=1:start_threshold=${SILENCE_FLOOR_DB}dB:start_silence=0.02:detection=rms`,
  'areverse',
].join(',');

async function bake(name) {
  const source = join(SOURCE_DIR, name);
  const id = name.replace(/\.m4a$/i, '');
  const output = join(OUTPUT_DIR, `${id}.mp3`);

  const report = await run('ffmpeg', [
    '-hide_banner', '-i', source,
    '-af', `${cleanupChain},astats=measure_perchannel=none`,
    '-f', 'null', '-',
  ]);
  const rms = measure(report, 'RMS level dB');
  const peak = measure(report, 'Peak level dB');
  if (rms == null || peak == null) throw new Error(`${name}: silent after cleanup`);

  // Lift every take to the same RMS unconditionally, and catch the overs with a
  // limiter rather than backing the whole file off. Four of the thirteen have an
  // isolated transient — a breath, a hand on the case — with enough crest to
  // clamp the file three decibels below the others if the peak is allowed to set
  // the level. Normalising to a plosive instead of to a voice is the wrong
  // answer twice over: it puts audible steps between the takes, and a transient
  // is precisely the onset this bed exists to not have.
  const gainDb = TARGET_RMS_DB - rms;
  const limitedDb = Math.max(0, (rms + gainDb + (peak - rms)) - PEAK_CEILING_DB);

  await run('ffmpeg', [
    '-hide_banner', '-y', '-i', source,
    '-af', `${cleanupChain},volume=${gainDb.toFixed(3)}dB,alimiter=limit=${(10 ** (PEAK_CEILING_DB / 20)).toFixed(4)}:attack=5:release=120:level=disabled`,
    '-ar', String(SAMPLE_RATE), '-ac', '1',
    '-codec:a', 'libmp3lame', '-b:a', BITRATE,
    output,
  ]);

  const bytes = await readFile(output);
  const durationReport = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output,
  ]);
  const sourceBytes = await readFile(source);
  return {
    id,
    file: `audio/game/whispers/${id}.mp3`,
    seconds: Number(Number(durationReport.trim()).toFixed(3)),
    bytes: bytes.length,
    sourceRmsDb: Number(rms.toFixed(2)),
    sourcePeakDb: Number(peak.toFixed(2)),
    gainDb: Number(gainDb.toFixed(2)),
    limitedDb: Number(limitedDb.toFixed(2)),
    sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

await mkdir(OUTPUT_DIR, { recursive: true });
const names = (await readdir(SOURCE_DIR)).filter((n) => /\.m4a$/i.test(n)).sort();
if (!names.length) throw new Error(`no .m4a sources in ${SOURCE_DIR}`);

const takes = [];
for (const name of names) {
  const take = await bake(name);
  takes.push(take);
  console.log(`  · ${take.id}  ${take.seconds}s  ${take.sourceRmsDb} dB RMS ${take.gainDb >= 0 ? '+' : ''}${take.gainDb} dB${take.limitedDb > 0.05 ? `  (${take.limitedDb} dB limited)` : ''}`);
}

await writeFile(PROVENANCE, `${JSON.stringify({
  schema: 1,
  purpose: 'Whisper bed source takes — variations of one sentence, played under the whole run',
  ownership: 'user-provided project recording',
  runtimeCopies: 'public/audio/game/whispers/',
  generator: 'scripts/build-whisper-bed.mjs',
  processing: {
    highpassHz: HIGHPASS_HZ,
    silenceFloorDb: SILENCE_FLOOR_DB,
    targetRmsDb: TARGET_RMS_DB,
    peakCeilingDb: PEAK_CEILING_DB,
    sampleRate: SAMPLE_RATE,
    channels: 1,
    bitrate: BITRATE,
    bandLimit: 'none — the passband widens across the run and is a runtime filter',
  },
  takes,
}, null, 2)}\n`);

const totalSeconds = takes.reduce((sum, take) => sum + take.seconds, 0);
console.log(`wrote ${takes.length} whispers to public/audio/game/whispers (${totalSeconds.toFixed(1)}s total)`);
