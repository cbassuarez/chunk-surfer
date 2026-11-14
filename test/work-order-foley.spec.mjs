import assert from 'node:assert/strict';
import test from 'node:test';
import { CUE, PAGE_TURNS } from '../src/audio/cues.js';
import { createWorkOrderFoley } from '../src/audio/work-order-foley.js';

function makeFoley(events = []) {
  return {
    events,
    foley: createWorkOrderFoley({
      preload: (urls, options) => events.push({ type: 'preload', urls, options }),
      play: (url, options) => events.push({ type: 'play', url, ...options }),
      stopGroup: (group) => events.push({ type: 'stop', group }),
    }),
  };
}

test('preloads three recorded sources and trims paper to the lift and lower', () => {
  const { events, foley } = makeFoley();
  foley.warm();
  assert.deepEqual(events[0].urls, [PAGE_TURNS[3], PAGE_TURNS[2], CUE.signature]);
  foley.lift();
  foley.lower();
  const [up, down] = events.filter(({ type }) => type === 'play');
  assert.equal(up.url, PAGE_TURNS[3]);
  assert.equal(down.url, PAGE_TURNS[2]);
  assert.equal(up.group, down.group);
  assert.ok(up.trimEnd - up.trimStart < 0.5);
  assert.ok(down.trimEnd - down.trimStart < 0.34);
});

test('biro slices follow contact duration and are cancelled on lowering', () => {
  const { events, foley } = makeFoley();
  foley.lift();
  assert.equal(foley.stroke({ duration: 0 }), null);
  foley.stroke({ duration: 0.045, strength: 0.3 });
  foley.stroke({ duration: 0.07, strength: 0.8 });
  const [lift, a, b] = events.filter(({ type }) => type === 'play');
  assert.equal(a.url, CUE.signature);
  assert.equal(a.sliceSeconds, 0.045);
  assert.equal(b.sliceSeconds, 0.07);
  assert.notEqual(a.trimStart, b.trimStart);
  assert.ok(b.gain > a.gain);
  assert.notEqual(a.group, lift.group);
  const prior = events.length;
  foley.lower();
  assert.deepEqual(events.slice(prior, prior + 2), [
    { type: 'stop', group: a.group }, { type: 'stop', group: lift.group },
  ]);
});

test('an interrupted scene cancels only its own sheet and nib', () => {
  const { events, foley } = makeFoley();
  const other = makeFoley(events).foley;
  foley.lift();
  other.lift();
  foley.stroke({ duration: 0.2 });
  other.stroke({ duration: 0.2 });
  const [sheet, otherSheet, nib, otherNib] = events.filter(({ type }) => type === 'play');
  const prior = events.length;
  foley.stop();
  assert.notEqual(sheet.group, otherSheet.group);
  assert.notEqual(nib.group, otherNib.group);
  assert.deepEqual(events.slice(prior), [
    { type: 'stop', group: nib.group }, { type: 'stop', group: sheet.group },
  ]);
});
