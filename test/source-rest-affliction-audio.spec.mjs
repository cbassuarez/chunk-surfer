import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_REST_PERFORMANCE as SCORE} from '../src/data/source-rest-performance.js';
import {createSourceRestAfflictionAudio,sourceRestAfflictionAudioFrame,makeSourceRestImpactPcm,SOURCE_REST_AFFLICTION_AUDIO as PROFILE} from '../src/audio/source-rest-affliction.js';

function harness({sampleRate=48000,position=0,strictWebKit=false}={}){
  const nodes=[],sources=[],timers=new Set(),ctx={currentTime:0,state:'running',sampleRate},media={currentTime:position,duration:SCORE.duration,playing:true};
  function param(value=0){return{value,events:[],setValueAtTime(v,at){this.value=v;this.events.push({kind:'value',v,at});},
    setTargetAtTime(v,at,decay){this.value=v;this.events.push({kind:'target',v,at,decay});},
    linearRampToValueAtTime(v,at){this.value=v;this.events.push({kind:'ramp',v,at});},
    cancelScheduledValues(at){this.events.push({kind:'cancel',at});},cancelAndHoldAtTime(at){this.events.push({kind:'hold',at});},
    setValueCurveAtTime(values,at,duration){assert.ok([...values].every(Number.isFinite));if(strictWebKit&&this.events.some(e=>e.kind==='curve'&&at<=e.at+e.duration+1e-8&&at+duration>=e.at-1e-8))throw Object.assign(Error('Events are overlapping'),{name:'NotSupportedError'});this.events.push({kind:'curve',values,at,duration});}};}
  function node(kind){const n={kind,links:[],connect(to){this.links.push(to);return to;},disconnect(){this.disconnected=true;}};nodes.push(n);return n;}
  ctx.createGain=()=>Object.assign(node('gain'),{gain:param(1)});
  ctx.createBiquadFilter=()=>Object.assign(node('filter'),{frequency:param(350),Q:param(1)});
  ctx.createDelay=()=>Object.assign(node('delay'),{delayTime:param(0)});
  ctx.createWaveShaper=()=>Object.assign(node('shaper'),{curve:null});
  ctx.createBuffer=(channels,length,rate)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return{duration:length/rate,sampleRate:rate,length,getChannelData:i=>data[i]};};
  ctx.createBufferSource=()=>{const s=Object.assign(node('source'),{buffer:null,starts:[],stops:[],start(at=ctx.currentTime){this.starts.push(at);},stop(at=ctx.currentTime){this.stops.push(at);this.stopAt=at;}});sources.push(s);return s;};
  const source=node('performance'),owner=createSourceRestAfflictionAudio({context:ctx,source,getState:()=>media,
    scheduleTimer:fn=>{timers.add(fn);return fn;},cancelTimer:fn=>timers.delete(fn)});
  function at(contextTime,position=contextTime){ctx.currentTime=contextTime;media.currentTime=position;for(const s of sources)if(!s.finished&&s.stopAt<=contextTime){s.finished=true;s.onended?.();}owner.update();}
  return{owner,ctx,media,nodes,sources,source,timers,at};
}

test('human point marks fracture the source and schedule body impact against AudioContext time exactly once',()=>{
  const h=harness({position:34.9});h.ctx.currentTime=10;
  assert.equal(h.owner.snapshot().scheduledMistakes,0);h.owner.setActive(true);
  let snap=h.owner.snapshot();assert.equal(snap.scheduledMistakes,1);assert.equal(h.timers.size,1);
  const first=snap.history.find(e=>e.kind==='mistake');assert.equal(first.id,SCORE.annotations[0].id);
  assert.ok(Math.abs(first.at-10.132)<1e-8);
  for(let i=0;i<5;i++)h.owner.update();assert.equal(h.owner.snapshot().scheduledMistakes,1,'duplicate updates cannot duplicate the impact');
  const clean=sourceRestAfflictionAudioFrame(34.9),hurt=sourceRestAfflictionAudioFrame(35.052);
  assert.ok(hurt.gain<clean.gain*.8);assert.ok(hurt.fragments>0,'a delayed, fractured copy of the real performance becomes audible');
  h.owner.dispose();assert.equal(h.timers.size,0);
});

test('holds cancel unheard scheduled hits and resume without a catch-up burst; seeking reanchors forward',()=>{
  const h=harness({position:34.9});h.owner.setActive(true);const pending=h.sources.find(s=>s.starts[0]>.01);
  h.owner.pause();assert.ok(pending.stops.includes(0));assert.equal(h.timers.size,0);
  h.ctx.currentTime=100;h.owner.update();
  const resumed=h.owner.snapshot().history.filter(e=>e.kind==='mistake').at(-1);assert.ok(Math.abs(resumed.at-100.132)<1e-8);
  h.at(100.14,35.04);const played=h.owner.snapshot().scheduledMistakes;h.owner.pause();
  h.ctx.currentTime=200;h.owner.update();assert.equal(h.owner.snapshot().scheduledMistakes,played,'a hit already heard does not replay on resume');
  h.at(200.02,300);const before=h.owner.snapshot().scheduledMistakes;h.at(200.12,300.1);
  assert.equal(h.owner.snapshot().scheduledMistakes,before,'a forward seek cannot dump skipped mistakes');h.owner.dispose();
});

