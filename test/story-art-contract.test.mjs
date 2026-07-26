import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

test('story art assets are present in public directory', () => {
  for (const file of [
    'public/story-art/guard.png',
    'public/story-art/door.png',
    'public/story-art/surfer.png',
    'public/story-art/circuit-bent-interface.jpg',
    'public/story-art/tuningfork.png',
    'public/story-art/walkie.png',
  ]) {
    assert.ok(existsSync(file), file);
  }
});

test('story art assets are optimized for fast decode', () => {
  for (const file of [
    'public/story-art/guard.png',
    'public/story-art/door.png',
    'public/story-art/surfer.png',
    'public/story-art/circuit-bent-interface.jpg',
    'public/story-art/tuningfork.png',
    'public/story-art/walkie.png',
  ]) {
    const { size } = statSync(file);
    assert.ok(size < 300_000, `${file} should stay below 300KB, got ${size}`);
  }
});

test('cold open data uses story art refs', () => {
  const data = readFileSync('src/data/conservatory-script.js', 'utf8');
  assert.match(data, /art:\s*\{\s*id:\s*'guard'/);
  assert.match(data, /art:\s*\{\s*id:\s*'door'/);
});

test('battle data has boss art scaffold', () => {
  const data = readFileSync('content/narrative/battle.chapel.nothing.story.json', 'utf8');
  assert.match(data, /"id": "circuitBentInterface"/);
});

test('story art renderer uses uiDraw rather than DOM layout', () => {
  const src = readFileSync('src/game/story-art-card.js', 'utf8');
  assert.match(src, /uiDraw/);
  assert.doesNotMatch(src, /document\.createElement\(['"]div/);
});

test('conversation view exposes the resolved story-art shot for presenters', () => {
  const src = readFileSync('src/game/conversation.js', 'utf8');
  assert.match(src, /let currentStoryArt = null/);
  assert.match(src, /currentStoryArt = resolved\.art/);
  assert.match(src, /art:\s*currentStoryArt/);
  assert.match(src, /artReason:\s*currentStoryArtReason/);
});

test('story art scenes prefer side-by-side layout before vertical fallback', () => {
  for (const file of [
    'src/game/coldopen.js',
    'src/game/thoughts.js',
    'src/game/dialogue.js',
  ]) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /planStoryArtSideBySide/, file);
  }
  const combat = readFileSync('src/render/combat-view.js', 'utf8');
  assert.match(combat, /drawOpponentCombatArt/, 'combat owns its keyed opponent-art primitive');
  assert.doesNotMatch(combat, /drawStoryArtCard/, 'combat does not put an evidence card inside the abstract fight void');
});

test('booth and post-door sources retain their authored establishing stills', () => {
  const coldOpen = readFileSync('content/narrative/conservatory.cold_open_dialogue.story.json', 'utf8');
  const data = readFileSync('src/data/conservatory-script.js', 'utf8');
  assert.match(coldOpen, /"id": "boothRain"/);
  assert.match(coldOpen, /"id": "guard"/);
  assert.match(data, /export const POST_DOOR = \{[\s\S]*?art:\s*{\s*id:\s*'door'/);
});
