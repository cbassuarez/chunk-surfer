import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files=[
  'src/causal/tape.js','src/causal/recorder.js','src/causal/playback.js',
  'src/game/hush-run.js','src/game/hush-dossier.js','src/game/second-shift.js',
  'src/progression/causal-progression.js','docs/causal-tapes.md','docs/story-doctrine.md',
];
const prohibited=new RegExp(`g${'host'}`,'i');
for(const file of files){
  const source=readFileSync(file,'utf8');
  assert.equal(prohibited.test(source),false,`${file} violates the permanent playerShadow naming contract`);
}
const tape=readFileSync('src/causal/tape.js','utf8');
for(const required of ['playerShadow','shadowFrames','causalContentHash'])assert.match(tape,new RegExp(required));

console.log('causal naming contract passed');
