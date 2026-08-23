import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AFTER_TITLE } from '../src/data/conservatory-script.js';
import { freshStoryArtShotState, resolveStoryArtShot } from '../src/game/story-art-shot.js';

test('the Get-In crossing owns a threshold cutscene before internal dialogue', () => {
  const main = readFileSync('src/main.js', 'utf8');
  const start = main.indexOf('function noteArrivalCrossing');
  const end = main.indexOf('function noteArrivalThoughts', start);
  const body = main.slice(start, end);
  assert.match(body, /SPEECH\.clearSpeech\(\)/, 'yard chatter cannot leak across the cut');
  assert.match(body, /makeGetInArrivalScene\(/, 'the physical crossing opens the dedicated threshold presenter');
  assert.ok(body.indexOf('makeGetInArrivalScene(') < body.indexOf('beats: AFTER_TITLE'), 'the cutscene owns the frame before the debrief');
});

test('the threshold cutscene has a Get-In slate distinct from the generic title preview', () => {
  const source = readFileSync('src/game/coldopen.js', 'utf8');
  assert.match(source, /export function makeGetInArrivalScene/);
  assert.match(source, /title:'GET-IN'/);
  assert.match(source, /detail:'SERVICE ENTRY \/ WEATHER CUT'/);
});

test('the complete internal debrief retains a left-hand image lane', () => {
  let state = freshStoryArtShotState();
  const ids = AFTER_TITLE.map((line, index) => {
    const resolved = resolveStoryArtShot({
      mode:'beats', sceneId:'after-title', nodeId:'beats', lineId:`after-title:${index}`,
      line, previous:state,
    });
    state = resolved.state;
    return resolved.art?.id || null;
  });
  assert.deepEqual(ids.slice(0, 4), ['door','door','door','door']);
  assert.deepEqual(ids.slice(4), ['flashlight','flashlight','flashlight']);
});
