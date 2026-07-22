import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORY_ART,
  artFromNode,
  missingStoryArt,
  resolveStoryArt,
  storyArtRefId,
} from '../src/game/story-art.js';

test('story art manifest contains required ids', () => {
  for (const id of ['guard', 'door', 'surfer', 'circuitBentInterface', 'tuningFork', 'walkie']) {
    assert.ok(STORY_ART[id], id);
    assert.ok(STORY_ART[id].alt, id);
  }
  assert.ok(STORY_ART.guard.src.includes('story-art/'));
  assert.ok(STORY_ART.door.src.includes('story-art/'));
});

test('battle story art slots resolve to their authored stills', () => {
  for (const [id, path] of [
    ['surfer', 'story-art/surfer.png'],
    ['circuitBentInterface', 'story-art/circuit-bent-interface.png'],
    ['tuningFork', 'story-art/tuningfork.png'],
    ['walkie', 'story-art/walkie.png'],
  ]) {
    assert.ok(STORY_ART[id].src.includes(path), id);
    assert.notEqual(STORY_ART[id].status, 'PLACEHOLDER', id);
  }
});

test('resolves string refs', () => {
  assert.equal(resolveStoryArt('guard').id, 'guard');
});

test('resolves object overrides without losing manifest metadata', () => {
  const art = resolveStoryArt({ id: 'door', caption: 'Override', mode: 'boss' });
  assert.equal(art.id, 'door');
  assert.equal(art.caption, 'Override');
  assert.equal(art.mode, 'boss');
  assert.equal(art.tone, 'threshold');
});

test('unknown art refs become explicit missing cards', () => {
  const art = resolveStoryArt('missing-test');
  assert.equal(art.missing, true);
  assert.equal(art.status, 'UNAVAILABLE');
  assert.equal(missingStoryArt('x').missing, true);
});

test('storyArtRefId and artFromNode are stable', () => {
  assert.equal(storyArtRefId('guard'), 'guard');
  assert.equal(storyArtRefId({ id: 'door' }), 'door');
  assert.equal(artFromNode({ artId: 'surfer', artMode: 'hero' }).id, 'surfer');
  assert.equal(artFromNode(null, 'guard'), 'guard');
});
