import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync('src/main.js','utf8');
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('legacy sample field is locked through app boot and opening credits', () => {
  assert.match(source,/let sampleFieldEnabled=false/);
  const suppression=slice('function sampleFieldSuppressed','function silenceSampleField');
  assert.match(suppression,/!sampleFieldEnabled/);
  assert.match(suppression,/opening-credits/);
});

test('production modes revoke sample-field playback and only developer audio labs retain utilities', () => {
  assert.match(slice('function enterStory','function fireCue'),/sampleFieldEnabled=false/);
  assert.match(slice('function enterStory','function fireCue'),/silenceSampleField\(\)/);
  assert.doesNotMatch(source,/function enterJustSurf|onJustSurf|id: 'just-surf'/);
  assert.match(source,/hushaudiolab/);
  assert.doesNotMatch(slice('function enterRogue','const ARROW_KEYS'),/sampleFieldEnabled=true/);
});

test('returning to title revokes and silences sample playback', () => {
  const block=slice('function returnToTitle','function showReturnReport');
  assert.match(block,/sampleFieldEnabled=false/);
  assert.match(block,/silenceSampleField\(\)/);
  assert.match(block,/STORY\.stopAll\(\)/);
});
