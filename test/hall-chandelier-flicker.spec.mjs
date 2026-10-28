import assert from 'node:assert/strict';
import test from 'node:test';
import { createHallChandelierFlicker, hallChandelierGlow, HALL_CHANDELIER_FLICKER } from '../src/game/hall-chandelier-flicker.js';

const config = { firstQuietSeconds: [1, 1], repeatQuietSeconds: [2, 2], durationSeconds: 1.12 };
const fresh = (extra = {}) => createHallChandelierFlicker({ seed: 'test-run', config, ...extra });
const step = (controller, seconds, extra = {}) => {
  let opportunity = null;
  for (let left = seconds; left > 1e-9; left -= .1) opportunity = controller.advance({ dt: Math.min(.1, left), eligible: true, ...extra });
  return opportunity;
};
const commit = (controller, extra = {}) => controller.commit({ reserveBudget: () => true, persistConsumed: () => true, ...extra });

test('default timings are long, seeded, bounded and dependent on played time', () => {
  const a = createHallChandelierFlicker({ seed: 'same' }), b = createHallChandelierFlicker({ seed: 'same' });
  assert.equal(a.view().quietSeconds, b.view().quietSeconds);
  assert.ok(a.view().quietSeconds >= 120 && a.view().quietSeconds <= 240);
  assert.equal(a.view().power, 0);
  for (const dt of [NaN, Infinity, -1, 10, 300]) assert.equal(a.advance({ dt, eligible: true }), null);
  assert.equal(a.view().eligibleSeconds, 0, 'invalid and away gaps cannot catch up');
  step(a, 5, { eligible: false });
  assert.equal(a.view().eligibleSeconds, 0, 'a timer alone cannot turn the fitting on');
  assert.equal(HALL_CHANDELIER_FLICKER.maximumEpisodes, 2);
});

test('reservation and durable consumption happen before any emitting frame', () => {
  const controller = fresh(), order = [];
  const opportunity = step(controller, 1.1);
  assert.ok(opportunity);
  assert.equal(controller.view().power, 0);
  assert.equal(controller.view().consumedCount, 0);
  assert.equal(controller.commit({ opportunity,
    reserveBudget() { order.push('reserve'); assert.equal(controller.view().power, 0); return true; },
    persistConsumed(count) { order.push(`save:${count}`); assert.equal(controller.view().power, 0); return true; },
  }), true);
  assert.deepEqual(order, ['reserve', 'save:1']);
  controller.advance({ dt: .1, eligible: true });
  assert.ok(controller.view().power > 0);
  assert.equal(controller.view().consumedCount, 1);
  assert.equal(commit(controller), false, 'an opportunity cannot be committed twice');
});

test('each protection freezes quiet and cancels an active episode without replay', () => {
  const protections = [{ eligible: false }, { inHall: false }, { paused: true }, { hidden: true }, { focused: false },
    { recording: true }, { listening: true }, { playback: true }, { stalled: true }, { slating: true },
    { blocked: true }, { battle: true }, { finale: true }, { dialogue: true }, { suppressActors: true },
    { reduceDread: true }, { effectsMode: 'reduced' }, { effectsMode: 'off' },
    { applausePriority: true }, { threatNear: .26 }];
  for (const protection of protections) {
    const controller = fresh(); step(controller, .5); step(controller, 10, protection);
    assert.ok(Math.abs(controller.view().eligibleSeconds - .5) < 1e-8, JSON.stringify(protection));
    step(controller, .6); assert.equal(commit(controller), true);
    controller.advance({ dt: .1, eligible: true }); assert.ok(controller.view().power > 0);
    controller.advance({ dt: .1, eligible: true, ...protection });
    assert.equal(controller.view().power, 0, JSON.stringify(protection));
    assert.equal(controller.view().active, false);
    assert.equal(controller.view().consumedCount, 1);
    assert.equal(step(controller, .5), null, 'interrupted episode is not replayed on return');
  }
});

test('budget races, stale opportunities and failed saves never emit', () => {
  const controller = fresh(); const opportunity = step(controller, 1.1); let saves = 0;
  assert.equal(controller.commit({ opportunity, reserveBudget: () => false, persistConsumed: () => saves++ }), false);
  assert.equal(saves, 0); assert.equal(controller.view().power, 0); assert.equal(controller.view().consumedCount, 0);
  step(controller, 1.1);
  assert.equal(controller.commit({ opportunity, reserveBudget: () => true, persistConsumed: () => saves++ }), false,
    'a cancelled opportunity cannot claim a later episode');
  assert.equal(commit(controller, { persistConsumed: () => false }), false);
  assert.equal(controller.view().consumedCount, 0); assert.equal(controller.view().power, 0);
  step(controller, 1.1);
  assert.equal(commit(controller, { persistConsumed: () => { throw new Error('save unavailable'); } }), false);
  assert.equal(controller.view().power, 0);
  step(controller, 1.1);
  assert.equal(commit(controller, { persistConsumed: () => Promise.resolve(true) }), false, 'persistence must be synchronous');
  assert.equal(controller.view().power, 0);
});

