import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/main.js', 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

// A PEAL MAY ONLY SOUND INSIDE A RUN.
//
// It has reached the boot log and the title twice. Both times through a path
// that looked like tower code doing tower work: loadBuilding() restoring the
// transport off the save during app boot, and the frame loop ticking the world
// under a title scene because `inRogue` outlives returnToTitle. The gate is in
// front of the only constructor, so no future caller can reopen either one.
test('the tower bell bus cannot be built outside a story run', () => {
  const ensure = slice('function ensureTowerBellDirector', 'function towerAcousticProfile');
  assert.match(ensure, /if\(!storyMode\)return null;/,
    'ensureTowerBellDirector must refuse to construct the bell bus outside a run');
  assert.ok(
    ensure.indexOf('if(!storyMode)return null;') < ensure.indexOf('createBellTowerAudio'),
    'the run gate must sit ahead of the audio construction, not after it');

  const tick = slice('function tickTowerBellDirector', 'function emitDoorArchitecture');
  assert.match(tick, /if\(!storyMode\)return;/,
    'the world tick must not advance the transport outside a run');
});

test('the only two runtime starts are themselves gated', () => {
  // loadBuilding() runs during app boot as well as inside enterStory.
  assert.match(source, /storyMode &&\s*\n\s*chapelTowerState\(\)\.phase === CHAPEL_TOWER_PHASE\.TOWER_ACTIVE/);
});

test('tearing the tower down silences the bus on the director-only path', () => {
  const stop = slice('function stopBellTowerRuntime', 'function towerBellSource');
  assert.match(stop, /bellTowerAudio\?\.destroy\?\.\(\);bellTowerAudio=null/,
    'the shared bell bus must be destroyed, not merely dereferenced');
  assert.ok(
    stop.indexOf('bellTowerAudio?.destroy?.()') > stop.indexOf('towerBellDirector?.destroy?.({cut:false})'),
    'the bus is destroyed after both owners have released it');
});

test('returning to the title runs that teardown', () => {
  const block = slice('function returnToTitle', 'function showReturnReport');
  assert.match(block, /stopBellTowerRuntime\(\)/);
  assert.match(slice('function resetRunAudio', 'function enterStory'), /stopBellTowerRuntime\(\)/);
});
