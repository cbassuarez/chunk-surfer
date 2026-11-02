import assert from 'node:assert/strict';
import test from 'node:test';
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

const offeredBeforeRegular=offered.length;
emitAcousticEvent({
  kind:'footstep_walk',
  source:{kind:'player',id:'player'},
  spatial:{roomId:'a',floorId:'g',position:{x:9,y:0}},
  semantics:{audibleToHush:true,playerGenerated:true},
});
assert.equal(offered.length,offeredBeforeRegular,'normal-band player noise does not offer a location');

emitAcousticEvent({
  kind:'bag_rummage',
  source:{kind:'player',id:'player'},
  spatial:{roomId:'a',floorId:'g',position:{x:9,y:0}},
  semantics:{audibleToHush:true,playerGenerated:true},
});
assert.equal(offered.length,offeredBeforeRegular,'player noise is targeted once by the field-monitor authority');
const playerInterest=runtime.currentAudition().interest;
assert.ok(playerInterest>heardInterest,'propagated player noise still informs the sensory audition');

emitAcousticEvent({
  kind: 'instrument_note',
  source: { kind: 'hush', id: 'hush' },
  spatial: { roomId: 'a', floorId: 'g', position: { x: 1, y: 0 } },
  semantics: { audibleToHush: false, playerGenerated: false },
});
assert.equal(runtime.currentAudition().interest, playerInterest, 'HUSH-created cues must not recursively alert it');

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
  context: () => ({ allowMischief: false, monitorOpen: true, presentationGain: 0 }),
  effects,
  clock: () => now,
  random: () => 1,
});
closeRuntime.tick(.016);
assert.equal(closeRuntime.snapshot().field.stage, 'contact');
const rawCloseField=closeRuntime.currentField();
const quietCloseField=applied.at(-1).field;
assert.ok(rawCloseField.absorption.audio>0&&rawCloseField.absorption.monitor>0,
  'the raw HUSH field must survive a presentation release');
assert.equal(quietCloseField.absorption.audio,0);
assert.equal(quietCloseField.absorption.monitor,0);
assert.equal(quietCloseField.absorption.light,rawCloseField.absorption.light,
  'silencing Source audio must not decide whether Pressure is optically present');
now += 1400;
closeRuntime.tick(1.4);
assert.equal(closeRuntime.snapshot().field.stage, 'engulf');
assert.ok(closeRuntime.snapshot().field.absorption.monitor < .92);
closeRuntime.destroy();

test('instrument HOLD discards real acoustic events before propagation and memory, while live field and resumed events remain authoritative',()=>{
  let held=false,propagations=0,at=50000,player={x:0,y:0};const targets=[],heard=[],fields=[];
  const runtime=createHushAudioRuntime({
    presence:{publicSnapshot:()=>({active:true,position:{x:10,y:0},roomId:'hold-room',floorId:'g',hasTarget:false}),
      offerSoundTarget:target=>{targets.push(target);return true;}},
    playerSpatial:()=>({position:player,roomId:'hold-room',floorId:'g'}),
    occlusionDb:()=>{propagations++;return 0;},
    context:()=>({instrumentHold:held,allowMischief:false,monitorOpen:true}),clock:()=>at,random:()=>1,
    effects:{applyField:field=>fields.push(field),maybeResidue:()=>false},onHeard:event=>heard.push(event),
  });
  const emit=(id,playerGenerated=false)=>emitAcousticEvent({id,kind:playerGenerated?'footstep_walk':'radio_squelch',
    source:{kind:playerGenerated?'player':'equipment',id:playerGenerated?'player':'radio'},
    spatial:{roomId:'hold-room',floorId:'g',position:{x:9,y:0}},
    acoustic:{levelDb:-8,durationMs:400},semantics:{audibleToHush:true,playerGenerated,canBeMimicked:true}});
  try{
    emit('before-instrument-hold');runtime.tick(0);
    assert.equal(targets.length,1);assert.equal(heard.length,1);assert.ok(runtime.currentAudition().interest>0);
    const before=runtime.snapshot(),beforePropagation=propagations,beforeFields=fields.length;
    held=true;emit('held-permitted-footstep',true);emit('held-equipment-sound');
    assert.equal(propagations,beforePropagation,'held events never reach propagation');
    assert.deepEqual(runtime.snapshot(),before,'preexisting audition, last event, propagation and intent are preserved');
    assert.equal(targets.length,1);assert.equal(heard.length,1);
    player={x:9,y:0};runtime.tick(0);
    assert.equal(fields.length,beforeFields+1,'the physical field continues to render/mix during HOLD');
    assert.ok(runtime.currentField().absorption.monitor>before.field.absorption.monitor);
    assert.deepEqual(runtime.currentAudition(),before.audition,'field observation neither erases nor augments earlier memory');
    held=false;at+=1000;const offersBeforeResume=targets.length,heardBeforeResume=heard.length;
    runtime.tick(0);assert.equal(targets.length,offersBeforeResume);assert.equal(heard.length,heardBeforeResume,'discarded events are never delivered on resume');
    emit('after-instrument-resume');assert.equal(targets.length,offersBeforeResume+1);assert.equal(heard.length,heardBeforeResume+1);
    const ids=runtime.currentAudition().noiseMemory.map(row=>row.eventId);
    assert.ok(ids.includes('before-instrument-hold')&&ids.includes('after-instrument-resume'));
    assert.ok(!ids.includes('held-permitted-footstep')&&!ids.includes('held-equipment-sound'));
  }finally{runtime.destroy();}
});

console.log('hush audio runtime tests ok');