test('quiet accrues during cooldown but only one opportunity can claim a ready budget', () => {
  const controller = fresh(); step(controller, 20, { budgetReady: false });
  assert.equal(controller.view().eligibleSeconds, 1, 'eligible Hall time is capped at one earned quiet period');
  assert.equal(controller.view().opportunity, null);
  assert.equal(controller.view().power, 0);
  assert.equal(commit(controller), false, 'a due timer is not an atomic reservation');
  assert.ok(controller.advance({ dt: .1, eligible: true, budgetReady: true }));
  assert.equal(commit(controller), true);
  controller.advance({ dt: .1, eligible: true, budgetReady: false });
  assert.ok(controller.view().power > 0, 'the reservation makes the shared budget unavailable for the active episode');
  step(controller, 1.2);
  assert.equal(controller.view().power, 0);
  assert.equal(step(controller, 1), null, 'long pre-event waits do not earn a second episode');
});

test('an uncommitted opportunity cannot wait through a take, focus loss or applause priority', () => {
  for (const protection of [{ recording: true }, { applausePriority: true }, { focused: false }]) {
    const controller = fresh();
    const opportunity = step(controller, 1.1);
    assert.ok(opportunity);
    controller.advance({ dt: .1, eligible: true, ...protection });
    assert.equal(controller.view().opportunity, null);
    assert.equal(commit(controller, { opportunity }), false);
    assert.equal(step(controller, .5), null, 'resume cannot release a queued event');
    assert.equal(controller.view().consumedCount, 0);
    assert.equal(controller.view().power, 0);
  }
});

test('a full 120 seconds of Hall play accrues during the shared cooldown without emission', () => {
  const controller = createHallChandelierFlicker({ seed: 'production-clock',
    config: { firstQuietSeconds: [120, 120], repeatQuietSeconds: [240, 240] } });
  step(controller, 121, { budgetReady: false });
  assert.equal(controller.view().eligibleSeconds, 120);
  assert.equal(controller.view().power, 0);
  assert.equal(controller.view().consumedCount, 0);
  assert.equal(commit(controller), false);
  assert.ok(controller.advance({ dt: .01, eligible: true, budgetReady: true }));
  assert.equal(commit(controller), true);
  controller.advance({ dt: .1, eligible: true, budgetReady: false });
  assert.ok(controller.view().power > 0);
});

test('a quiet earned during cooldown cannot turn return from a protected or away state into its trigger', () => {
  for (const protection of [{ recording: true }, { paused: true }, { focused: false }, { hidden: true }, { dt: 100 }]) {
    const controller = fresh();
    step(controller, 20, { budgetReady: false });
    assert.equal(controller.view().eligibleSeconds, 1);
    controller.advance({ dt: .1, eligible: true, ...protection });
    assert.equal(controller.view().eligibleSeconds, 0);
    assert.equal(step(controller, .5), null);
    assert.equal(controller.view().consumedCount, 0);
    assert.equal(controller.view().power, 0);
  }
});

test('reload retains consumption and begins dark with a fresh repeat quiet', () => {
  const controller = fresh(); step(controller, 1.1); commit(controller); step(controller, .2);
  const loaded = fresh(controller.snapshot());
  assert.equal(loaded.view().consumedCount, 1); assert.equal(loaded.view().power, 0); assert.equal(loaded.view().active, false);
  assert.equal(loaded.view().quietSeconds, 2);
  assert.equal(step(loaded, 1), null);
  assert.ok(step(loaded, 1.1)); assert.equal(commit(loaded), true); step(loaded, 1.2);
  assert.equal(loaded.view().power, 0); assert.equal(loaded.view().consumedCount, 2);
  assert.equal(step(loaded, 50), null, 'two consumed episodes exhaust this run');
  assert.equal(fresh({ consumedCount: 999 }).view().consumedCount, 2);
});

test('glow is one bounded continuous rise and decay at different frame rates', () => {
  const samples = Array.from({ length: 1001 }, (_, i) => hallChandelierGlow(i / 1000));
  assert.equal(samples[0], 0); assert.equal(samples.at(-1), 0);
  assert.ok(samples.every(value => value >= 0 && value <= 1));
  for (let i = 1; i <= 180; i++) assert.ok(samples[i] >= samples[i - 1]);
  for (let i = 181; i < samples.length; i++) assert.ok(samples[i] <= samples[i - 1]);
  for (const frameSeconds of [.02, .05]) {
    const controller = fresh(); step(controller, 1.1); commit(controller);
    for (let i = 0; i < Math.round(.4 / frameSeconds); i++) controller.advance({ dt: frameSeconds, eligible: true });
    assert.ok(Math.abs(controller.view().power - hallChandelierGlow(.4 / 1.12)) < 1e-10);
  }
});
