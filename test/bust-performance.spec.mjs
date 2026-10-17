import assert from 'node:assert/strict';
import {
  BUST_PERFORMANCE_CUES,
  BUST_PERFORMANCE_LIMITS,
  advanceBustPerformance,
  beginBustRecognition,
  beginBustRitual,
  createBustPerformanceState,
  describeBustPerformance,
  normalizeBustPerformanceState,
  settleBustPerformance,
} from '../src/game/bust-performance.js';

const fresh = createBustPerformanceState();
assert.equal(describeBustPerformance(fresh).clip, 'blind');
assert.equal(describeBustPerformance(fresh).eyesVisible, false);
assert.equal(describeBustPerformance(fresh).blocksMovement, false);
assert.deepEqual(fresh.cueReceipts, []);

for (const evidence of ['returned', 'carried']) {
  let { state, started } = beginBustRecognition(fresh, evidence);
  assert.equal(started, true);
  assert.equal(describeBustPerformance(state).clip, `recognition-${evidence}`);
  assert.equal(describeBustPerformance(state).eyesVisible, evidence === 'returned');
  assert.equal(state.ritual.committed, false, 'recognition cannot accept the route');
  const original = structuredClone(state);
  let result = advanceBustPerformance(state, 2);
  assert.deepEqual(state, original, 'the controller never mutates its input');
  state = result.state;
  assert.equal(state.recognition.time, 2);
  assert.equal(normalizeBustPerformanceState(state).recognition.status, 'playing', 'reducer normalization preserves a live event');
  const beforePause = structuredClone(state);
  for (const options of [{ paused: true }, { hidden: true }]) {
    const frozen = advanceBustPerformance(state, 900, options);
    assert.deepEqual(frozen.state, beforePause);
    assert.deepEqual(frozen.cues, []);
    assert.equal(frozen.changed, false);
  }
  const restored = createBustPerformanceState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.recognition.status, 'settled');
  assert.equal(restored.recognition.time, 10);
  assert.equal(advanceBustPerformance(restored, 20).cues.length, 0, 'reload consumes interrupted event effects');
  assert.equal(beginBustRecognition(restored, evidence).started, false, 'repeat audience cannot replay recognition');
  result = advanceBustPerformance(state, 20);
  state = result.state;
  assert.equal(state.recognition.status, 'settled');
  const allCues = [...advanceBustPerformance(original, 2).cues, ...result.cues];
  assert.deepEqual(allCues.map(cue => cue.id), BUST_PERFORMANCE_CUES[evidence].map(cue => cue.id));
  assert.equal(new Set(allCues.map(cue => cue.receipt)).size, allCues.length, 'each semantic sound has a durable unique receipt');
  assert.deepEqual(advanceBustPerformance(state, 1).cues, []);
}

const none = beginBustRecognition(fresh, 'none').state;
assert.equal(none.recognition.status, 'settled');
assert.equal(describeBustPerformance(none).clip, 'blind');
const blindFrame = advanceBustPerformance(none, 10, { inAudience: true, gaze: { yaw: 1, pitch: .7 } }).frame;
assert.equal(blindFrame.clip, 'blind');
assert.deepEqual(blindFrame.joints, describeBustPerformance(fresh).joints, 'no-eye voice never acquires invisible motion');
assert.equal(beginBustRitual(none).started, false, 'ineligible voice-only audience cannot begin initiation');

let recognized = advanceBustPerformance(beginBustRecognition(fresh, 'returned').state, 10).state;
const target = { inAudience: true, gaze: { yaw: .3, pitch: .18, distance: 8 } };
let gaze = advanceBustPerformance(recognized, .1, target);
assert.equal(gaze.state.gaze.headYaw, 0, 'eyes take a new fixation before the neck');
assert.ok(gaze.state.gaze.eyeLYaw > 0);
assert.ok(gaze.state.gaze.eyeRYaw > 0);
gaze = advanceBustPerformance(gaze.state, .5, target);
assert.ok(gaze.state.gaze.headYaw > 0, 'head begins after the eye acquisition interval');
assert.ok(gaze.state.gaze.eyeLYaw > gaze.state.gaze.eyeRYaw, 'the eyes converge independently');
const held = advanceBustPerformance(gaze.state, 100, { inAudience: false, gaze: { yaw: -2, pitch: -1 } });
assert.equal(held.state.gaze.headYaw, gaze.state.gaze.headYaw, 'leaving the audience stops neck pursuit');
assert.equal(held.state.gaze.eyeLYaw, gaze.state.gaze.eyeLYaw, 'leaving the audience stops eye pursuit');
assert.equal(held.state.gaze.following, false);
for (let i = 0; i < 100; i++) gaze = advanceBustPerformance(gaze.state, .1, { inAudience: true, gaze: { yaw: 2, pitch: 1, distance: .1 } });
assert.ok(Math.abs(gaze.state.gaze.headYaw) <= BUST_PERFORMANCE_LIMITS.headYaw);
assert.ok(Math.abs(gaze.state.gaze.headPitch) <= BUST_PERFORMANCE_LIMITS.headPitch);
for (const key of ['eyeLYaw', 'eyeRYaw']) assert.ok(Math.abs(gaze.state.gaze[key]) <= BUST_PERFORMANCE_LIMITS.eyeYaw);
for (const key of ['eyeLPitch', 'eyeRPitch']) assert.ok(Math.abs(gaze.state.gaze[key]) <= BUST_PERFORMANCE_LIMITS.eyePitch);

