import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENCOUNTER_PHASE, ENCOUNTER_TIMING, makeEncounterStartScene,
} from '../src/game/encounter-start.js';
import { moveCombatGear, reorderCombatGear, normalizeCombatLoadout } from '../src/game/combat-loadout.js';

// A tiny in-memory loadout store so the scene can be driven without a save.
function harness(initialTop = ['light', 'recorder', 'radio'], opts = {}) {
  let loadout = normalizeCombatLoadout({ top: initialTop });
  const equipment = ['light', 'recorder', 'radio', 'interface', 'coffee'].map((id) => ({ id, present: true }));
  let confirmed = 0;
  const calls = [];
  const fx = {
    hold: (...a) => calls.push(['hold', ...a]),
    glitch: (...a) => calls.push(['glitch', ...a]),
    shake: (...a) => calls.push(['shake', ...a]),
    flash: (...a) => calls.push(['flash', ...a]),
  };
  const scene = makeEncounterStartScene({
    getLoadout: () => loadout,
    getEquipment: () => equipment,
    moveEquipment: (id, dest) => { const r = moveCombatGear(loadout, id, dest); if (r.changed) loadout = r.loadout; return r; },
    reorderEquipment: (id, dir) => { const r = reorderCombatGear(loadout, id, dir); if (r.changed) loadout = r.loadout; return r; },
    onConfirm: () => { confirmed += 1; },
    fx,
    ...opts,
  });
  return {
    scene, calls,
    get top() { return loadout.top; },
    get confirmed() { return confirmed; },
    // Run the lead-in out on the clock, the way the scene loop would.
    settle() { for (let i = 0; i < 400; i += 1) scene.update(1 / 60); return scene.view().phase; },
  };
}

// ── the loadout rules, which are NOT what is changing ───────────────────────
// These are the briefing's own assertions, carried over. If the revamp broke
// them it broke something it was never supposed to touch.

test('the screen lists battle gear and previews the tray order', () => {
  const h = harness();
  h.settle();
  const view = h.scene.view();
  assert.equal(view.id, 'encounter-start');
  assert.deepEqual(view.top, ['light', 'recorder', 'radio']);
  assert.equal(view.selected, 'light', 'selection starts on the first tray item');
});

test('SPACE patches gear between the tray and storage', () => {
  const h = harness();
  h.settle();
  h.scene.key({ key: ' ' });
  assert.ok(!h.top.includes('light'), 'light left the tray');
  const before = h.top.length;
  h.scene.key({ key: 'ArrowDown' });
  h.scene.key({ key: 'ArrowDown' });
  h.scene.key({ key: ' ' });
  assert.ok(h.top.length >= before, 'a storage item can be patched back in');
});

test('R reorders the tray, which is the in-fight tool rail order', () => {
  const h = harness();
  h.settle();
  h.scene.key({ key: 'ArrowDown' });
  h.scene.key({ key: 'r' });
  assert.deepEqual(h.top.slice(0, 2), ['recorder', 'light'], 'the tool moved up in the rail order');
});

test('ENTER confirms and hands off to the fight exactly once', () => {
  const h = harness();
  h.settle();
  h.scene.key({ key: 'Enter' });
  h.scene.key({ key: 'Enter' });
  assert.equal(h.confirmed, 1, 'a double tap must not start two fights');
});

// ── the transition ──────────────────────────────────────────────────────────

test('the phases run in order and settle on the select', () => {
  const h = harness();
  assert.equal(h.scene.view().phase, ENCOUNTER_PHASE.HOLD, 'it opens on the freeze');
  assert.equal(h.scene.view().leadIn, true);

  const seen = [ENCOUNTER_PHASE.HOLD];
  for (let i = 0; i < 400; i += 1) {
    h.scene.update(1 / 60);
    const p = h.scene.view().phase;
    if (p !== seen[seen.length - 1]) seen.push(p);
  }
  assert.deepEqual(seen, [
    ENCOUNTER_PHASE.HOLD, ENCOUNTER_PHASE.LOSS, ENCOUNTER_PHASE.TEAR, ENCOUNTER_PHASE.SELECT,
  ], 'the lead-in did not run hold → loss → tear → select');
  assert.equal(h.scene.view().leadIn, false);
});

test('the lead-in is skippable, and skipping does not start the fight', () => {
  const h = harness();
  h.scene.update(1 / 60);
  h.scene.key({ key: 'x' });
  assert.equal(h.scene.view().phase, ENCOUNTER_PHASE.SELECT, 'a key during the lead-in jumps to the tiles');
  assert.equal(h.confirmed, 0, 'skipping the scare is not confirming the loadout');
});

test('the fight cannot be declined', () => {
  const h = harness();
  h.settle();
  h.scene.key({ key: 'Escape' });
  h.scene.key({ key: 'Tab' });
  h.scene.key({ controllerAction: 'back' });
  assert.equal(h.confirmed, 0, 'escape must not start the fight');
  assert.equal(h.scene.view().started, false, 'escape must not cancel it either');
  h.scene.key({ key: 'Enter' });
  assert.equal(h.confirmed, 1, 'the only way out is through');
});

// THE ACCESSIBILITY CASE. Every effect is a no-op when the player has turned
// them down, and the phase clock must not depend on any of them — a lead-in that
// waits on an effect that never fires strands the player on a frozen frame.
test('with every effect suppressed the lead-in still reaches the tiles', () => {
  const dead = { hold() {}, glitch() {}, shake() {}, flash() {} };
  const h = harness(undefined, { fx: dead });
  assert.equal(h.settle(), ENCOUNTER_PHASE.SELECT, 'the transition stranded the player');
  h.scene.key({ key: 'Enter' });
  assert.equal(h.confirmed, 1);
});

test('a scene given no fx at all still runs', () => {
  // The default is a no-op set, so a caller that forgets to pass fx gets a
  // working transition rather than a crash mid-fight.
  const scene = makeEncounterStartScene({});
  scene.enter?.();
  for (let i = 0; i < 400; i += 1) scene.update(1 / 60);
  assert.equal(scene.view().phase, ENCOUNTER_PHASE.SELECT);
});

test('the effects fire once, on entry, and the flash lands on the tear', () => {
  const h = harness();
  h.scene.enter();
  h.scene.enter();
  const kinds = h.calls.map((c) => c[0]);
  assert.deepEqual(kinds, ['hold', 'glitch', 'shake'], 'entering twice fired the jolt twice');
  for (let i = 0; i < 400; i += 1) h.scene.update(1 / 60);
  assert.ok(h.calls.some((c) => c[0] === 'flash'), 'nothing marked the moment the screen opened');
});

test('the timings are short enough to be a jolt rather than a cutscene', () => {
  const total = ENCOUNTER_TIMING.hold + ENCOUNTER_TIMING.loss + ENCOUNTER_TIMING.tear;
  assert.ok(total < 1.2, `the lead-in runs ${total.toFixed(2)}s in front of a fight nobody asked for`);
});
