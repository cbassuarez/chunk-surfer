import assert from 'node:assert/strict';
import { normalizeAcousticEvent } from '../src/audio/acoustic-events.js';
import { propagateNoise } from '../src/audio/acoustic-propagation.js';
import { freshHushAudition, ingestHeardNoise, tickHushAudition } from '../src/game/hush-audition.js';
import { chooseHushIntent } from '../src/game/hush-director.js';
import { applyFieldPresentationPolicy, computeHushField, effectiveTorchScale, inactiveHushField } from '../src/game/hush-field.js';
import { commitMischiefCue, freshMischiefState, selectMischiefCue } from '../src/game/hush-mischief.js';
import { HUSH_MISCHIEF_CUES } from '../src/data/hush-cues.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { NOISE } from '../src/config.js';
import * as REC from '../src/game/recordist.js';
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

// ── the dance wing set-piece ────────────────────────────────────────────────
//
// Two cues belong to the sub-basement studios and must not leak. A zoned cue is
// silent everywhere else; the four unzoned ones keep playing everywhere, which
// is the half of this that a careless `zones` check would break.
{
  const loud = { interest: .95, certainty: .95, agitation: .2, recording: false, blocked: false, finale: false, battle: false };
  const reachable = (zone) => {
    const seen = new Set();
    for (let i = 0; i < 3000; i += 1) {
      const cue = selectMischiefCue({ context: { ...loud, zone }, state: freshMischiefState(), now: 0, random: Math.random });
      if (cue) seen.add(cue.id);
    }
    return seen;
  };
  const wingOnly = ['mischief.sprung-answer', 'mischief.mirror-return'];
  const unzoned = HUSH_MISCHIEF_CUES.filter((cue) => !cue.requirements?.zones).map((cue) => cue.id);

  for (const zone of [ZONE.danceStudio, ZONE.studio]) {
    const here = reachable(zone);
    for (const id of wingOnly) assert.ok(here.has(id), `${id} plays in the wing (zone ${zone})`);
  }
  for (const zone of [ZONE.hall, ZONE.natatorium, ZONE.chapel, ZONE.practice]) {
    const here = reachable(zone);
    for (const id of wingOnly) assert.ok(!here.has(id), `${id} stays out of zone ${zone}`);
    for (const id of unzoned) assert.ok(here.has(id), `${id} still plays in zone ${zone}`);
  }
  // An unknown zone must not silently become "the dance wing".
  const nowhere = reachable(null);
  for (const id of wingOnly) assert.ok(!nowhere.has(id), `${id} needs a known room`);
  for (const id of unzoned) assert.ok(nowhere.has(id), `${id} survives an unknown room`);
}

// A SPRUNG FLOOR IS A DRUM. The multiplier scales the footfall only, never the
// noise floor an injury adds — otherwise a limp would compound with the room.
{
  REC.resetRecordist?.();
  const plain = REC.emitStepNoise(0, 0, 1);
  const sprung = REC.emitStepNoise(0, 0, NOISE.sprung);
  assert.ok(sprung > plain, 'maple on battens costs more than concrete');
  assert.ok(Math.abs(sprung / plain - NOISE.sprung) < 1e-9, 'and costs exactly the authored multiplier');
  for (const bad of [0, -3, NaN, null, undefined, 'loud']) {
    assert.equal(REC.emitStepNoise(0, 0, bad), plain, `a ${String(bad)} surface falls back to an ordinary floor`);
  }
}

console.log('hush audio pure tests ok');
