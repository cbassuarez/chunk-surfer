import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createApparitionDirector } from '../src/game/apparition-director.js';
import { buildEmergencyShadowFrame } from '../src/game/emergency-light-runtime.js';

const PERIOD = 2.422;
const directorInput = (pulseIndex, effectsMode = 'full', timeSec = pulseIndex * PERIOD) => ({
  stageKey: 'hall:shadow-only',
  pulseIndex,
  effectsMode,
  timeSec,
  wanderClock: timeSec,
});
const light = (pulseIndex) => ({
  id: 'hall-stage-door-maintained',
  x: 0,
  y: 2.4,
  z: 0,
  floorY: 0,
  intensity: .6,
  shadowReveal: 1,
  pulseIndex,
  zone: 5,
});
const options = (director, pulseIndex) => ({
  listener: { x: -7, z: 0 },
  viewYaw: Math.PI / 2,
  timeSec: pulseIndex * PERIOD,
  effectsMode: 'full',
  stageKey: 'hall:shadow-only',
  renderGroup: 'hall',
  director,
});

const baselineDirector = createApparitionDirector({ seed: 'phase-f-default' });
const baseline = baselineDirector.resolve(directorInput(0));
assert.deepEqual(baseline.shadowOnlyIndices, [], 'shadowOnlyIndices defaults empty');

const peripheralDirector = createApparitionDirector({ seed: 'phase-f-peripheral' });
buildEmergencyShadowFrame([light(0)], options(peripheralDirector, 0));
assert.equal(peripheralDirector.forceNext({ card: 'peripheral', index: 1 }), true);
const peripheral = buildEmergencyShadowFrame([light(1)], options(peripheralDirector, 1));
assert.equal(peripheral.director.card?.kind, 'peripheral');
assert.equal(peripheral.instances.length, 3, 'peripheral retains all three shadow-system figures');
assert.equal(peripheral.contract.visibleBodies, 2);
assert.equal(peripheral.contract.shadowOnlyFigures, 1);
assert.equal(peripheral.contract.shadowOnlyIndices.length, 1);
assert.ok([0, 2].includes(peripheral.contract.shadowOnlyIndices[0]), 'peripheral chooses an edge identity');
assert.equal(peripheral.instances.filter((instance) => instance.shadowOnly).length, 1);
assert.equal(peripheral.apparitionLights.length, 2, 'an invisible body carries no local white practical');
assert.ok(!peripheral.apparitionLights.some((lamp) =>
  lamp.id.endsWith(`:${peripheral.contract.shadowOnlyIndices[0]}`)));

const reducedDirector = createApparitionDirector({ seed: 'phase-f-reduced' });
reducedDirector.resolve(directorInput(0, 'reduced', 0));
reducedDirector.forceNext({ card: 'peripheral', index: 0 });
for (let timeSec = .25; timeSec <= 70; timeSec += .25) {
  const directive = reducedDirector.resolve(directorInput(Math.floor(timeSec / PERIOD), 'reduced', timeSec));
  assert.notEqual(directive.card?.kind, 'peripheral');
  assert.notEqual(directive.card?.kind, 'delayed_reveal');
  assert.deepEqual(directive.shadowOnlyIndices, [], 'Reduced remains continuously body-visible');
}

const delayedDirector = createApparitionDirector({ seed: 'phase-f-delayed' });
const initial = buildEmergencyShadowFrame([light(0)], options(delayedDirector, 0));
assert.equal(delayedDirector.forceNext({ card: 'delayed_reveal', index: 2 }), true);
let pulse = 1;
const shadowFrames = [];
let frame = buildEmergencyShadowFrame([light(pulse)], options(delayedDirector, pulse));
while (frame.director.card?.phase === 'shadow') {
  shadowFrames.push(frame);
  pulse += 1;
  frame = buildEmergencyShadowFrame([light(pulse)], options(delayedDirector, pulse));
}
const reveal = frame;
assert.ok(shadowFrames.length === 1 || shadowFrames.length === 2, 'delay is deterministically one or two beats');
assert.equal(reveal.director.card?.kind, 'delayed_reveal');
assert.equal(reveal.director.card?.phase, 'reveal');
assert.equal(reveal.director.hardRevealIndex, null, 'body reveal is never a hard reveal');
const delayedIndex = reveal.director.card.index;
const shadowBody = shadowFrames[0].instances.find((instance) => instance.apparitionIndex === delayedIndex);
const revealBody = reveal.instances.find((instance) => instance.apparitionIndex === delayedIndex);
assert.ok(shadowBody?.shadowOnly);
assert.equal(revealBody?.shadowOnly, false);
assert.equal(revealBody.apparitionIndex, shadowBody.apparitionIndex, 'delayed reveal retains stable identity');
assert.equal(revealBody.poseId, shadowBody.poseId, 'delayed reveal retains semantic pose');
assert.deepEqual([revealBody.x, revealBody.z], [shadowBody.x, shadowBody.z],
  'the selected motion clock is frozen until the body explains its shadow');
assert.ok(!shadowFrames[0].apparitionLights.some((lamp) => lamp.id.endsWith(`:${delayedIndex}`)));
assert.ok(reveal.apparitionLights.some((lamp) => lamp.id.endsWith(`:${delayedIndex}`)));
assert.ok(pulse > 1, 'the body returns only on a later legal pulse');
const released = buildEmergencyShadowFrame([light(pulse + 1)], options(delayedDirector, pulse + 1));
assert.equal(released.director.card, null, 'delayed reveal releases on the next darkness transition');
assert.equal(released.instances.length, 3);
assert.ok(released.contract.minimumPlayerDistance >= 2.2);
assert.ok(initial.instances.every((instance) => instance.apparitionIndex >= 0 && instance.apparitionIndex < 3));

// A forced hard reveal arriving during the shadow phase is retained and moved
// to the first legal beat after the quiet body reveal, never stacked onto it.
const conflictDirector = createApparitionDirector({ seed: 'phase-f-conflict' });
buildEmergencyShadowFrame([light(0)], options(conflictDirector, 0));
conflictDirector.forceNext({ card: 'delayed_reveal', index: 0 });
let conflictPulse = 1;
let conflict = buildEmergencyShadowFrame([light(conflictPulse)], options(conflictDirector, conflictPulse));
assert.equal(conflict.director.card?.phase, 'shadow');
conflictDirector.forceNext({ presentation: 'hard', index: 0 });
do {
  conflictPulse += 1;
  conflict = buildEmergencyShadowFrame([light(conflictPulse)], options(conflictDirector, conflictPulse));
  assert.equal(conflict.director.card?.kind === 'delayed_reveal' ? conflict.director.hardRevealIndex : null, null);
} while (conflict.director.card?.kind === 'delayed_reveal');
assert.equal(conflict.director.hardRevealIndex, 0, 'deferred hard reveal survives for a later legal beat');

const propsSource = readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
assert.match(propsSource, /if\(!shadow&&i\.shadowOnly\)continue/,
  'shadow-only figures are omitted from the ordinary visible pass');
assert.match(propsSource, /emergencyOnly:\!\!practical&&emergencyShadowInstances\.length>0/,
  'the same figures remain in the isolated emergency shadow pass');
assert.equal(buildEmergencyShadowFrame([light(0)], { ...options(createApparitionDirector(), 0), effectsMode: 'off' }), null);
assert.equal(buildEmergencyShadowFrame([light(0)], { ...options(createApparitionDirector(), 0), enabled: false }), null);

console.log('apparition shadow-only continuity contracts passed');
