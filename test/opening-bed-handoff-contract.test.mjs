import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('guard interaction schedules opening bed handoff before beginning conversation', () => {
  const source = readFileSync('src/main.js', 'utf8');
  const fnStart = source.indexOf('function talkToTheLodge()');
  const fnEnd = source.indexOf('function authoredAssetUrl', fnStart);
  assert.ok(fnStart >= 0 && fnEnd > fnStart, 'talkToTheLodge function can be located');

  const body = source.slice(fnStart, fnEnd);
  const iCommit = body.indexOf('commitOpeningSceneBedToColdOpenTitle');
  const iBegin = body.indexOf('beginGuardConversation');
  assert.ok(iCommit >= 0, 'talkToTheLodge schedules the opening-bed handoff');
  assert.ok(iBegin >= 0, 'talkToTheLodge eventually begins the guard conversation');
  assert.ok(iCommit < iBegin, 'handoff is scheduled before the guard conversation begins');
  assert.match(source, /function beginGuardConversation[\s\S]*converse\('cold-open'/);
});

test('guard interaction no longer directly starts title soundtrack', () => {
  const source = readFileSync('src/main.js', 'utf8');
  const fnStart = source.indexOf('function talkToTheLodge()');
  const fnEnd = source.indexOf('function authoredAssetUrl', fnStart);
  assert.ok(fnStart >= 0 && fnEnd > fnStart, 'talkToTheLodge function can be located');

  const body = source.slice(fnStart, fnEnd);
  assert.doesNotMatch(body, /STORY\.startSoundtrack\?\.\(\s*\)/);
  assert.match(body, /STORY\.startBoothTone\?\./);
  assert.match(body, /commitOpeningSceneBedToColdOpenTitle/);
  assert.match(body, /makeBoothDownbeatHoldScene/);
});

test('opening bed proximity tick runs during the prologue world loop', () => {
  const source = readFileSync('src/main.js', 'utf8');
  assert.match(source, /import \{ openingBedProximityForDistance \} from '\.\/audio\/opening-bed-transport\.js';/);
  assert.match(source, /function tickOpeningSceneBed\(\)/);
  assert.match(source, /FP\.toRuntimePoint\(\{x:73\.85,y:214\}\)/);
  assert.match(source, /STORY\.setOpeningSceneBedProximity\?\./);
  assert.match(source, /tickOpeningSceneBed\(\);\s*if\(!scenes\.blocksWorld\(\)\)/s);
});
