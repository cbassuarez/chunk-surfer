import test from 'node:test';
import assert from 'node:assert/strict';
import { CREDITS, CREDIT_RECORD_TITLE, flattenCredits } from '../src/data/credits.js';

test('credits release record has required public sections', () => {
  const headings = CREDITS.map((section) => section.heading);
  for (const required of ['Chunk Surfer', 'Production', 'Tools & Libraries', 'Credits', 'Website', 'Copyright']) {
    assert.ok(headings.includes(required), required);
  }
  assert.equal(CREDIT_RECORD_TITLE, 'RELEASE RECORD');
});

test('credits data has no empty headings or lines', () => {
  for (const section of CREDITS) {
    assert.ok(String(section.heading || '').trim(), 'empty heading');
    assert.ok(Array.isArray(section.lines), `${section.heading} lines`);
    for (const line of section.lines) assert.ok(String(line || '').trim(), `${section.heading} empty line`);
  }
});

test('credits data is public and non-spoilery', () => {
  const flat = flattenCredits().map((entry) => entry.text).join('\n');
  assert.match(flat, /Sebastian Suarez-Solis/);
  assert.match(flat, /cbassuarez\.com/);
  assert.match(flat, /© 2026/);
  assert.doesNotMatch(flat, /ending/i);
  assert.doesNotMatch(flat, /seed/i);
  assert.doesNotMatch(flat, /unlock/i);
});