test('all 127 actual marked mistakes survive the blackout and final hard passage reaches the track end',()=>{
  const h=harness();h.owner.setActive(true);
  for(let time=0;time<SCORE.duration;time+=.1)h.at(time,time);
  const snap=h.owner.snapshot();assert.equal(snap.scheduledMistakes,127);assert.ok(snap.scheduledCollapses>20);
  assert.ok(snap.history.some(e=>e.kind==='mistake'&&e.time===700.6),'the late mistake is owned by music, not the removed scene');
  assert.ok(snap.voices<=PROFILE.maxVoices);assert.equal(snap.passage,'cf54f643-ccc6-4cbf-9625-7e7bbd49d312');
  const ending=sourceRestAfflictionAudioFrame(SCORE.duration-.01);assert.ok(ending.cue.strain>0);assert.ok(ending.cutoff<1500,'auditory faculties continue to collapse after black');
  h.media.playing=false;h.at(SCORE.duration,SCORE.duration);assert.equal(h.owner.snapshot().voices,0);assert.equal(h.timers.size,0);h.owner.dispose();
});

test('dense late clusters retain individually scheduled human IDs with bounded concurrent sources',()=>{
  const h=harness({position:664.9});h.owner.setActive(true);
  for(let time=664.9;time<=679;time+=.025)h.at(time-664.9,time);
  const events=h.owner.snapshot().history.filter(e=>e.kind==='mistake'),expected=SCORE.annotations.filter(e=>e.type==='mistake'&&e.start>=664.9&&e.start<=679.14);
  assert.equal(events.length,expected.length);assert.equal(new Set(events.map(e=>e.id)).size,expected.length);
  assert.ok(h.owner.snapshot().voices<=PROFILE.maxVoices);h.owner.dispose();
});

test('buffering and seek holds cannot turn silent/stalled media time into heard impacts',()=>{
  const h=harness({position:34.9});h.owner.setActive(true);const count=h.owner.snapshot().scheduledMistakes;
  h.media.buffering=true;h.at(.02,34.9);assert.equal(h.owner.snapshot().held,true);assert.equal(h.owner.snapshot().voices,0);assert.equal(h.timers.size,0);
  h.at(10,34.9);assert.equal(h.owner.snapshot().scheduledMistakes,count);
  h.media.buffering=false;h.media.seeking=true;h.at(10.02,350);assert.equal(h.owner.snapshot().voices,0);
  h.media.seeking=false;h.at(10.04,350);assert.equal(h.owner.snapshot().scheduledMistakes,count,'resuming at a new position does not catch up the skipped score');
  h.owner.dispose();
});

test('a later deliberate sitting can hear future marks again after an inactive musical loop',()=>{
  const h=harness({position:34.9});h.owner.setActive(true);h.at(.2,35.1);assert.equal(h.owner.snapshot().scheduledMistakes,1);
  h.owner.setActive(false);h.ctx.currentTime=800;h.media.currentTime=34.9;h.owner.setActive(true);
  assert.equal(h.owner.snapshot().scheduledMistakes,2,'a new engagement has a new cursor epoch, without catching up earlier marks');
  const times=h.owner.snapshot().history.filter(e=>e.kind==='mistake').map(e=>e.time);assert.deepEqual(times,[35.032,35.032]);h.owner.dispose();
});

test('impact PCM and fracture ceilings remain finite and bounded at 44.1 and 48 kHz',()=>{
  for(const rate of [44100,48000])for(const severity of[1,2,3])for(const collapse of[false,true]){
    const pcm=makeSourceRestImpactPcm(rate,severity,{collapse});assert.ok(pcm.every(Number.isFinite));
    let peak=0;for(const sample of pcm)peak=Math.max(peak,Math.abs(sample));assert.ok(peak>.1&&peak<=.870001);
    const h=harness({sampleRate:rate});for(const shaper of h.nodes.filter(n=>n.kind==='shaper'))assert.ok([...shaper.curve].every(v=>Math.abs(v)<=PROFILE.ceiling));h.owner.dispose();
  }
});

test('a device without the required processing nodes retains a clean direct stream',()=>{
  const source={connect(){throw Error('Fallback must not add a duplicate connection');}},owner=createSourceRestAfflictionAudio({context:{},source});
  assert.equal(owner.output,source);owner.setActive(true);owner.update();owner.pause();assert.equal(owner.snapshot().supported,false);owner.dispose();
});


test('WebKit adjacent-curve tolerance cannot interrupt dense annotations, cancellation or resume',()=>{
  const h=harness({position:664.9,strictWebKit:true});h.owner.setActive(true);
  for(let n=1;n<600;n++){const time=n*.02+(n%2?1e-11:-1e-11);h.at(time,664.9+time);}
  h.owner.pause();h.at(100,676.88);h.at(100.02,676.9);h.owner.pause();h.at(200,676.9);
  const params=h.nodes.flatMap(n=>[n.gain,n.frequency,n.delayTime].filter(Boolean));
  assert.equal(params.flatMap(p=>p.events).filter(e=>e.kind==='curve').length,0,'no curve range can overlap at a WebKit boundary');
  assert.ok(params.flatMap(p=>p.events).some(e=>e.kind==='ramp'));assert.equal(h.owner.snapshot().automationMode,'piecewise-linear-4ms');
  assert.ok(h.owner.snapshot().scheduledMistakes>8);h.owner.dispose();
});
