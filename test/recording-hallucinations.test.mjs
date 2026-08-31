import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRecordingHallucinationDirector,
  recordingHallucinationEligibility,
  recordingHallucinationVisualFrame,
} from '../src/game/recording-hallucinations.js';
import { APPARITION_POSE_IDS } from '../src/game/apparition-director.js';

test('recording hallucinations require recording darkness and quiet', () => {
  assert.equal(recordingHallucinationEligibility({
    recording: false,
    darkness: 1,
    effectiveMicRms: 0,
    takeProgress: 0.5,
    hushPressure: 0.7,
  }).eligible, false);

  assert.equal(recordingHallucinationEligibility({
    recording: true,
    lightOn: true,
    darkness: 0,
    effectiveMicRms: 0,
    takeProgress: 0.5,
    hushPressure: 0.7,
  }).eligible, false);

  assert.equal(recordingHallucinationEligibility({
    recording: true,
    lightOn: false,
    darkness: 1,
    effectiveMicRms: 0.2,
    spoilThreshold: 0.06,
    takeProgress: 0.5,
    hushPressure: 0.7,
  }).eligible, false);

  assert.equal(recordingHallucinationEligibility({
    recording: true,
    lightOn: false,
    darkness: 1,
    effectiveMicRms: 0,
    spoilThreshold: 0.06,
    takeProgress: 0.5,
    hushPressure: 0.7,
  }).eligible, true);
});

test('recording hallucination director starts, holds, expires, and cools down', () => {
  const d = createRecordingHallucinationDirector({ seed: 'test' });
  const base = {
    recording: true,
    lightOn: false,
    darkness: 1,
    effectiveMicRms: 0,
    spoilThreshold: 0.06,
    takeProgress: 0.5,
    hushPressure: 0.8,
    effectsMode: 'full',
    reduceDread: false,
  };

  const first = d.tick({ ...base, nowMs: 1000 });
  assert.equal(first.started, true);
  assert.ok(first.active);
  assert.ok(first.active.expiresAtMs - first.active.startedAtMs >= 1900,
    'the live compositor gets long enough to resolve the hallucination');
  assert.ok(first.active.visual.figureCount >= 1 && first.active.visual.figureCount <= 3);
  assert.equal(first.active.visual.poseIds.length, first.active.visual.figureCount);
  assert.ok(first.active.visual.poseIds.every((poseId) => APPARITION_POSE_IDS.includes(poseId)));

  const held = d.tick({ ...base, nowMs: 1100 });
  assert.equal(held.started, false);
  assert.equal(held.active.id, first.active.id);

  const expired = d.tick({ ...base, nowMs: first.active.expiresAtMs + 1 });
  assert.equal(expired.started, false);
});

test('forced review variants are deterministic bounded apparition arrangements', () => {
  for (const [kind, expectedCount] of [['peripheral', 1], ['doorway', 2], ['apparition-return', 3], ['hard', 3]]) {
    const a = createRecordingHallucinationDirector({ seed: `review:${kind}` });
    const b = createRecordingHallucinationDirector({ seed: `review:${kind}` });
    const first = a.force(kind, { nowMs: 500, intensity: .8 });
    const second = b.force(kind, { nowMs: 500, intensity: .8 });
    assert.deepEqual(first, second);
    assert.equal(first.visual.figureCount, expectedCount);
    assert.equal(new Set(first.visual.poseIds).size, expectedCount);
  }
});

test('hallucinations follow a deterministic moving edit path and glitch in place', () => {
  const director=createRecordingHallucinationDirector({seed:'moving-review'});
  const event=director.force('hard',{nowMs:1000,intensity:.9});
  const samples=[1100,1350,1700,2200,2800].map((nowMs)=>recordingHallucinationVisualFrame(event,{nowMs}));
  assert.ok(new Set(samples.map((frame)=>`${frame.offsetX.toFixed(3)}:${frame.offsetY.toFixed(3)}`)).size>3,
    'the figure travels instead of pulsing at one coordinate');
  const editAt=event.startedAtMs+event.visual.motion.cutEveryMs+1;
  const glitch=recordingHallucinationVisualFrame(event,{nowMs:editAt});
  assert.equal(glitch.glitching,true);
  assert.notEqual(glitch.mode,'live');
  const same=recordingHallucinationVisualFrame(event,{nowMs:editAt});
  assert.deepEqual(glitch,same,'movement and cuts are replay-stable');
  const reduced=recordingHallucinationVisualFrame(event,{nowMs:editAt,reducedMotion:true});
  assert.deepEqual(reduced,{
    offsetX:0,offsetY:0,yawJitter:0,scaleX:1,scaleY:1,alpha:1,mode:'live',glitching:false,glitchBeat:0,
  });
});

test('light or accessibility suppression removes an active hallucination immediately', () => {
  const d = createRecordingHallucinationDirector({ seed: 'dark-only' });
  d.force('hard', { nowMs: 1000 });
  const lit = d.tick({
    recording: true, lightOn: true, darkness: 0, takeProgress: .5,
    effectiveMicRms: 0, nowMs: 1100,
  });
  assert.equal(lit.active, null);
  assert.equal(d.inspect().active, null);
});
