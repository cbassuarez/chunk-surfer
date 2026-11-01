import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeElleryNoiseDetector as create,FAKE_ELLERY_NOISE_DEFAULTS as D} from '../src/game/fake-ellery-noise.js';

const reading=(rms,extra={})=>({rms,playerNoiseLikely:rms>.012,gameEchoLikely:false,...extra});
const input=(rms=.006,extra={})=>({dt:1/120,active:true,armed:true,micActive:true,micMaySpoil:true,measurement:reading(rms),...extra});
function feed(detector,seconds,rms=.006,extra={},rate=120){
  let attacks=0;for(let tick=0;tick<Math.round(seconds*rate);tick++)attacks+=Number(detector.sample(input(rms,{dt:1/rate,...extra})));return attacks;
}
function prepared(room=.006){const detector=create();feed(detector,D.baselineSeconds+.1,room,{armed:false});assert.equal(detector.snapshot().ready,true);return detector;}

test('a real unarmed baseline precedes one sustained genuine transient; a held level cannot repeat it',()=>{
  const detector=prepared();
  assert.equal(feed(detector,.3,.04),0,'ordinary low-level noise is below the authored floor');
  assert.equal(feed(detector,1,.25),1);
  assert.equal(feed(detector,1,.25),0,'one sustained sound is one attack');
  assert.equal(feed(detector,D.quietSeconds+.02,.006),0);
  assert.equal(feed(detector,.2,.25),1,'a genuinely separate attack can be observed after quiet');
});

test('missing pre-trap measurements fail closed and an armed reaction cannot become its own calibration',()=>{
  const detector=create();assert.equal(feed(detector,2,.4),0);assert.equal(detector.snapshot().ready,false);
  assert.equal(feed(detector,1,.006),0);assert.equal(detector.snapshot().ready,false);
  feed(detector,D.baselineSeconds+.1,.006,{armed:false});
  assert.equal(feed(detector,.2,.4),1);
});

test('the room floor raises the explicit threshold and freezes for the entire armed interval',()=>{
  const quiet=prepared(.006),noisy=prepared(.06);
  assert.ok(noisy.snapshot().threshold>quiet.snapshot().threshold);
  const baseline=noisy.snapshot().baseline;
  assert.equal(feed(noisy,.3,.14),0,'a modest rise over an established noisy room is not a startle');
  assert.equal(feed(noisy,.3,.3),1);
  assert.equal(noisy.snapshot().baseline,baseline,'the scream may not normalize itself away');
  assert.ok(noisy.snapshot().threshold>=baseline*D.baselineRatio-1e-8);
});

test('program echo and non-player measurements cannot attack, while simultaneous genuine reaction remains eligible',()=>{
  for(const flags of [{gameEchoLikely:true},{gameEchoLikely:false,programCorrelated:true},{gameEchoLikely:false,mask:{programCorrelated:true}},
    {gameEchoLikely:false,playerNoiseLikely:false},{gameEchoLikely:undefined}]){
    const detector=prepared(),before=detector.snapshot().baseline;
    assert.equal(feed(detector,.3,.7,{measurement:reading(.7,flags)}),0);
    assert.equal(detector.snapshot().baseline,before);
  }
  const detector=prepared();
  feed(detector,.25,.7,{measurement:reading(.7,{gameEchoLikely:true,playerNoiseLikely:false})});
  assert.equal(feed(detector,.2,.3),1,'echo must not create a blanket timeout over the human reaction');
});

test('one clipped or long-frame reading cannot invent a sustained attack',()=>{
  const detector=prepared();
  assert.equal(detector.sample(input(1,{dt:2})),false);
  assert.equal(detector.sample(input(.006)),false);
  assert.equal(feed(detector,.2,.006),0);
  assert.equal(feed(detector,.2,.4),1);
});

test('media, focus and input protections discard pending evidence and require quiet before rearming',()=>{
  for(const guard of [{active:false},{protected:true},{paused:true},{hidden:true},{focused:false},{suspended:true},
    {recording:true},{listening:true},{playback:true},{slating:true},{stalled:true},{micActive:false},{micMaySpoil:false}]){
    const detector=prepared(),baseline=detector.snapshot().baseline;
    assert.equal(feed(detector,.025,.3),0);
    assert.equal(detector.sample(input(.3,guard)),false);
    assert.equal(detector.snapshot().baseline,baseline);
    assert.equal(feed(detector,.4,.3),0,JSON.stringify(guard)+' may not turn already loud input into a fresh reaction');
    feed(detector,D.quietSeconds+.02,.006);
    assert.equal(feed(detector,.2,.3),1,JSON.stringify(guard));
  }
});

test('invalid or missing measurements fail closed without collecting a fabricated floor',()=>{
  for(const measurement of [undefined,null,{},reading(NaN),reading(Infinity),reading(-1),reading(1.01),reading('0.4')]){
    const detector=prepared(),baseline=detector.snapshot().baseline;
    assert.equal(detector.sample(input(.4,{measurement})),false);
    assert.equal(detector.snapshot().baseline,baseline);
    assert.equal(feed(detector,.3,.4),0);
  }
  const detector=create();feed(detector,1,.5,{armed:false,measurement:reading(.5,{gameEchoLikely:true})});
  assert.equal(detector.snapshot().ready,false,'game output is not a room calibration');
});

test('accepted sample clocks work at 60 and 120 Hz and cannot be advanced by zero-time polls',()=>{
  for(const rate of [60,120]){
    const detector=create();feed(detector,.8,.006,{armed:false},rate);
    for(let poll=0;poll<100;poll++)assert.equal(detector.sample(input(.3,{dt:0})),false);
    assert.equal(feed(detector,.2,.3,{},rate),1);
  }
  const paused=prepared();feed(paused,.04,.3);paused.sample(input(.3,{dt:0,protected:true}));
  assert.equal(feed(paused,.2,.3),0,'a zero-time lifecycle hold also discards unfinished evidence');
});

test('disarming does not consume the next encounter, and reset removes the previous room baseline',()=>{
  const detector=prepared();assert.equal(feed(detector,.2,.3),1);
  feed(detector,.4,.006,{armed:false});assert.equal(feed(detector,.2,.3),1);
  detector.reset();assert.equal(detector.snapshot().ready,false);assert.equal(detector.snapshot().latched,false);
  assert.equal(feed(detector,.3,.3),0);
  feed(detector,.8,.006,{armed:false});assert.equal(feed(detector,.2,.3),1);
});

test('thresholds remain explicitly adjustable, bounded and independent of output-volume settings',()=>{
  const detector=create({minimumRms:.2,baselineRatio:2,baselineMargin:.02});
  feed(detector,.8,.006,{armed:false});assert.equal(detector.snapshot().threshold,.2);
  assert.equal(feed(detector,.2,.15,{outputVolume:1}),0);
  assert.equal(feed(detector,.2,.25,{outputVolume:0}),1);
  assert.equal(create({minimumRms:NaN,baselineSeconds:-1}).snapshot().config.minimumRms,D.minimumRms);
});
