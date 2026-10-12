import assert from 'node:assert/strict';
import test from 'node:test';
import { absorbSourceCover, breachSourceDesktop, normalizeSourceDesktop, rebuildSourceCover, sourceDesktopCapacity, sourceDesktopGuard } from '../src/game/source-desktop-state.js';

test('shelter normalization bounds counts and rejects unknown persisted movements', () => {
  assert.deepEqual(normalizeSourceDesktop({breaks:['a','a','bad'],cover:999,tier:999},{movementIds:['a','b','c']}), {version:1,breached:true,tier:3,breaks:['a'],cover:2});
  assert.equal(normalizeSourceDesktop({cover:-7}).cover, 0);
  assert.deepEqual(normalizeSourceDesktop({breaks:'invalid'}).breaks, []);
  assert.equal(normalizeSourceDesktop({cover:Infinity}).cover, 3);
  assert.deepEqual([0,1,2,99].map(sourceDesktopGuard), [5,4,3,3]);
});

test('each movement spends one permanent plate, clears cover, and cannot breach twice', () => {
  let state = normalizeSourceDesktop();
  for(const [index,id] of ['a','b','c'].entries()) {
    const before = structuredClone(state);
    const next = breachSourceDesktop(state,id);
    assert.deepEqual(state,before,'pure operation mutated its input');
    assert.equal(next.cover,0);
    assert.equal(next.tier,index+1);
    assert.equal(sourceDesktopCapacity(next),2-index);
    assert.deepEqual(breachSourceDesktop(next,id),next);
    state = rebuildSourceCover(next);
    assert.equal(state.cover,Math.min(1,2-index));
  }
  assert.equal(rebuildSourceCover(state).cover,0,'HOLD regenerated a destroyed plate');
});

test('plates absorb only a hit that actually lands and never become passive incoming damage stacks', () => {
  const full = normalizeSourceDesktop();
  const clear = absorbSourceCover(full,0,0);
  assert.equal(clear.state.cover,3);
  const chip = absorbSourceCover(full,2,1);
  assert.equal(chip.damage,0);
  assert.equal(chip.prevented,2);
  assert.equal(chip.state.cover,2);
  const heavy = absorbSourceCover(full,20,2);
  assert.equal(heavy.damage,17);
  assert.equal(heavy.state.cover,2);
  const naked = absorbSourceCover({...full,cover:0},20,2);
  assert.equal(naked.damage,20);
  assert.equal(naked.spent,false);
});
