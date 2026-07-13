import assert from 'node:assert/strict';
import { emitAcousticEvent, resetAcousticEventsForTest, setAcousticClock } from '../src/audio/acoustic-events.js';
import { createHushAudioRuntime } from '../src/game/hush-audio-runtime.js';

resetAcousticEventsForTest();
let now = 1000;
setAcousticClock(() => now);
let offered = [];
let applied = [];
let played = [];
const presenceState = { active: true, position: { x: 10, y: 0 }, roomId: 'a', floorId: 'g', hasTarget: false };
const effects = {
  applyField(field, settings, options) { applied.push({ field, settings, options }); },
  maybeResidue() { return false; },
  playMischief(cue, options) { played.push({ cue, options }); return true; },
  reset() {},
};

const runtime = createHushAudioRuntime({
  presence: {
    publicSnapshot: () => ({ ...presenceState }),
    offerSoundTarget: (target) => { offered.push(target); return true; },
  },
  playerSpatial: () => ({ position: { x: 0, y: 0 }, roomId: 'a', floorId: 'g' }),
  difficulty: () => ({ values: { presencePressure: 'standard' } }),
  settings: () => ({ monitorGain: .3 }),
  context: () => ({ allowMischief: true, monitorOpen: true }),
  effects,
  clock: () => now,
  random: () => .05,
});

emitAcousticEvent({
  kind: 'radio_squelch',
  source: { kind: 'equipment', id: 'radio' },
  spatial: { roomId: 'a', floorId: 'g', position: { x: 0, y: 0 } },
});
assert.ok(offered.length >= 1);
assert.ok(runtime.snapshot().audition.interest > 0);
const heardInterest = runtime.currentAudition().interest;

emitAcousticEvent({
  kind: 'instrument_note',
  source: { kind: 'hush', id: 'hush' },
  spatial: { roomId: 'a', floorId: 'g', position: { x: 1, y: 0 } },
  semantics: { audibleToHush: false, playerGenerated: false },
});
assert.equal(runtime.currentAudition().interest, heardInterest, 'HUSH-created cues must not recursively alert it');

runtime.tick(.016);
assert.ok(applied.length >= 1);
assert.equal(applied.at(-1).options.monitorGain, .3);
assert.ok(runtime.snapshot().field.active);

const before = runtime.snapshot().audition.interest;
now += 20000;
runtime.tick(20);
assert.ok(runtime.snapshot().audition.interest < before);

const saved = runtime.save();
assert.equal(saved.schema, 1);
assert.equal(Array.isArray(saved.audition.noiseMemory), true);
runtime.destroy();

// The most severe sensory vacuum is deliberately time-bounded. Remaining in
// contact holds an engulf field rather than an indefinite near-mute.
const closePresence = { active: true, position: { x: .1, y: 0 }, roomId: 'a', floorId: 'g', hasTarget: true };
const closeRuntime = createHushAudioRuntime({
  presence: { publicSnapshot: () => ({ ...closePresence }), offerSoundTarget: () => true },
  playerSpatial: () => ({ position: { x: 0, y: 0 }, roomId: 'a', floorId: 'g' }),
  difficulty: () => ({ values: { presencePressure: 'standard' } }),
  settings: () => ({}),
  context: () => ({ allowMischief: false, monitorOpen: true }),
  effects,
  clock: () => now,
  random: () => 1,
});
closeRuntime.tick(.016);
assert.equal(closeRuntime.snapshot().field.stage, 'contact');
now += 1400;
closeRuntime.tick(1.4);
assert.equal(closeRuntime.snapshot().field.stage, 'engulf');
assert.ok(closeRuntime.snapshot().field.absorption.monitor < .92);
closeRuntime.destroy();

console.log('hush audio runtime tests ok');
