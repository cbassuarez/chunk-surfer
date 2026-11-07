// ElevenLabs voice A/B: the British voices, same lines, so the pair can be picked
// by ear before the full production. Reads ELEVENLABS_API_KEY from assets/music-box/.env.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const key = readFileSync('/Users/seb/chunk-surfer/assets/music-box/.env', 'utf8').match(/^(?:ELEVENLABS_API_KEY|XI_API_KEY)=(.+)$/m)?.[1]?.trim();
if (!key) throw Error('No ELEVENLABS_API_KEY in .env');
const OUT = '/Users/seb/chunk-surfer/assets/music-box/voice-test';
mkdirSync(OUT, { recursive: true });

const BRITISH = {
  lily: { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (Velvety Actress)', gender: 'f' },
  alice: { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice (Clear Educator)', gender: 'f' },
  daniel: { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (Steady Broadcaster)', gender: 'm' },
  george: { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (Warm Storyteller)', gender: 'm' },
};

async function speak(voiceId, text, settings = {}) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.42, similarity_boost: 0.75, style: 0.55, use_speaker_boost: true, ...settings } }),
  });
  if (!res.ok) throw Error(`${voiceId} ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const tests = [
  { key: 'lily', text: "Don't record this." },
  { key: 'alice', text: "Don't record this." },
  { key: 'daniel', text: "I'm not recording." },
  { key: 'george', text: "I'm not recording." },
];

for (const t of tests) {
  const v = BRITISH[t.key];
  const mp3 = await speak(v.id, t.text);
  writeFileSync(join(OUT, `${t.key}_11l.mp3`), mp3);
  console.log(`wrote ${t.key}_11l.mp3  (${v.name})`);
}
