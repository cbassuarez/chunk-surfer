import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the Hush jumpscare uses the authored surfer still rather than a procedural skull flash', () => {
  const css = readFileSync('styles.css', 'utf8');
  const main = readFileSync('src/main.js', 'utf8');
  const jump = css.match(/#hushJump\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(jump, /story-art\/surfer\.png/);
  assert.match(jump, /background-size:cover/);
  assert.doesNotMatch(jump, /radial-gradient|repeating-linear-gradient/);
  assert.doesNotMatch(css.match(/@keyframes hush-jump-rupture\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '', /invert\(/);
  assert.match(main, /function showSurferJumpscare/);
  assert.match(main, /function maybeJumpscare\(\)[\s\S]*?showSurferJumpscare\(\)/);
});
