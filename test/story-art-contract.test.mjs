import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

test('story art assets are present in public directory', () => {
  for (const file of [
    'public/story-art/guard.png',
    'public/story-art/door.png',
    'public/story-art/surfer.png',
    'public/story-art/circuit-bent-interface.png',
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
    'public/story-art/circuit-bent-interface.png',
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

test('conversation view exposes an art ref for presenters', () => {
  const src = readFileSync('src/game/conversation.js', 'utf8');
  assert.match(src, /currentArtRef/);
  assert.match(src, /art:\s*currentArtRef\(\)/);
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
  assert.match(combat, /drawStoryArtCard/, 'combat reuses the shared story-art card primitive');
});

test('booth paperwork and threshold keep guard art until the yard walk begins', () => {
  const data = readFileSync('src/data/conservatory-script.js', 'utf8');
  assert.match(data, /order:\s*{[\s\S]*?art:\s*{\s*id:\s*'guard'/);
  assert.match(data, /threshold:\s*{[\s\S]*?art:\s*{\s*id:\s*'guard'/);
  assert.match(data, /export const COLD_OPEN = \[[\s\S]*?art:\s*{\s*id:\s*'door'/);
});
