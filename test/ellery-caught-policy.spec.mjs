import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONE } from '../src/data/floorplan/legend.js';
import { elleryCaughtEligible, elleryCaughtRearm, elleryCaughtFootstep } from '../src/game/ellery-caught-policy.js';
import { freshHushNoisePerception, updateHushNoisePerception } from '../src/game/hush-noise-perception.js';
import * as monitor from '../src/audio/monitor.js';

const ordinary = { zone: ZONE.practice, ordinaryWorld: true, foreground: true, hushLive: true,
  checkpointReady: true, rearmerReady: true, protectedOwner: false, transportHeld: false, protectedTake: false };

test('CAUGHT is restricted to foreground Ellery and protected owners take priority', () => {
  assert.equal(elleryCaughtEligible(ordinary), true);
  assert.equal(elleryCaughtEligible({ ...ordinary, zone: ZONE.none, interiorCorridor: true }), true);
  for (const zone of [ZONE.none, ZONE.pub, ZONE.street, ZONE.bellTower, ZONE.sourceSpace]) {
    assert.equal(elleryCaughtEligible({ ...ordinary, zone }), false);
  }
  for (const [key, value] of Object.entries({ ordinaryWorld: false, foreground: false, hushLive: false,
    checkpointReady: false, rearmerReady: false, protectedOwner: true, transportHeld: true, protectedTake: true })) {
    assert.equal(elleryCaughtEligible({ ...ordinary, [key]: value }), false, key);
  }
});

test('cover and protected ownership do not bank exposure, but covered sound gives a clue', () => {
  let state = freshHushNoisePerception(), now = 0;
  const step = options => {
    const next = updateHushNoisePerception(state, { now: now += 100, dt: .1, db: -14, active: true, ...options });
    state = next.state;
    return next.action?.kind;
  };
  for (let tick = 0; tick < 16; tick++) assert.notEqual(step(), 'contact');
  const memory = state.perceptionUntil;
  step({ allowContact: false });
  assert.equal(state.hotHeldMs, 0);
  assert.ok(state.perceptionUntil >= memory);
  const covered = Array.from({ length: 24 }, () => step({ concealed: true }));
  assert.ok(covered.includes('clue'));
  assert.ok(!covered.includes('contact'));
  assert.equal(state.hotHeldMs, 0);
  const exposed = Array.from({ length: 30 }, () => step());
  assert.equal(exposed.filter(kind => kind === 'contact').length, 1);
  assert.ok(exposed.indexOf('contact') >= 17);
});

test('retry requires an uninterrupted quiet interval before the next capture', () => {
  let state = { quietMs: 0, ready: false };
  state = elleryCaughtRearm(state, true, .25);
  assert.equal(state.ready, false);
  state = elleryCaughtRearm(state, false, .15);
  assert.equal(state.quietMs, 0);
  state = elleryCaughtRearm(state, true, .25);
  assert.equal(elleryCaughtRearm(state, true, .15).ready, true);
});

test('room calibration can move the drawn meter without contributing to CAUGHT', () => {
  monitor.monitorReset();
  monitor.monitorSetPresenceInput(() => .9);
  monitor.monitorSetAuxInput(() => ({ rms: .22, peak: 1, clipped: true }));
  const calibration = monitor.monitorSnapshot(10, { auxiliaryCanExpose: false });
  assert.equal(calibration.clipped, true);
  assert.equal(calibration.hushRms, 0);
  assert.equal(calibration.inputKind, null);
  monitor.monitorInject(1);
  const instrumentTest=monitor.monitorSnapshot(15,{auxiliaryCanExpose:false,useInjectedExposure:false});
  assert.equal(instrumentTest.hushRms,0);
  assert.equal(instrumentTest.db,0);
  monitor.monitorInject(null);
  const optedIn = monitor.monitorSnapshot(20);
  assert.equal(optedIn.hushRms, .22);
  assert.equal(optedIn.inputKind, 'room-mic');
  monitor.monitorSetPresenceInput(null);
  monitor.monitorReset();
});

test('sustained ordinary sprint feeds HOT with the microphone disabled', () => {
  monitor.monitorReset();
  assert.equal(elleryCaughtFootstep('footstep_walk', .12), null);
  assert.equal(elleryCaughtFootstep('footstep_sprint', .45, true), null);
  assert.equal(elleryCaughtFootstep('footstep_jog', .22), null);
  const plant = elleryCaughtFootstep('footstep_sprint', .45);
  let state = freshHushNoisePerception();
  let count = 0;
  for (let ms = 0; ms < 2350; ms += 20) {
    if (ms % 80 === 0) monitor.monitorObserveAcousticEvent({
      kind: 'footstep_sprint', acoustic: plant, semantics: { playerGenerated: true },
    }, ms);
    const next = updateHushNoisePerception(state, {
      now: ms, dt: .02, db: monitor.monitorSnapshot(ms, { auxiliaryCanExpose: false }).hushDb, active: true,
    });
    state = next.state;
    if (next.action?.kind === 'contact') count++;
  }
  assert.equal(count, 1);
  monitor.monitorReset();
});
