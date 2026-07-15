import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/game/title.js', 'utf8');

test('title screen restores the AUDIOCORP case-select machine panel', () => {
  assert.match(source, /drawMachinePanel/);
  assert.match(source, /drawVfdText/);
  assert.match(source, /drawLocationIndicator/);
  assert.match(source, /label: 'CASE SELECT'/);
  assert.match(source, /source: '4417-C'/);
  assert.doesNotMatch(source, /renderCinematicConservatory/);
  assert.doesNotMatch(source, /Georgia|Times New Roman/);
});

test('title screen keeps canonical menu items and keyboard activation paths', () => {
  for (const id of ['continue', 'new-run', 'archive', 'return-index', 'just-surf', 'settings']) {
    assert.match(source, new RegExp(`id: '${id}'`));
  }
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space']) {
    assert.match(source, new RegExp(key));
  }
});

test('title screen keeps the default selection and two-step new-run confirmation', () => {
  assert.match(source, /let sel = activeRun \? 0 : 1/);
  assert.match(source, /item\.confirms && !confirmNewRun/);
  assert.match(source, /START NEW RUN\? PRESS ENTER AGAIN/);
  assert.match(source, /menuColumns = body\.w >= 58/);
  assert.match(source, /BUILD.*CURRENT SOURCE|buildLabel/);
  assert.match(source, /body\.y \+ body\.h - 2/, 'build label keeps a blank row above the footer');
});
