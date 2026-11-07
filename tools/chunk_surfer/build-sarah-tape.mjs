// Render the Sarah tape — the recording played back to the recordist — with
// OpenAI's gpt-4o-mini-tts, two British voices (Sarah + the recordist). Reads the
// local OPENAI_API_KEY, voices each line, and concatenates into one tape.
//
// Usage: node tools/chunk_surfer/build-sarah-tape.mjs [--sample]
//   --sample  renders only the natatorium exchange for a voice check.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const keyFile = join('/Users', 'seb', 'viable-prompt-protocol', '.env');
const key = readFileSync(keyFile, 'utf8').match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw Error(`No OPENAI_API_KEY in ${keyFile}`);
const SAMPLE = process.argv.includes('--sample');
const TMP = join(root, 'tmp', 'sarah-tape');
mkdirSync(TMP, { recursive: true });

// Voices: two British speakers. instructions sets the accent and delivery on
// gpt-4o-mini-tts; keep them imperative and specific (accent, tone, pacing).
const VOICES = {
  sarah: { voice: 'shimmer', instructions: 'A young English woman, received pronunciation (British, not American). She is coy, teasing, coquettish, and intimate — confiding in a man she has known for years and is still fond of. Speak softly and slowly, with a slight smile in the voice, natural conversational rhythm and small hesitations. Sound like a real person, not a narrator or assistant; do not over-enunciate.' },
  me: { voice: 'echo', instructions: 'A middle-aged English man, south-of-England British accent (not American). He is tired, guarded, a little defensive and regretful. Speak low and even, quietly, with natural conversational rhythm and long pauses. Sound like a real person, not a narrator or assistant; do not over-enunciate.' },
};

// The tape: deduplicated sarah + me lines from the playback scenes.
const LINES = [
  { speaker: 'sarah', text: "Don't record this." },
  { speaker: 'me', text: "I'm not recording." },
  { speaker: 'sarah', text: "You're always recording." },
  { speaker: 'sarah', text: 'You never played me back. Not once. I used to think it was kindness.' },
  { speaker: 'me', text: 'It was. You hated it.' },
  { speaker: 'sarah', text: 'I hated hearing myself. You liked that I hated it. It meant you got to keep it all and never once be asked about it.' },
  { speaker: 'sarah', text: 'You kept all of it, then.' },
  { speaker: 'me', text: 'I keep everything. That is the job. That has always been the job.' },
  { speaker: 'sarah', text: 'You kept me changing. You never once kept me working.' },
  { speaker: 'sarah', text: 'You were so good about it. Every appointment. Every form. You told people you were proud of me.' },
  { speaker: 'me', text: 'I was proud of you.' },
  { speaker: 'sarah', text: 'You were proud of the change. You liked who I was turning into and you liked being the one standing next to her.' },
  { speaker: 'sarah', text: "You never asked what I wanted to make. Not in three years. You asked what I wanted to be called." },
  { speaker: 'sarah', text: 'Row F. You had the recorder on your knee. You were setting a level while I said it.' },
  { speaker: 'me', text: 'Sarah.' },
  { speaker: 'me', text: 'I never asked her what she wanted to be called. I asked her three hundred times and never once about that.' },
];
const SAMPLE_LINES = LINES.slice(0, 6);

const chosen = SAMPLE ? SAMPLE_LINES : LINES;
const GAP = 0.35;

async function speak(text, speaker) {
  const { voice, instructions } = VOICES[speaker];
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, instructions, input: text }),
  });
  if (!res.ok) throw Error(`TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// Silence gap for the concat list.
const silencePath = join(TMP, 'gap.mp3');
if (!SAMPLE || true) {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(GAP), '-c:a', 'libmp3lame', '-q:a', '9', silencePath], { encoding: 'utf8' });
  if (r.status !== 0) throw Error(`silence: ${r.stderr}`);
}

const files = [];
for (let i = 0; i < chosen.length; i++) {
  const line = chosen[i];
  const out = join(TMP, `line-${String(i).padStart(2, '0')}.mp3`);
  writeFileSync(out, await speak(line.text, line.speaker));
  files.push(out);
  if (i < chosen.length - 1) files.push(silencePath);
  console.log(`  ${line.speaker.padEnd(6)} ${line.text.slice(0, 60)}`);
}

const listPath = join(TMP, 'concat.txt');
writeFileSync(listPath, files.map((f) => `file '${f}'`).join('\n'));
const outWav = join(root, 'assets', 'music-box', SAMPLE ? 'sarah-tape-sample.wav' : 'sarah-tape.wav');
const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listPath, '-ac', '1', '-ar', '44100', outWav], { encoding: 'utf8' });
if (r.status !== 0) throw Error(`concat: ${r.stderr}`);
console.log(`wrote ${outWav}`);
