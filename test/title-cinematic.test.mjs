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
  assert.match(source, /STANDBY \/ CASE FILE \/ SOURCE 4417-C/);
  assert.match(source, /AUDIOCORP LOCAL MONITOR READY/);
  assert.match(source, /previousSelUntil = nowMs\(\) \+ 90/);
});

test('title screen keeps canonical menu items and keyboard activation paths', () => {
  for (const id of [
    'continue',
    'new-run',
    'archive',
    'return-index',
    'just-surf',
    'beta-notice',
    'settings',
  ]) {
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
  assert.match(source, /TITLE_MENU_TWO_COLUMN_MIN_W = 64/);
  assert.match(source, /function titleMenuColumnCount/);
  assert.match(source, /bodyW >= TITLE_MENU_TWO_COLUMN_MIN_W && itemCount > 4 \? 2 : 1/);
  assert.match(source, /const estimatedColumns = titleMenuColumnCount\(estimatedBodyW, items\.length\)/);
  assert.match(source, /const colCount = titleMenuColumnCount\(body\.w, itemCount\)/);
  assert.match(source, /TITLE_CONFIRM_PROMPT\.length \+ 2/);
  assert.match(source, /rowW = armed\s*\?\s*layout\.confirmW/);
  assert.match(source, /menuColumns = layout\.colCount/);
  assert.doesNotMatch(source, /body\.w >= 58/);
  assert.match(source, /BUILD.*CURRENT SOURCE|buildLabel/);
  assert.match(source, /y \+ h - 5/, 'build label stays above the footer prompt strip');
});
