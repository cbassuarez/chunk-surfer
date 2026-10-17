import assert from 'node:assert/strict';
import test from 'node:test';
import { APPARITION_APPLAUSE, createApparitionApplauseDirector } from '../src/game/apparition-applause.js';
import { createApparitionDirector } from '../src/game/apparition-director.js';
import { buildEmergencyShadowFrame } from '../src/game/emergency-light-runtime.js';
import { EMERGENCY_CADENCE, emergencyBlinkState } from '../src/data/conservatory-lights.js';
import { ZONE } from '../src/data/floorplan/legend.js';

const PERIOD = Math.round(EMERGENCY_CADENCE.period * 1000);
const HOLD = Math.round(EMERGENCY_CADENCE.hold * 1000);
const ARM = PERIOD * 3;
const DARK = ARM + HOLD;
const DUE = DARK + APPARITION_APPLAUSE.darkDelayMs;
const LIGHT = 'hall-stage-door-maintained';
const STAGE = `hall:hall:${LIGHT}`;
const position = (index) => ({ x: 12 + index * 2, y: .5, z: 30 + index });

function frameAt(nowMs, { cause = null, index = 1, lightingState = null, pulseIndex = null } = {}) {
  const state = lightingState || (nowMs % PERIOD < HOLD ? 'emergency-on' : 'emergency-off');
  return {
    lightId: LIGHT,
    lightingState: state,
    composition: { id: 'hall-aisle-breadth', source: 'authored' },
    director: { stageKey: STAGE, card: cause && cause !== 'hard' ? { kind: cause, index } : null,
      hardRevealIndex: cause === 'hard' ? index : null },
    contract: { effectsMode: 'full', pulseIndex: pulseIndex ?? Math.floor(nowMs / PERIOD) },
    instances: [0, 1, 2].filter((at) => !(cause === 'absence' && at === index)).map((at) => ({
      id: `emergency-shadow:${LIGHT}:${at}`, apparitionIndex: at, ...position(at),
      poseId: cause === 'substitution' && at === index ? 'arm_out' : 'neutral',
      scaleY: 1.03, shadowOnly: false,
    })),
  };
}

const input = (nowMs, frame = frameAt(nowMs), options = {}) => ({
  nowMs, frame, observed: true, observedIndices: [0, 1, 2], budgetReady: true, ...options,
});

function warm(director, { base = 0, options = {}, frameOptions = {} } = {}) {
  for (let t = 0; t < ARM; t += 100) {
    const now = base + t;
    assert.equal(director.observe(input(now, frameAt(now, frameOptions), options)), null);
  }
}

function arm(director, { base = 0, cause = 'absence', options = {}, frameOptions = {} } = {}) {
  const now = base + ARM;
  assert.equal(director.observe(input(now, frameAt(now, { cause, ...frameOptions }), options)), null);
  for (let t = ARM + 250; t < DARK; t += 250) {
    const at = base + t;
    assert.equal(director.observe(input(at, frameAt(at, { cause, ...frameOptions }), options)), null);
  }
  return director.inspect().pending;
}

function finish(director, { base = 0, cause = 'absence', options = {}, state = 'emergency-off' } = {}) {
  const off = frameAt(base + DARK, { cause, lightingState: state });
  assert.equal(director.observe(input(base + DARK, off, { observed: false, ...options })), null);
  assert.equal(director.observe(input(base + DUE - 1, off, { observed: false, ...options })), null);
  return director.observe(input(base + DUE, off, { observed: false, ...options }));
}

test('one actual held absence earns one delayed clap from its old submitted world station', () => {
  const director = createApparitionApplauseDirector({ runId: 'participant-01' });
  warm(director);
  const pending = arm(director);
  assert.equal(pending.cause, 'absence');
  assert.equal(pending.dueAtMs, null, 'a visual substitution cannot clap while the red remains on');
  assert.deepEqual(pending.origin, position(1));
  const event = finish(director);
  assert.equal(event.variant, 'treatment');
  assert.equal(event.stageKey, STAGE);
  assert.equal(event.lightId, LIGHT);
  assert.equal(event.pulseIndex, 3);
  assert.equal(event.stationIndex, 1);
  assert.equal(event.emittedAtMs, DUE);
  assert.equal(event.darkAtMs, DARK);
  assert.equal(event.delayMs, 65);
  assert.equal(event.cooldownMs, 150000);
  assert.equal(event.claimsSharedBudget, true);
  assert.deepEqual(event.origin, position(1));
  assert.equal(event.sourceHeight, 1.1 * 1.03);
  for (let n = 1; n <= 20; n++) {
    assert.equal(director.observe(input(DUE + n, frameAt(DUE + n, { cause: 'absence' }))), null);
  }
  assert.equal(director.inspect().emitted, 1);
});

