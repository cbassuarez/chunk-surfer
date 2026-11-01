// The consent cards (photosensitivity, profile, microphone) used to size their
// panel as `lines + 8` rows and wrap two columns wider than the panel body, so
// the last line of every card — "You can play without a microphone.", "Choose
// PROFILE ON or PROFILE OFF." — was never drawn. These hold the layout to the
// body the panel really gives, and the microphone picture to its rules.
//
// Run: node --test test/warning-card-layout.spec.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { warningCardLayout, warningCardRows, warningMicArt } from '../src/game/warning.js';
import { vfdMicrophoneFrame, vfdMicWaveLevels, VFD_MIC_DOTS } from '../src/render/vfd-microphone.js';

const source = readFileSync(new URL('../src/game/warning.js', import.meta.url), 'utf8');
const words = (text) => text.replace(/•/g, ' ').split(/\s+/).filter(Boolean);
const cardWords = (name) => {
  const start = source.indexOf(`const ${name} = [`), end = source.indexOf('];', start);
  return [...source.slice(start, end).matchAll(/'((?:[^'\\]|\\.)*)'/g)].flatMap((m) => words(m[1]));
};

test('every card keeps every line reachable at every supported screen size', () => {
  // 960×600 up to a large monitor, at UI scales 0.8–1.5.
  for (const card of ['warning', 'profile', 'microphone']) {
    for (let cols = 76; cols <= 220; cols += 9) {
      for (let rows = 22; rows <= 70; rows += 4) {
        const l = warningCardLayout(card, { cols, rows, aspect: 0.45 });
        const at = `${card} ${cols}×${rows}`;
        assert.ok(l.h <= rows, `${at}: panel taller than the screen`);
        assert.ok(3 + l.visible + 1 <= l.body.h, `${at}: rows drawn below the body`);
        assert.equal(l.visible + l.scrollMax >= l.out.length, true, `${at}: lines past the scroll range`);
        for (const row of l.out) assert.ok(row.text.length <= l.textW - 2, `${at}: "${row.text}" wider than the text column`);
        if (l.art) assert.ok(l.textX + l.textW <= l.body.w, `${at}: text runs past the body`);
      }
    }
  }
});

test('the short cards never scroll at the 960×600 minimum', () => {
  for (const card of ['warning', 'microphone']) {
    assert.equal(warningCardLayout(card, { cols: 113, rows: 31, aspect: 0.45 }).scrollMax, 0, card);
  }
});

test('wrapping never drops a word, joins the hard breaks, and indents bullets', () => {
  for (const name of ['WARNINGS', 'PROFILE', 'MICROPHONE']) {
    const lines = (() => {
      const start = source.indexOf(`const ${name} = [`), end = source.indexOf('];', start);
      return [...source.slice(start, end).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
    })();
    for (const width of [30, 44, 60, 86]) {
      const rows = warningCardRows(lines, width);
      assert.deepEqual(rows.flatMap((r) => words(r.text)), cardWords(name).map((w) => w.replace(/\\'/g, "'")), `${name} at ${width}`);
      for (const r of rows) assert.ok(r.text.length <= width, `${name} at ${width}: ${r.text}`);
    }
  }
  const rows = warningCardRows(['• Measurement of choices, noise, HUSH contacts, battle responses, and',
    '  emergency fireball-surface closes to build a fictional local response profile.',
    'Settings can disable any module, restore the game window, reset inference, open the',
    'return folder, or erase all profile data and artifacts.'], 40);
  assert.ok(rows[0].text.startsWith('• '));
  assert.ok(rows.slice(1).some((r) => r.text.startsWith('  ') && /emergency|fireball/.test(r.text)), 'continuation keeps the hanging indent');
  assert.equal(rows.filter((r) => /return folder/.test(r.text))[0].cls, 'ui-blue', 'a continued sentence keeps its colour');
});

test('the microphone gives the words room first and keeps its dots square', () => {
  assert.equal(warningMicArt(50, { aspect: 0.45 }), null);
  const art = warningMicArt(86, { aspect: 0.45 });
  assert.ok(art && art.h >= 5 && 86 - art.w - 3 >= 36);
  const ratio = (art.w * 0.45) / art.h, dots = VFD_MIC_DOTS.cols / VFD_MIC_DOTS.rows;
  assert.ok(ratio >= dots && ratio < dots * 1.15, 'the box fits the dot field without stretching it');
});

test('the microphone frame is symmetric, on a 16-step duty, and still under reduced motion', () => {
  const { cols, rows } = VFD_MIC_DOTS;
  for (const t of [0, 0.31, 0.77, 1.4]) {
    for (const live of [true, false]) {
      const frame = vfdMicrophoneFrame({ t, live });
      assert.equal(frame.length, rows);
      for (const row of frame) {
        assert.equal(row.length, cols);
        assert.deepEqual(row, [...row].reverse(), 'mirror-symmetric about the centre column');
        for (const v of row) assert.equal(Math.round(v * 16), v * 16);
      }
    }
  }
  assert.deepEqual(vfdMicrophoneFrame({ t: 0.2, reduced: true }), vfdMicrophoneFrame({ t: 2.9, reduced: true }));
});

test('the sound arcs show only while ALLOW is selected, and they travel', () => {
  assert.deepEqual(vfdMicWaveLevels(0.5, { live: false }), [0, 0, 0]);
  const lit = (frame) => frame.flat().filter((v) => v > 0).length;
  // The arcs sit outside the cradle: nothing out there unless the choice is ALLOW.
  const outer = (frame) => frame.flatMap((row) => row.slice(0, 8)).some((v) => v > 0);
  assert.equal(outer(vfdMicrophoneFrame({ t: 0.9, live: false })), false);
  assert.ok([0.3, 0.6, 0.9, 1.1].some((t) => outer(vfdMicrophoneFrame({ t, live: true }))));
  const crests = [0.1, 0.35, 0.6].map((t) => vfdMicWaveLevels(t).indexOf(Math.max(...vfdMicWaveLevels(t))));
  assert.deepEqual(crests, [...crests].sort((a, b) => a - b), 'the brightest arc moves outward');
  assert.ok(lit(vfdMicrophoneFrame({ t: 0.4, live: true })) > lit(vfdMicrophoneFrame({ t: 0.4, live: false })));
});
