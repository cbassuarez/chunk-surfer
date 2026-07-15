import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('feature smoke captures the restored title, authored slates, cinematic roll, and return report', () => {
  const source = readFileSync('tools/chunk_surfer/tests/feature-regression-smoke.mjs', 'utf8');
  for (const file of [
    '01-opening-credits.png',
    '01-opening-credits-compact.png',
    '01b-opening-creator.png',
    '01b-opening-creator-compact.png',
    '01c-opening-sound-design.png',
    '01c-opening-sound-design-compact.png',
    '01d-opening-quotation.png',
    '01d-opening-quotation-compact.png',
    '02-title-current-build.png',
    '02-title-compact.png',
    '08-chunk-surf-long-hall.png',
    '09-credits-opening-card.png',
    '09-credits-opening-card-compact.png',
    '10-credits-roll-early.png',
    '10-credits-roll-early-compact.png',
    '11-credits-roll-mid.png',
    '11-credits-roll-mid-compact.png',
    '12-credits-closing-card.png',
    '12-credits-closing-card-compact.png',
    '13-return-report-after-credits.png',
    '13-return-report-after-credits-compact.png',
  ]) {
    assert.match(source, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /__probe\.openCredits\(\)/);
  assert.match(source, /__probe\.endingCredits\('sacrifice'\)/);
  assert.match(source, /chunkSurf\.state\.phase,'hall'/);
  assert.doesNotMatch(source, /08-chunk-surf-source-fault\.png/);
});

test('feature smoke runner is portable across release operating systems', () => {
  const source = readFileSync('tools/chunk_surfer/tests/run-feature-regression-smoke.mjs', 'utf8');
  assert.match(source, /path\.join\(root,'node_modules','vite','bin','vite\.js'\)/);
  assert.match(source, /mock-lens-service\.mjs/);
  assert.match(source, /feature-regression-smoke\.mjs/);
  assert.match(source, /process\.platform/);
  assert.match(source, /Visual smoke exceeded/);
  const capture = readFileSync('tools/chunk_surfer/tests/feature-regression-smoke.mjs', 'utf8');
  assert.doesNotMatch(capture, /page\.evaluate\([^\n]*requestAnimationFrame/);
  assert.match(capture, /interactionTimeout=process\.platform==='linux'\?30000:5000/);
});
