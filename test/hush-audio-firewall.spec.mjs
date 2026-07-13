import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const presentationModules = [
  'src/audio/hush-mix.js',
  'src/game/hush-field.js',
  'src/game/hush-mischief.js',
  'src/game/hush-telemetry.js',
];
for (const file of presentationModules) {
  const source = await readFile(file, 'utf8');
  assert.equal(/from\s+['"][^'"]*battle\.js['"]/.test(source), false, `${file} imports battle internals`);
  assert.equal(/\b(searchMode|attackCooldown|chosenPath|endingRoute)\b/.test(source), false, `${file} exposes hidden state`);
}

const mixSource = await readFile('src/audio/hush-mix.js', 'utf8');
assert.equal(/masterVolume|sfxVolume|dialogVolume/.test(mixSource), false, 'presentation mix must not drive hearing');

console.log('hush audio firewall tests ok');
