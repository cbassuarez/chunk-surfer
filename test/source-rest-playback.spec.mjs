import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceRestPlayback,SOURCE_REST_AUDIBLE_RATE_STEP} from '../src/audio/source-rest-playback.js';
import {planSourceRestTempo,SOURCE_REST_TEMPO} from '../src/game/source-rest-pacing.js';

function parameter({hold=true,value=1}={}){
  const calls=[],p={value,calls,
    cancelScheduledValues(at){calls.push({kind:'cancel',at});},
    setValueAtTime(value,at){this.value=value;calls.push({kind:'set',value,at});},
    // A future ramp does not immediately alter the current value. This is
    // important: deduplication must remember its target, not compare p.value.
    linearRampToValueAtTime(value,at){calls.push({kind:'ramp',value,at});}};
  if(hold)p.cancelAndHoldAtTime=at=>calls.push({kind:'hold',at});
  return p;
}
function fixture(options){
  let output={gain:parameter(options)},media={playbackRate:1,preservesPitch:true,currentTime:0,duration:100},ctx={currentTime:0};
  const transport=createSourceRestPlayback({getMedia:()=>media,getContext:()=>ctx,getOutputGain:()=>output});
  return{transport,get output(){return output;},get ctx(){return ctx;},get media(){return media;},
    replaceOutput(p){output={gain:p};},replaceContext(value){ctx=value;},replaceMedia(){media={...media};}};
}

for(const hold of[true,false])test(`unchanged programme targets never cancel or extend a2.8s return ramp (${hold?'hold-capable':'fallback'} parameter)`,()=>{
  const f=fixture({hold}),p=f.output.gain;f.transport.bind();const initial=p.calls.length;
  assert.equal(p.calls.at(-1).kind,'set');assert.equal(p.calls.at(-1).value,1);
  for(let i=0;i<60;i++){f.ctx.currentTime=i/60;f.transport.setProgrammeDuck(1,{seconds:2.8});}
  assert.equal(p.calls.length,initial,'steady unity is not reinitialized every frame');

  f.ctx.currentTime=1;f.transport.setProgrammeDuck(.7,{seconds:.08});
  const attack=p.calls.filter(c=>c.kind==='ramp');assert.deepEqual(attack,[{kind:'ramp',value:.7,at:1.08}]);
  const afterAttack=p.calls.length;p.value=.85;
  for(let i=0;i<60;i++){f.ctx.currentTime=1+i/60;f.transport.setProgrammeDuck(.7,{seconds:.08});}
  assert.equal(p.calls.length,afterAttack,'a still-in-flight attack target is not rescheduled');

  f.ctx.currentTime=2;f.transport.setProgrammeDuck(1,{seconds:2.8});const afterReturn=p.calls.length;
  assert.deepEqual(p.calls.at(-1),{kind:'ramp',value:1,at:4.8});p.value=.75;
  for(let i=0;i<180;i++){f.ctx.currentTime=2+i/60;f.transport.setProgrammeDuck(1,{seconds:2.8});}
  assert.equal(p.calls.length,afterReturn,'the original return endpoint survives repeated60Hz updates');
  assert.equal(p.calls.filter(c=>c.kind==='ramp').length,2,'only the two real target changes schedule ramps');
  assert.deepEqual(p.calls.at(-1),{kind:'ramp',value:1,at:4.8});
});

for(const hz of[60,240])test(`sixty seconds of continuous walking plans do not reconfigure the audible rate every frame at${hz}Hz`,()=>{
  const f=fixture(),m=f.media,writes=[];let rate=1;
  Object.defineProperty(m,'playbackRate',{get:()=>rate,set(value){rate=value;writes.push(value);}});
  m.currentTime=200;m.duration=716.4;
  const first=planSourceRestTempo({currentTime:m.currentTime,duration:m.duration}).rate;
  f.transport.setPlaybackRate(first,{immediate:true});const initial=rate,start=m.currentTime;
  f.transport.sample({eligible:true});
  for(let i=1;i<=60*hz;i++){
    f.ctx.currentTime=i/hz;m.currentTime+=rate/hz;
    const plan=planSourceRestTempo({currentTime:m.currentTime,duration:m.duration});
    f.transport.setPlaybackRate(plan.rate);f.transport.sample({eligible:true});
  }
  assert.ok(writes.length<=8,`${writes.length}writes must remain a few0.1%changes, not${60*hz}frame assignments`);
  assert.ok(rate<=initial-.003,'the subtle distant change is retained rather than accidentally frozen');
  for(const value of writes){assert.ok(value>=.96&&value<=.98);assert.ok(Math.abs(value/SOURCE_REST_AUDIBLE_RATE_STEP-Math.round(value/SOURCE_REST_AUDIBLE_RATE_STEP))<1e-8);}
  assert.ok(Math.abs(f.transport.snapshot().playedSeconds-(m.currentTime-start))<1e-8);
  assert.ok(Math.abs(f.transport.snapshot().audibleWallSeconds-60)<1e-8,'source and listening clocks keep their existing meanings');
});

test('quantized assignments retain the fractional slew at high frame rate and exact immediate unity',()=>{
  const f=fixture(),m=f.media;f.transport.bind();f.transport.setPlaybackRate(.96);let previous=m.playbackRate;
  for(let i=1;i<=60;i++){
    f.ctx.currentTime=i/240;f.transport.applyRate();
    // Quantization adds at most one0.001step to the continuous slew's
    // per-frame bound; the underlying slew must still reach its target.
    assert.ok(Math.abs(m.playbackRate-previous)<=SOURCE_REST_TEMPO.changePerSecond/240+SOURCE_REST_AUDIBLE_RATE_STEP+1e-9);
    previous=m.playbackRate;
  }
  assert.ok(Math.abs(m.playbackRate-.97)<1e-8,'240Hz downward adjustments cannot stall at a rounding tie');
  f.transport.setPlaybackRate(1,{immediate:true});assert.equal(m.playbackRate,1);
});

test('a new output parameter is initialized at the intended level and media rebind forces initialization without touching retired parameters',()=>{
  const f=fixture(),old=f.output.gain;f.transport.bind();f.transport.setProgrammeDuck(.7,{seconds:.08});const oldCount=old.calls.length;
  const replacement=parameter({value:1});f.replaceOutput(replacement);f.replaceContext({currentTime:20});
  f.transport.setProgrammeDuck(.7,{seconds:2.8});
  assert.deepEqual(replacement.calls,[{kind:'hold',at:20},{kind:'set',value:.7,at:20}],
    'a new graph starts at its actual target, not an unrelated default or a restarted long recovery');
  assert.equal(old.calls.length,oldCount);
  for(let i=0;i<60;i++){f.ctx.currentTime=20+i/60;f.transport.setProgrammeDuck(.7,{seconds:2.8});}
  assert.equal(replacement.calls.length,2);assert.equal(old.calls.length,oldCount);

  replacement.value=.2;f.replaceMedia();f.transport.bind();
  assert.equal(replacement.calls.at(-1).kind,'set');assert.equal(replacement.calls.at(-1).value,.7,
    'bind force-initializes even if a prior media owner used the same AudioParam and target');
  assert.equal(old.calls.length,oldCount);
  f.transport.reset();f.transport.bind();assert.equal(replacement.calls.at(-1).value,1);assert.equal(f.transport.snapshot().programmeDuck,1);
});
