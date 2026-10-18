import assert from 'node:assert/strict';
import test from 'node:test';
import { APPARITION_APPLAUSE, createApparitionApplauseDirector } from '../src/game/apparition-applause.js';
import { createApparitionDirector } from '../src/game/apparition-director.js';
import { buildEmergencyShadowFrame } from '../src/game/emergency-light-runtime.js';
import { EMERGENCY_CADENCE, emergencyBlinkState } from '../src/data/conservatory-lights.js';
import { ZONE } from '../src/data/floorplan/legend.js';

const PERIOD = Math.round(EMERGENCY_CADENCE.period * 1000), HOLD = Math.round(EMERGENCY_CADENCE.hold * 1000);
const ARM = PERIOD * 3, RESPONSE = ARM + 160, DUE = RESPONSE + APPARITION_APPLAUSE.reactionDelayMs;
const LIGHT = 'hall-stage-door-maintained', STAGE = `hall:hall:${LIGHT}`;
const LISTENER = Object.freeze({ x: 14, y: 37, yaw: 0 });
const position = (index) => ({ x: 12 + index * 2, y: .5, z: 30 + index });
function frameAt(nowMs, { cause = null, index = 1, lightingState = null, pulseIndex = null } = {}) {
  return { lightId: LIGHT, lightingState: lightingState || (nowMs % PERIOD < HOLD ? 'emergency-on' : 'emergency-off'),
    composition: { id: 'hall-aisle-breadth', source: 'authored' },
    director: { stageKey: STAGE, card: cause && cause !== 'hard' ? { kind: cause, index } : null,
      hardRevealIndex: cause === 'hard' ? index : null },
    contract: { effectsMode: 'full', pulseIndex: pulseIndex ?? Math.floor(nowMs / PERIOD) },
    instances: [0, 1, 2].filter((at) => !(cause === 'absence' && at === index)).map((at) => ({
      id: `emergency-shadow:${LIGHT}:${at}`, apparitionIndex: at, ...position(at),
      poseId: cause === 'substitution' && at === index ? 'arm_out' : 'neutral', scaleY: 1.03, shadowOnly: false,
    })),
  };
}
const input = (nowMs, frame = frameAt(nowMs), options = {}) => ({
  nowMs, frame, observed: true, observedIndices: [0, 1, 2], budgetReady: true,
  listener: { ...LISTENER }, inEncounter: true, witnessPointVisible: true,
  voluntaryLook: false, voluntaryMove: false, ...options,
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
  return director.inspect().pending;
}
function finish(director, { base = 0, cause = 'absence', options = {}, state = 'emergency-on', changeFrame } = {}) {
  const make = (now) => { const frame = frameAt(now, { cause, lightingState: state }); changeFrame?.(frame); return frame; };
  const responding = { observed: false, listener: { ...LISTENER, yaw: Math.PI / 2 }, voluntaryLook: true, ...options };
  assert.equal(director.observe(input(base + ARM + 100, make(base + ARM + 100), responding)), null);
  return director.observe(input(base + RESPONSE, make(base + RESPONSE), responding));
}

test('one witnessed error answers a voluntary look-away from its frozen station, without waiting for darkness', () => {
  const director = createApparitionApplauseDirector({ runId: 'participant-01' }); warm(director);
  const pending = arm(director);
  assert.equal(pending.dueAtMs, null); assert.equal(pending.expiresAtMs, ARM + 3200);
  assert.deepEqual(pending.origin, position(1));
  const event = finish(director);
  assert.equal(event.variant, 'treatment'); assert.equal(event.stageKey, STAGE); assert.equal(event.lightId, LIGHT);
  assert.equal(event.pulseIndex, 3); assert.equal(event.stationIndex, 1); assert.equal(event.response, 'look-away');
  assert.equal(event.responseAtMs, RESPONSE); assert.equal(event.emittedAtMs, RESPONSE); assert.equal(event.dueAtMs, DUE); assert.equal(event.delayMs, 65);
  assert.equal(event.schedulingVersion, 'audio-clock-v1');
  assert.equal(event.lightingState, 'emergency-on'); assert.equal(event.cooldownMs, 150000); assert.equal(event.claimsSharedBudget, true);
  assert.deepEqual(event.origin, position(1)); assert.equal(event.sourceHeight, 1.1 * 1.03);
  for (let n = 1; n <= 20; n++) assert.equal(director.observe(input(DUE + n, frameAt(DUE + n, { cause: 'absence' }))), null);
  assert.equal(director.inspect().emitted, 1);
});
test('all study conditions claim identical voluntary response, timing, identity and budget', () => {
  const results = APPARITION_APPLAUSE.conditions.map((condition) => {
    const director = createApparitionApplauseDirector({ runId: 'same-visual-seed', condition }); warm(director); arm(director);
    const event = finish(director); assert.equal(event.variant, condition); assert.equal(director.inspect().emitted, 1);
    const { variant, ...comparable } = event; return comparable;
  });
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
});
test('watching still through red, dark and the next pulse stays silent and expires', () => {
  const director = createApparitionApplauseDirector(); warm(director); arm(director);
  for (let now = ARM + 100; now <= ARM + 3300; now += 100)
    assert.equal(director.observe(input(now, frameAt(now, { cause: 'absence' }))), null);
  assert.equal(director.inspect().emitted, 0); assert.equal(director.inspect().pending, null);
  assert.equal(director.inspect().lastCancellation, 'response-expired');
});
test('deliberate retreat answers without turning; sidesteps and approach do not', () => {
  const director = createApparitionApplauseDirector(); warm(director); arm(director);
  const retreat = { listener: { ...LISTENER, y: LISTENER.y + .8 }, voluntaryMove: true };
  const event = director.observe(input(ARM + 100, frameAt(ARM + 100), retreat));
  assert.equal(event.response, 'retreat'); assert.equal(event.responseAtMs, ARM + 100); assert.deepEqual(event.origin, position(1));
  assert.equal(event.dueAtMs, ARM + 165);
  for (const listener of [{ ...LISTENER, x: LISTENER.x + .8 }, { ...LISTENER, y: LISTENER.y - .8 }]) {
    const other = createApparitionApplauseDirector(); warm(other); arm(other);
    assert.equal(other.observe(input(ARM + 100, frameAt(ARM + 100), { listener, voluntaryMove: true })), null);
    assert.equal(other.inspect().pending.dueAtMs, null);
  }
});
test('pose changes need real input; look-away needs net turn, off-axis bearing and a stable60ms hold', () => {
  for (const options of [{ listener: { ...LISTENER, yaw: Math.PI / 2 } },
    { listener: { ...LISTENER, yaw: .4 }, voluntaryLook: true },
    { listener: { ...LISTENER, yaw: Math.PI / 4 }, voluntaryLook: true },
    { listener: { ...LISTENER, y: LISTENER.y + .8 } }, { listener: { ...LISTENER, y: LISTENER.y + .4 }, voluntaryMove: true }]) {
    const director = createApparitionApplauseDirector(); warm(director); arm(director);
    director.observe(input(ARM + 100, frameAt(ARM + 100), options));
    director.observe(input(ARM + 200, frameAt(ARM + 200), options));
    assert.equal(director.inspect().pending.dueAtMs, null);
  }
  const jitter = createApparitionApplauseDirector(); warm(jitter); arm(jitter);
  jitter.observe(input(ARM + 100, frameAt(ARM + 100), { listener: { ...LISTENER, yaw: Math.PI / 2 }, voluntaryLook: true }));
  jitter.observe(input(ARM + 159, frameAt(ARM + 159))); assert.equal(jitter.inspect().pending.dueAtMs, null);
  const smallNet = createApparitionApplauseDirector(), angledStart = { ...LISTENER, yaw: .55 };
  warm(smallNet, { options: { listener: angledStart } }); arm(smallNet, { options: { listener: angledStart } });
  const angledEnd = { listener: { ...LISTENER, yaw: 1.11 }, voluntaryLook: true };
  smallNet.observe(input(ARM + 100, frameAt(ARM + 100), angledEnd));
  smallNet.observe(input(ARM + 200, frameAt(ARM + 200), angledEnd));
  assert.equal(smallNet.inspect().pending.dueAtMs, null, 'off-axis bearing alone cannot replace at least37degrees of voluntary net turn');
});
test('pending answer survives a real Hall hero-lamp switch while leaving the Hall cancels', () => {
  const director = createApparitionApplauseDirector(); warm(director); arm(director);
  const event = finish(director, { changeFrame(frame) {
    frame.lightId = 'hall-galleria-east-foot'; frame.director.stageKey = 'hall:hall:other'; frame.composition.id = 'procedural'; frame.instances = [];
  } });
  assert.equal(event.lightId, LIGHT); assert.equal(event.stageKey, STAGE); assert.deepEqual(event.origin, position(1));
  const leaving = createApparitionApplauseDirector(); warm(leaving); arm(leaving);
  assert.equal(finish(leaving, { options: { inEncounter: false } }), null); assert.equal(leaving.inspect().pending, null);
});
test('substitution and hard reveals retain the old witnessed pose without mutating submitted figures', () => {
  for (const cause of ['substitution', 'hard']) {
    const director = createApparitionApplauseDirector(); warm(director); arm(director, { cause });
    const frame = frameAt(ARM + 100, { cause }), before = structuredClone(frame);
    Object.freeze(frame.instances); Object.freeze(frame.director); Object.freeze(frame);
    const looking = { listener: { ...LISTENER, yaw: Math.PI / 2 }, voluntaryLook: true };
    director.observe(input(ARM + 100, frame, looking));
    const event = director.observe(input(RESPONSE, frame, looking));
    assert.equal(event.cause, cause); assert.equal(event.poseId, 'neutral'); assert.deepEqual(event.origin, position(1));
    assert.deepEqual(frame, before); assert.equal(Object.hasOwn(event, 'poses'), false);
  }
});
test('red, off and unlit allow the same response; darkness alone cannot invent a witnessed change', () => {
  for (const state of ['emergency-on', 'emergency-off', 'unlit']) {
    const director = createApparitionApplauseDirector(); warm(director); arm(director);
    assert.equal(finish(director, { state }).lightingState, state);
  }
  const noRed = createApparitionApplauseDirector(); warm(noRed, { frameOptions: { lightingState: 'unlit' } });
  assert.equal(arm(noRed, { frameOptions: { lightingState: 'unlit' } }), null); assert.equal(finish(noRed, { state: 'unlit' }), null);
});
test('submission and remembered bodies cannot replace current station visibility, facing and witnessed identity', () => {
  for (const options of [{ observed: false }, { observedIndices: undefined }, { witnessPointVisible: false },
    { witnessPointVisible: undefined }, { listener: { ...LISTENER, yaw: 1 } }]) {
    const director = createApparitionApplauseDirector(); warm(director, { options }); assert.equal(arm(director, { options }), null);
    assert.equal(finish(director), null);
  }
  for (const cause of ['absence', 'substitution', 'hard']) {
    const director = createApparitionApplauseDirector(); warm(director, { options: { observedIndices: [0] } });
    assert.equal(arm(director, { cause, options: { observedIndices: [0] } }), null);
  }
  const unseen = createApparitionApplauseDirector(); warm(unseen);
  assert.equal(arm(unseen, { cause: 'substitution', options: { observedIndices: [0] } }), null);
});
test('only the existing authored Hall formation can arm, even if another room borrows the fitting', () => {
  for (const change of [(frame) => { frame.composition.id = 'foyer-threshold-group'; },
    (frame) => { frame.lightId = 'academic-emergency-west'; }, (frame) => { frame.contract.effectsMode = 'reduced'; }]) {
    const director = createApparitionApplauseDirector(); warm(director);
    const frame = frameAt(ARM, { cause: 'absence' }); change(frame);
    assert.equal(director.observe(input(ARM, frame)), null); assert.equal(director.inspect().pending, null);
  }
});
test('occupation, accessibility and lifecycle blocks cancel without replay', () => {
  for (const options of [{ active: false }, { enabled: false }, { suppressed: true }, { paused: true },
    { hidden: true }, { focused: false }, { recording: true }, { listening: true }, { modal: true }, { battle: true },
    { reduceDread: true }, { effectsMode: 'reduced' }, { effectsMode: 'off' }, { inEncounter: false }, { listener: null }]) {
    const director = createApparitionApplauseDirector(); warm(director); arm(director);
    assert.equal(finish(director, { options }), null, JSON.stringify(options)); assert.equal(director.inspect().pending, null);
    assert.equal(director.observe(input(DUE + 10, frameAt(DUE + 10, { cause: 'absence' }))), null);
    assert.equal(director.inspect().emitted, 0);
  }
});
test('budget must allow arming and qualification; denied cues are consumed rather than queued', () => {
  for (const deniedAt of ['arm', 'response']) {
    const director = createApparitionApplauseDirector(); warm(director); arm(director, { options: { budgetReady: deniedAt !== 'arm' } });
    assert.equal(finish(director, { options: { budgetReady: false } }), null);
    assert.equal(director.observe(input(DUE + 10, frameAt(DUE + 10, { cause: 'absence' }))), null);
    assert.equal(director.inspect().pending, null);
  }
});
test('teleports, prequalification hitches, invalid clocks and cancellation cannot produce deferred answers', () => {
  for (const action of [(director) => director.cancel('test'),
    (director) => director.observe(input(ARM + 501, frameAt(ARM + 501))),
    (director) => director.observe(input(ARM - 100, frameAt(ARM - 100))),
    (director) => director.observe(input(NaN, frameAt(ARM))),
    (director) => director.observe(input(ARM + 50, frameAt(ARM + 50), { listener: { ...LISTENER, y: 60 }, voluntaryMove: true }))]) {
    const director = createApparitionApplauseDirector(); warm(director); arm(director); action(director); assert.equal(finish(director), null);
  }
});

test('the observed retreat timing hands off immediately and does not wait for a200ms next visual frame', () => {
  const director = createApparitionApplauseDirector(); warm(director); arm(director);
  const first = { listener: { ...LISTENER, y: LISTENER.y + .5 }, voluntaryMove: true };
  assert.equal(director.observe(input(ARM + 100, frameAt(ARM + 100), first)), null);
  const second = { listener: { ...LISTENER, y: LISTENER.y + 1 }, voluntaryMove: true };
  const qualifiedAt = ARM + 190;
  const event = director.observe(input(qualifiedAt, frameAt(qualifiedAt), second));
  assert.equal(event.response, 'retreat'); assert.equal(event.emittedAtMs, qualifiedAt);
  assert.equal(event.dueAtMs, qualifiedAt + 65);
  assert.equal(director.inspect().emitted, 1); assert.equal(director.inspect().pending, null);
  assert.equal(director.observe(input(qualifiedAt + 212, frameAt(qualifiedAt + 212), second)), null);
  assert.equal(director.inspect().emitted, 1, 'the following slow frame cannot revoke or replay an already handed-off answer');
});
test('snapshots are detached and one response survives cooldown until an explicit reset', () => {
  const director = createApparitionApplauseDirector({ runId: 'first' }); warm(director);
  director.inspect().witnessedStations.find((value) => value.index === 1).origin.x = 9999;
  arm(director); const pending = director.inspect().pending; pending.origin.x = 9999; pending.listenerAtArm.y = 9999;
  assert.deepEqual(director.inspect().pending.origin, position(1)); assert.deepEqual(director.inspect().pending.listenerAtArm, LISTENER);
  assert.ok(finish(director)); const base = PERIOD * 70; warm(director, { base }); arm(director, { base });
  assert.equal(finish(director, { base }), null); assert.equal(director.inspect().emitted, 1);
  director.reset({ runId: 'second', condition: 'silent' }); warm(director); arm(director);
  const next = finish(director); assert.equal(next.variant, 'silent'); assert.match(next.id, /second/);
});
test('actual Hall placement can answer a witnessed absence without a new actor', () => {
  const visual = createApparitionDirector({ seed: 'applause-real-stage' }), audio = createApparitionApplauseDirector({ runId: 'real-stage' });
  const makeFrame = (nowMs) => {
    const blink = emergencyBlinkState(LIGHT, nowMs / 1000);
    return buildEmergencyShadowFrame([{ id: LIGHT, kind: 'emergency', x: 98.75, y: 2.83, z: 8,
      floorY: 0, zone: ZONE.hall, intensity: blink.scale * 3.6, shadowReveal: blink.shadowReveal, pulseIndex: blink.pulseIndex }], {
      listener: { x: 105, y: 0, z: 8 }, viewYaw: -Math.PI / 2, timeSec: nowMs / 1000,
      effectsMode: 'full', stageKey: 'hall:hall', director: visual, renderGroup: 'hall', torchOn: true,
    });
  };
  const listener = { x: 105, y: 8, yaw: -Math.PI / 2 }; let oldStation;
  for (let now = 0; now < ARM; now += 100) {
    const frame = makeFrame(now);
    if (frame.lightingState === 'emergency-on') oldStation = frame.instances.find((instance) => instance.apparitionIndex === 1);
    assert.equal(audio.observe(input(now, frame, { listener })), null);
  }
  visual.forceNext({ card: 'absence', index: 1 }); audio.observe(input(ARM, makeFrame(ARM), { listener }));
  const looking = { listener: { ...listener, yaw: 0 }, voluntaryLook: true };
  audio.observe(input(ARM + 100, makeFrame(ARM + 100), looking));
  const event = audio.observe(input(RESPONSE, makeFrame(RESPONSE), looking));
  assert.ok(event); assert.equal(event.cause, 'absence'); assert.equal(event.response, 'look-away');
  assert.deepEqual(event.origin, { x: oldStation.x, y: oldStation.y, z: oldStation.z });
});
