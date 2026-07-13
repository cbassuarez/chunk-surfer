import assert from 'node:assert/strict';
import { normalizeAcousticEvent } from '../src/audio/acoustic-events.js';
import { propagateNoise } from '../src/audio/acoustic-propagation.js';
import { freshHushAudition, ingestHeardNoise, tickHushAudition } from '../src/game/hush-audition.js';
import { chooseHushIntent } from '../src/game/hush-director.js';
import { applyFieldPresentationPolicy, computeHushField, effectiveTorchScale, inactiveHushField } from '../src/game/hush-field.js';
import { commitMischiefCue, freshMischiefState, selectMischiefCue } from '../src/game/hush-mischief.js';
import { HUSH_MISCHIEF_CUES } from '../src/data/hush-cues.js';
import { hushAudioPolicyForDifficulty } from '../src/game/hush-sensory-policy.js';

const policy = hushAudioPolicyForDifficulty({ values: { presencePressure: 'standard' } });
const event = normalizeAcousticEvent({
  kind: 'radio_squelch',
  source: { kind: 'equipment', id: 'radio' },
  spatial: { roomId: 'main_b3', floorId: 'b1', position: { x: 2, y: 2 } },
});
const propagation = propagateNoise({ event, listener: { roomId: 'main_b3', floorId: 'b1', position: { x: 7, y: 2 } } });
let audition = freshHushAudition(policy);
audition = ingestHeardNoise(audition, { event, propagation, now: 1000, policy });
assert.ok(audition.interest > 0);
assert.ok(audition.certainty > 0);
assert.ok(audition.agitation > 0);
assert.equal(audition.noiseMemory.length, 1);

const before = audition.interest;
audition = tickHushAudition(audition, 10, policy);
assert.ok(audition.interest < before);

const far = computeHushField({ hush: { active: true, position: { x: 30, y: 0 }, roomId: 'a', floorId: 'g' }, operator: { position: { x: 0, y: 0 }, roomId: 'a', floorId: 'g' }, now: 0 });
const near = computeHushField({ hush: { active: true, position: { x: 2, y: 0 }, roomId: 'a', floorId: 'g' }, operator: { position: { x: 0, y: 0 }, roomId: 'a', floorId: 'g' }, now: 0 });
assert.ok(near.absorption.monitor > far.absorption.monitor);
assert.ok(effectiveTorchScale(near) < effectiveTorchScale(far));
assert.deepEqual(inactiveHushField().absorption, { audio: 0, light: 0, monitor: 0 });

const reduced = applyFieldPresentationPolicy(near, { hushAudioDistortion: 'reduced', hushSilence: 'reduced', hushHiss: 'reduced', hushLightFlicker: 'reduced', hushSuddenCuts: 'softened' });
assert.ok(reduced.presentation.audio < near.absorption.audio);
assert.ok(reduced.presentation.light < near.absorption.light);

const noFlickerLow = applyFieldPresentationPolicy({ ...near, pulse: 0 }, { hushLightFlicker: 'off' });
const noFlickerHigh = applyFieldPresentationPolicy({ ...near, pulse: 1 }, { hushLightFlicker: 'off' });
assert.equal(noFlickerLow.presentation.flicker, 0);
assert.equal(effectiveTorchScale(noFlickerLow), effectiveTorchScale(noFlickerHigh));

const playful = { ...audition, interest: .58, certainty: .5, agitation: .15, playfulness: .82 };
const intent = chooseHushIntent({ audition: playful, field: far, cooldowns: { mischiefReady: true }, narrative: { enabled: true, allowMischief: true }, random: () => .2 });
assert.equal(intent.kind, 'PLAY');

let mischief = freshMischiefState();
const cue = selectMischiefCue({ definitions: HUSH_MISCHIEF_CUES, context: { interest: .6, certainty: .6, agitation: .2, recording: false, blocked: false, finale: false, battle: false }, state: mischief, now: 1000, random: () => .1 });
assert.ok(cue);
mischief = commitMischiefCue(mischief, cue, 1000);
assert.equal(mischief.cueCounts[cue.id], 1);
const immediate = selectMischiefCue({ definitions: [cue], context: { interest: .6, certainty: .6, agitation: .2, recording: false, blocked: false, finale: false, battle: false }, state: mischief, now: 1001, random: () => .1 });
assert.equal(immediate, null);

console.log('hush audio pure tests ok');