test('silent, ordinary and treatment conditions change only audio variant and claim identical budget/timing', () => {
  const results = APPARITION_APPLAUSE.conditions.map((condition) => {
    const director = createApparitionApplauseDirector({ runId: 'same-visual-seed', condition });
    warm(director);
    arm(director);
    const event = finish(director);
    assert.equal(event.variant, condition);
    assert.equal(director.inspect().emitted, 1, 'silent control consumes the same exposure');
    const { variant, ...comparable } = event;
    return comparable;
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});

test('substitution and sharpened reveals use the same old, held station without mutating submitted figures', () => {
  for (const cause of ['substitution', 'hard']) {
    const director = createApparitionApplauseDirector();
    warm(director);
    arm(director, { cause });
    const frame = frameAt(DARK, { cause });
    const before = structuredClone(frame);
    Object.freeze(frame.instances);
    Object.freeze(frame.director);
    Object.freeze(frame);
    assert.equal(director.observe(input(DARK, frame)), null);
    const event = director.observe(input(DUE, frame));
    assert.equal(event.cause, cause);
    assert.equal(event.poseId, 'neutral', 'source refers to the observed pose before the change');
    assert.deepEqual(event.origin, position(1));
    assert.deepEqual(frame, before);
    assert.equal(Object.hasOwn(event, 'poses'), false, 'the audio observer cannot direct the crowd');
  }
});

test('all three lighting states retain their role: red observes, torch-lit dark and unlit can release', () => {
  for (const state of ['emergency-off', 'unlit']) {
    const director = createApparitionApplauseDirector();
    warm(director);
    arm(director);
    const event = finish(director, { state });
    assert.equal(event.lightingState, state);
    assert.deepEqual(event.origin, position(1));
  }
  const noRed = createApparitionApplauseDirector();
  warm(noRed, { frameOptions: { lightingState: 'unlit' } });
  arm(noRed, { frameOptions: { lightingState: 'unlit' } });
  assert.equal(finish(noRed, { state: 'unlit' }), null, 'darkness alone cannot invent an observed audience');
});

test('props submission is not proof of a witnessed formation; observation and warm-up fail closed', () => {
  for (const options of [{ observed: false }, { observedIndices: undefined }]) {
    const director = createApparitionApplauseDirector();
    warm(director, { options });
    arm(director, { options });
    assert.equal(finish(director), null);
    assert.equal(director.inspect().observedLitMs, 0);
  }
  const fresh = createApparitionApplauseDirector();
  assert.equal(fresh.observe(input(ARM, frameAt(ARM, { cause: 'absence' }))), null);
  assert.equal(fresh.inspect().pending, null);
});

test('a witnessed neighbour cannot supply observation evidence for an unseen selected identity', () => {
  for (const cause of ['absence', 'substitution', 'hard']) {
    const director = createApparitionApplauseDirector();
    warm(director, { options: { observedIndices: [0] } });
    arm(director, { cause, options: { observedIndices: [0] } });
    assert.equal(finish(director, { cause }), null, `${cause} cannot use an unseen station`);
  }
  const unseenChange = createApparitionApplauseDirector();
  warm(unseenChange);
  arm(unseenChange, { cause: 'substitution', options: { observedIndices: [0] } });
  assert.equal(finish(unseenChange, { cause: 'substitution' }), null,
    'a previously witnessed actor changing off screen cannot release the cue');
});

test('only the authored Hall aisle formation qualifies, even when another room borrows the same fitting', () => {
  for (const change of [
    (frame) => { frame.composition.id = 'foyer-threshold-group'; },
    (frame) => { frame.composition.id = 'natatorium-pool-edge'; },
    (frame) => { frame.lightId = 'academic-emergency-west'; },
    (frame) => { frame.contract.effectsMode = 'reduced'; },
  ]) {
    const director = createApparitionApplauseDirector();
    warm(director);
    arm(director);
    const frame = frameAt(DARK, { cause: 'absence' });
    change(frame);
    assert.equal(director.observe(input(DARK, frame)), null);
    assert.equal(director.inspect().pending, null);
    assert.equal(finish(director), null, 'returning to the qualifying room does not replay the cancelled cue');
  }
});

test('every occupation/accessibility/lifecycle block cancels the pending event without replay', () => {
  const blocks = [
    { active: false }, { enabled: false }, { suppressed: true }, { paused: true },
    { hidden: true }, { focused: false }, { recording: true }, { listening: true },
    { modal: true }, { battle: true }, { reduceDread: true },
    { effectsMode: 'reduced' }, { effectsMode: 'off' },
  ];
  for (const options of blocks) {
    const director = createApparitionApplauseDirector();
    warm(director);
    arm(director);
    assert.equal(finish(director, { options }), null, JSON.stringify(options));
    assert.equal(director.inspect().pending, null);
    assert.equal(director.observe(input(DUE + 10, frameAt(DUE + 10, { cause: 'absence' }))), null);
    assert.equal(director.inspect().emitted, 0);
  }
});

test('the shared budget must permit both arming and release; denied events never wait for a later opening', () => {
  for (const deniedAt of ['arm', 'release']) {
    const director = createApparitionApplauseDirector();
    warm(director);
    arm(director, { options: { budgetReady: deniedAt !== 'arm' } });
    assert.equal(finish(director, { options: { budgetReady: false } }), null);
    assert.equal(director.observe(input(DUE + 10, frameAt(DUE + 10, { cause: 'absence' }))), null);
    assert.equal(director.inspect().pending, null);
  }
  const unspecified = createApparitionApplauseDirector();
  warm(unspecified);
  arm(unspecified, { options: { budgetReady: undefined } });
  assert.equal(finish(unspecified), null);
});

test('camera/station changes cannot move a reserved source or leak mutable event state', () => {
  const director = createApparitionApplauseDirector();
  warm(director);
  arm(director, { cause: 'substitution' });
  const exposed = director.inspect();
  exposed.pending.origin.x = 9999;
  assert.deepEqual(director.inspect().pending.origin, position(1));
  const changed = frameAt(DARK, { cause: 'substitution' });
  changed.instances[1].x += 50;
  director.observe(input(DARK, changed));
  const event = director.observe(input(DUE, changed));
  assert.deepEqual(event.origin, position(1));
});

test('late frames, missing dark edges, clock jumps and explicit cancellation cannot produce delayed surprises', () => {
  for (const action of [
    (director) => { director.cancel('test'); },
    (director) => { director.observe(input(DARK + 700, frameAt(DARK + 700, { cause: 'absence' }))); },
    (director) => { director.observe(input(ARM - 1000, frameAt(ARM - 1000, { cause: 'absence' }))); },
    (director) => { director.observe(input(NaN, frameAt(DARK, { cause: 'absence' }))); },
  ]) {
    const director = createApparitionApplauseDirector();
    warm(director);
    arm(director);
    action(director);
    assert.equal(finish(director), null);
  }
  const late = createApparitionApplauseDirector();
  warm(late);
  arm(late);
  late.observe(input(DARK, frameAt(DARK, { cause: 'absence' })));
  assert.equal(late.observe(input(DUE + 121, frameAt(DUE + 121, { cause: 'absence' }))), null);
  assert.equal(late.inspect().lastCancellation, 'late');
});

test('one event per run persists beyond the shared cooldown; explicit experiment reset opens a new exposure', () => {
  const director = createApparitionApplauseDirector({ runId: 'first' });
  warm(director); arm(director); assert.ok(finish(director));
  const base = PERIOD * 70;
  warm(director, { base });
  arm(director, { base });
  assert.equal(finish(director, { base }), null);
  assert.equal(director.inspect().emitted, 1);
  director.reset({ runId: 'second', condition: 'silent' });
  warm(director); arm(director);
  const next = finish(director);
  assert.equal(next.variant, 'silent');
  assert.match(next.id, /second/);
});

test('the real coordinate-blind director and Hall placement frame can earn the event without a synthetic actor', () => {
  const visual = createApparitionDirector({ seed: 'applause-real-stage' });
  const audio = createApparitionApplauseDirector({ runId: 'real-stage' });
  const makeFrame = (nowMs) => {
    const blink = emergencyBlinkState(LIGHT, nowMs / 1000);
    return buildEmergencyShadowFrame([{ id: LIGHT, kind: 'emergency', x: 98.75, y: 2.83, z: 8,
      floorY: 0, zone: ZONE.hall, intensity: blink.scale * 3.6, shadowReveal: blink.shadowReveal,
      pulseIndex: blink.pulseIndex }], {
      listener: { x: 105, y: 0, z: 8 }, viewYaw: -Math.PI / 2, timeSec: nowMs / 1000,
      effectsMode: 'full', stageKey: 'hall:hall', director: visual, renderGroup: 'hall', torchOn: true,
    });
  };
  let oldStation;
  for (let now = 0; now < ARM; now += 100) {
    const frame = makeFrame(now);
    if (frame.lightingState === 'emergency-on') oldStation = frame.instances.find((instance) => instance.apparitionIndex === 1);
    assert.equal(audio.observe(input(now, frame)), null);
  }
  visual.forceNext({ card: 'absence', index: 1 });
  for (let now = ARM; now < DARK; now += 250) assert.equal(audio.observe(input(now, makeFrame(now))), null);
  assert.equal(audio.observe(input(DARK, makeFrame(DARK), { observed: false })), null);
  const event = audio.observe(input(DUE, makeFrame(DUE), { observed: false }));
  assert.ok(event);
  assert.equal(event.cause, 'absence');
  assert.deepEqual(event.origin, { x: oldStation.x, y: oldStation.y, z: oldStation.z });
});
