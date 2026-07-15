import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markdown = readFileSync('docs/storefront-copy.md', 'utf8');
const itch = readFileSync('docs/storefront-copy-itch.html', 'utf8');
const sharedAbout = markdown.match(
  /<!-- COPY: SHARED ABOUT START -->\n([\s\S]*?)\n<!-- COPY: SHARED ABOUT END -->/,
)?.[1] || '';

test('storefront copy stakes the narrow local Stable Diffusion material-renderer claim', () => {
  for (const phrase of [
    '3D psychological horror game',
    'local Stable Diffusion material renderer',
    'during play',
    'authored PBR materials',
    'runs locally and offline',
    'No image is uploaded to a cloud service',
  ]) assert.ok(sharedAbout.includes(phrase), phrase);
  assert.match(sharedAbout, /every 5–15 seconds[\s\S]*over 6–12 seconds/);
  assert.match(sharedAbout, /only 3D psychological horror game/);
  assert.doesNotMatch(sharedAbout, /only game (?:that )?(?:uses|using|runs) Stable Diffusion/i);
});

test('paste-ready itch HTML mirrors the searchable renderer claims', () => {
  assert.match(itch, /local Stable Diffusion material renderer/);
  assert.match(itch, /5&ndash;15 seconds/);
  assert.match(itch, /6&ndash;12 seconds/);
  assert.match(itch, /authored PBR materials/);
  assert.match(itch, /No image is uploaded to a cloud service/);
});

test('Steam short description remains under 300 characters', () => {
  const short = markdown.match(/<!-- COPY: STEAM SHORT START -->\n([^\n]+)\n<!-- COPY: STEAM SHORT END -->/)?.[1] || '';
  assert.ok(short.length > 0);
  assert.ok(short.length < 300, `${short.length} characters`);
});
