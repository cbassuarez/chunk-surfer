// Quick accent/voice A/B test: same line through several voices and both models,
// so the British accent can be picked by ear before the full production.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const key = readFileSync('/Users/seb/viable-prompt-protocol/.env', 'utf8').match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
const OUT = '/Users/seb/chunk-surfer/assets/music-box/voice-test';
mkdirSync(OUT, { recursive: true });

async function speak(model, voice, text, instructions) {
  const body = { model, voice, input: text };
  if (instructions) body.instructions = instructions;
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw Error(`${model}/${voice} ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const sarah = "Don't record this.";
const tests = [
  { name: 'fable_fem', model: 'gpt-4o-mini-tts', voice: 'fable', text: sarah, inst: 'You are a young British woman. Higher, lighter pitch. Received pronunciation, not American. Coy, teasing, coquettish, playful and intimate. Do not be serious or solemn.' },
  { name: 'shimmer_rp', model: 'gpt-4o-mini-tts', voice: 'shimmer', text: sarah, inst: 'A young British woman. Received pronunciation, not American. Higher, lighter pitch. Coy, coquettish, playful, intimate, with a smile in the voice.' },
  { name: 'nova_rp', model: 'gpt-4o-mini-tts', voice: 'nova', text: sarah, inst: 'A young British woman. Received pronunciation, not American. Higher, lighter pitch. Coy, teasing, playful, intimate.' },
];

for (const t of tests) {
  const mp3 = await speak(t.model, t.voice, t.text, t.inst);
  writeFileSync(join(OUT, `${t.name}.mp3`), mp3);
  console.log(`wrote ${t.name}.mp3  (${t.model}, ${t.voice}${t.inst ? ', "British RP"' : ''})`);
}