let carried = advanceBustPerformance(beginBustRecognition(fresh, 'carried').state, 10).state;
carried = advanceBustPerformance(carried, 1, { inAudience: true, gaze: { yaw: .8, pitch: 0 }, bag: { yaw: -.3, pitch: .2 } }).state;
assert.ok(carried.gaze.headYaw < 0, 'the carried branch listens toward the case rather than the player face');
assert.equal(carried.gaze.eyeLYaw, 0);
assert.equal(describeBustPerformance(carried).eyesVisible, false);

const consent = beginBustRitual(recognized, { evidence: 'returned' });
assert.equal(consent.started, true);
assert.equal(consent.routeOpen, true);
assert.equal(consent.state.ritual.time, 0);
assert.equal(describeBustPerformance(consent.state).routeOpen, true, 'the road is open on the consent frame');
assert.equal(describeBustPerformance(consent.state).blocksMovement, false, 'ceremony never becomes a movement gate');
let ceremony = advanceBustPerformance(consent.state, 2, target);
assert.equal(ceremony.frame.clip, 'ritual');
assert.equal(ceremony.frame.time, 2);
assert.equal(ceremony.state.gaze.headYaw, 0, 'authored ritual owns its joints without gaze interference');
assert.equal(ceremony.cues[0].id, 'seal-contact');
const ceremonySaved = JSON.parse(JSON.stringify(ceremony.state));
const ceremonyRestored = createBustPerformanceState(ceremonySaved);
assert.equal(ceremonyRestored.ritual.time, 5);
assert.equal(describeBustPerformance(ceremonyRestored).clip, 'settled');
assert.equal(describeBustPerformance(ceremonyRestored).routeOpen, true);
assert.deepEqual(advanceBustPerformance(ceremonyRestored, 200).cues, []);
assert.equal(beginBustRitual(ceremonyRestored, { evidence: 'returned' }).started, false, 'repeat consent cannot replay initiation');
ceremony = advanceBustPerformance(ceremony.state, 3, target);
assert.equal(ceremony.frame.clip, 'settled');
assert.equal(ceremony.state.ritual.status, 'settled');
assert.deepEqual(advanceBustPerformance(ceremony.state, 1).cues, []);
assert.equal(fresh.evidence, 'none', 'no eye ownership is modified by initiation');

const interruptedRecognition = advanceBustPerformance(beginBustRecognition(fresh, 'carried').state, 1).state;
const earlyConsent = beginBustRitual(interruptedRecognition, { evidence: 'carried' }).state;
assert.equal(earlyConsent.recognition.status, 'settled');
assert.equal(earlyConsent.ritual.status, 'playing');
assert.ok(advanceBustPerformance(earlyConsent, 5).cues.every(cue => cue.phase === 'ritual'), 'a cut recognition cannot emit late effects during ritual');

const reduced = advanceBustPerformance(beginBustRecognition(fresh, 'returned').state, .01, { reducedMotion: true, ...target });
assert.equal(reduced.state.recognition.status, 'settled');
assert.ok(reduced.cues.length <= 1, 'reduced motion avoids a burst of compressed mechanical sounds');
assert.equal(reduced.state.gaze.headYaw, 0);
assert.equal(reduced.state.gaze.eyeLYaw, 0);
assert.equal(advanceBustPerformance(reduced.state, 10, { reducedMotion: true, ...target }).state.gaze.following, false);
const skipped = settleBustPerformance(beginBustRecognition(fresh, 'returned').state);
assert.equal(skipped.recognition.status, 'settled');
assert.equal(skipped.ritual.committed, false, 'skip never manufactures consent');

const legacy = createBustPerformanceState({}, { recognized: true, accepted: true, evidence: 'returned' });
assert.equal(legacy.recognition.status, 'settled');
assert.equal(legacy.ritual.status, 'settled');
assert.deepEqual(advanceBustPerformance(legacy, 100).cues, []);
assert.equal(describeBustPerformance(legacy).eyesVisible, true);
const normalizedLegacy = createBustPerformanceState(normalizeBustPerformanceState(), { recognized: true, committed: true, evidence: 'returned' });
assert.equal(normalizedLegacy.evidence, 'returned', 'normalizing a missing performance does not hide profile evidence during hydration');
assert.equal(normalizedLegacy.recognition.evidence, 'returned');
assert.equal(describeBustPerformance(normalizedLegacy).eyesVisible, true);
assert.deepEqual(advanceBustPerformance(normalizedLegacy, 100).cues, []);
assert.equal(advanceBustPerformance(fresh, 100).changed, false, 'an unused blind performance does not dirty the save each frame');
const oneLongStep = advanceBustPerformance(beginBustRecognition(fresh, 'returned').state, 20).state;
let dividedSteps = beginBustRecognition(fresh, 'returned').state;
for (let i = 0; i < 200; i++) dividedSteps = advanceBustPerformance(dividedSteps, .1).state;
assert.ok(Math.abs(oneLongStep.sceneTime - dividedSteps.sceneTime) < 1e-8, 'performance scene time measures authored event time consistently across frame partitions');
const forgedPhase = normalizeBustPerformanceState({ ritual: { status: 'playing', time: 2 } });
assert.equal(forgedPhase.ritual.committed, false, 'animation state does not manufacture a route outcome');
const normalized = normalizeBustPerformanceState({ sceneTime: Infinity, gaze: { headYaw: 100, eyeLPitch: NaN }, cueReceipts: ['unknown'], recognition: { time: -4 } });
assert.ok(Number.isFinite(normalized.sceneTime));
assert.equal(normalized.gaze.headYaw, BUST_PERFORMANCE_LIMITS.headYaw);
assert.equal(normalized.gaze.eyeLPitch, 0);
assert.deepEqual(normalized.cueReceipts, []);

console.log('bust performance tests ok');
