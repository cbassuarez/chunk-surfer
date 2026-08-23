import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('arrival scene starts rain and opening bed', () => {
  const source = readFileSync('src/game/coldopen.js', 'utf8');
  assert.match(source, /enter\(\)\s*\{\s*audio\?\.startRain\?\.\(\);\s*audio\?\.startOpeningSceneBed\?\.\(\);\s*\}/s);
});

test('booth downbeat hold scene exists and blocks during handoff', () => {
  const source = readFileSync('src/game/coldopen.js', 'utf8');
  assert.match(source, /export function makeBoothDownbeatHoldScene/);
  assert.match(source, /id:\s*'booth-downbeat-hold'/);
  assert.match(source, /blocksInput:\s*true/);
  assert.match(source, /blocksWorld:\s*true/);
});
