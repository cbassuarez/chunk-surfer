import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { cinematicConservatoryFrame } from '../src/game/cinematic-conservatory.js';
import { titleScreenLayout } from '../src/game/title.js';

test('title screen uses fullscreen cinematic conservatory layout, not machine panel chrome', () => {
  const source = readFileSync('src/game/title.js', 'utf8');
  assert.match(source, /renderCinematicConservatory/);
  assert.doesNotMatch(source, /drawMachinePanel/);
  assert.doesNotMatch(source, /drawVfdText/);
  assert.doesNotMatch(source, /drawLocationIndicator/);
});

test('title screen keeps canonical menu items and keyboard activation paths', () => {
  const source = readFileSync('src/game/title.js', 'utf8');
  for (const id of ['continue', 'new-run', 'archive', 'return-index', 'just-surf', 'settings']) {
    assert.match(source, new RegExp(`id: '${id}'`));
  }
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space']) {
    assert.match(source, new RegExp(key));
  }
});

test('title cinematic layout keeps title, status, menu, and footer in bounds', () => {
  for (const size of [{ cols: 34, rows: 16 }, { cols: 80, rows: 30 }, { cols: 144, rows: 64 }]) {
    const frame = cinematicConservatoryFrame(7.25, { duration: 24, variant: 'title' });
    const layout = titleScreenLayout({ ...size, itemCount: 6, frame });
    assert.ok(layout.title.y >= 0 && layout.title.y < size.rows);
    assert.ok(layout.tagline.y >= 0 && layout.tagline.y < size.rows);
    assert.ok(layout.status.y >= 0 && layout.status.y < size.rows);
    assert.ok(layout.menu.x >= 0 && layout.menu.x + layout.menu.w <= size.cols);
    assert.ok(layout.menu.y >= 0 && layout.menu.y + layout.menu.rowCount * 2 <= size.rows);
    assert.ok(layout.footer.x >= 0 && layout.footer.x + layout.footer.w <= size.cols);
    assert.ok(layout.footer.y >= 0 && layout.footer.y < size.rows);
  }
});
