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
  for (const id of ['guard', 'door', 'surfer', 'circuitBentInterface', 'tuningFork']) {
    assert.ok(STORY_ART[id], id);
    assert.ok(STORY_ART[id].src.includes('story-art/'), id);
    assert.ok(STORY_ART[id].alt, id);
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
