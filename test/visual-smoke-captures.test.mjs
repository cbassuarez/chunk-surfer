import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('feature smoke captures title, opening, credits intro, and release record panel', () => {
  const source = readFileSync('tools/chunk_surfer/tests/feature-regression-smoke.mjs', 'utf8');
  for (const file of [
    '01-opening-credits.png',
    '02-title-current-build.png',
    '09-credits-intro.png',
    '10-release-record-panel.png',
  ]) {
    assert.match(source, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /__probe\.openCredits\(\)/);
});
