import test from 'node:test';
import assert from 'node:assert/strict';
import {PRACTICE_METRONOMES} from '../src/game/practice-metronomes.js';
import {PRACTICE_METRONOME_RESONANCE as C,createPracticeMetronomeResonance} from '../src/game/practice-metronome-resonance.js';

const near=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<=t,`${a} versus ${b}`);
const magnitude=vector=>Math.hypot(...vector);
const voices=(patch={})=>PRACTICE_METRONOMES.map((voice,index)=>({index,id:voice.id,transmission:1,running:true,held:false,...patch}));
const sample=(runtime,now,ticks=[],v=voices(),extra={})=>runtime.sample({now,ticks,voices:v,...extra});
const beat=(at,indices=[0,1,2,3,4,5])=>indices.map(index=>({index,at}));
function events(seconds,offsets=Array(6).fill(0),period=.5){
  const ticks=[];
  for(let index=0;index<6;index++)for(let at=.1+offsets[index];at<=seconds+1e-9;at+=period)ticks.push({index,at});
  return ticks.sort((a,b)=>a.at-b.at);
}
function play(runtime,all,seconds,step=.01,v=voices(),extra={}){
  let time=0,cursor=0,result=sample(runtime,0,[],v,extra);
  while(time<seconds-1e-9){time=Math.min(seconds,time+step);const batch=[];
    while(cursor<all.length&&all[cursor].at<=time+1e-9)batch.push(all[cursor++]);
    result=sample(runtime,time,batch,v,extra);
  }return result;
}

test('a correct-looking tempo or aligned phase cannot create a response without actual audible ticks',()=>{
  const r=createPracticeMetronomeResonance(),v=voices({tempo:168,phase:0});
  for(const now of[0,1,10,100]){
    const result=sample(r,now,[],v);near(result.coherence,0);near(result.insistence,0);
    assert.ok(result.voices.every(voice=>voice.energy===0&&[voice.caseOffset,voice.surfaceOffset,voice.nearbyOffset].every(vector=>magnitude(vector)===0)));
  }
});

test('a future scheduled click never anticipates its sound; the actual impulse begins at zero displacement',()=>{
  const r=createPracticeMetronomeResonance(),tick={index:0,at:1};
  let result=sample(r,.9,[tick]);near(result.voices[0].energy,0);
  result=sample(r,1,[tick]);assert.ok(result.voices[0].energy>0);near(magnitude(result.voices[0].caseOffset),0);
  result=sample(r,1.025);assert.ok(magnitude(result.voices[0].caseOffset)>0);
  assert.equal(result.voices[1].energy,0,'another room cannot respond to an invented beat');
});

test('displacement remains below physical caps even under duplicate and pathological burst input',()=>{
  const r=createPracticeMetronomeResonance();sample(r,0);
  const ticks=[];for(let i=0;i<200;i++)ticks.push(...beat(.1+i*.001));
  let result=sample(r,.3,ticks);const energy=result.voices[0].energy;
  result=sample(r,.3,ticks);near(result.voices[0].energy,energy);
  for(let now=.301;now<1;now+=.003){result=sample(r,now);for(const voice of result.voices){
    assert.ok(magnitude(voice.caseOffset)<=C.caseMaximumM+1e-12);assert.ok(C.caseMaximumM<.0002);
    assert.ok(magnitude(voice.surfaceOffset)<=C.surfaceMaximumM+1e-12&&C.surfaceMaximumM<=.001);
    assert.ok(magnitude(voice.nearbyOffset)<=C.nearbyMaximumM+1e-12&&C.nearbyMaximumM<=.001);
  }}
});

test('stopping leaves a decaying room impulse and cannot excite another beat while stopped',()=>{
  const r=createPracticeMetronomeResonance(),v=voices();sample(r,0);sample(r,.1,beat(.1,[0]));
  const before=sample(r,.14),stopped=v.map((voice,index)=>({...voice,running:index!==0,stopped:index===0}));
  const contact=sample(r,.14,[],stopped);near(magnitude(contact.voices[0].surfaceOffset),magnitude(before.voices[0].surfaceOffset));
  const tail=sample(r,.2,[{index:0,at:.18}],stopped);assert.ok(tail.voices[0].energy>0);assert.ok(tail.voices[0].energy<before.voices[0].energy);
  const quiet=sample(r,3,[],stopped);near(quiet.voices[0].energy,0);near(magnitude(quiet.voices[0].nearbyOffset),0);
  // The ignored contact-time event cannot be replayed after release.
  const released=sample(r,3,[{index:0,at:.18}],v);near(released.voices[0].energy,0);
});

test('fingers damp the casing continuously while the support rings freely, without restoring old energy on release',()=>{
  const free=createPracticeMetronomeResonance(),caught=createPracticeMetronomeResonance();
  for(const r of[free,caught]){sample(r,0);sample(r,.1,beat(.1,[0]));sample(r,.13);}
  const held=voices().map((v,index)=>({...v,held:index===0}));
  const contact=sample(caught,.13,[],held),same=sample(free,.13);near(magnitude(contact.voices[0].caseOffset),magnitude(same.voices[0].caseOffset));
  const damped=sample(caught,.2,[],held),undamped=sample(free,.2);
  assert.ok(magnitude(damped.voices[0].caseOffset)<magnitude(undamped.voices[0].caseOffset)*.2);
  near(magnitude(damped.voices[0].surfaceOffset),magnitude(undamped.voices[0].surfaceOffset));
  const released=sample(caught,.2);near(magnitude(released.voices[0].caseOffset),magnitude(damped.voices[0].caseOffset));
});

test('equal rate with different phase does not earn the sustained coincidence response',()=>{
  const aligned=play(createPracticeMetronomeResonance(),events(16),16);
  const separate=play(createPracticeMetronomeResonance(),events(16,[0,.06,.13,.21,.31,.4]),16);
  assert.ok(aligned.coherence>.95);assert.ok(aligned.insistence>.85);
  assert.ok(separate.coherence<.01);assert.ok(separate.insistence<.01);
  // Actual aligned120BPM clicks respond even when the unused metadata claims40.
  const otherLabel=play(createPracticeMetronomeResonance(),events(16),16,.01,voices({tempo:40}));
  near(otherLabel.coherence,aligned.coherence);near(otherLabel.insistence,aligned.insistence);
});

test('insistence grows from prolonged actual coincidences, not one initial six-way meeting',()=>{
  const single=play(createPracticeMetronomeResonance(),beat(.1),16);
  const sustained=play(createPracticeMetronomeResonance(),events(16),16);
  assert.ok(single.insistence<.05);assert.ok(sustained.insistence>.85);
  assert.ok(single.coherence<.001);
});

test('door/space/distance transmission attenuates new excitation while an already heard impulse retains its ringdown',()=>{
  const open=createPracticeMetronomeResonance(),closed=createPracticeMetronomeResonance();
  sample(open,0);sample(closed,0);sample(open,.1,beat(.1));sample(closed,.1,beat(.1));
  const a=sample(open,.14),b=sample(closed,.14,[],voices({transmission:0}));
  near(magnitude(a.voices[0].nearbyOffset),magnitude(b.voices[0].nearbyOffset));
  const unheard=play(createPracticeMetronomeResonance(),events(10),10,.01,voices({transmission:0}));near(unheard.coherence,0);near(unheard.insistence,0);
  const quiet=play(createPracticeMetronomeResonance(),events(10),10,.01,voices({transmission:.2}));
  const loud=play(createPracticeMetronomeResonance(),events(10),10);
  assert.ok(quiet.coherence<loud.coherence*.21);assert.ok(quiet.voices[0].energy<loud.voices[0].energy);
});

test('rolling25ms clusters and the response are independent of render-frame partition',()=>{
  const ticks=events(12.3,[0,.004,.008,.012,.016,.020]);
  const fine=play(createPracticeMetronomeResonance(),ticks,12.3,.005);
  const coarse=play(createPracticeMetronomeResonance(),ticks,12.3,.059);
  near(coarse.coherence,fine.coherence,1e-8);near(coarse.insistence,fine.insistence,1e-8);
  for(let index=0;index<6;index++)for(const key of['caseOffset','surfaceOffset','nearbyOffset'])for(let axis=0;axis<3;axis++)near(coarse.voices[index][key][axis],fine.voices[index][key][axis],1e-10);
});

test('reduced motion scales displacement and retains the same actual acoustic rhythm and coherence',()=>{
  const ticks=events(4.14),full=play(createPracticeMetronomeResonance(),ticks,4.14);
  const reduced=play(createPracticeMetronomeResonance(),ticks,4.14,.01,voices(),{reducedMotion:true});
  near(reduced.coherence,full.coherence);near(reduced.insistence,full.insistence);near(reduced.voices[0].energy,full.voices[0].energy);
  for(const key of['caseOffset','surfaceOffset','nearbyOffset'])for(let axis=0;axis<3;axis++)near(reduced.voices[0][key][axis],full.voices[0][key][axis]*C.reducedMotionScale);
});

test('reset or a new clock origin cannot carry old mechanical or coincidence energy into another scene',()=>{
  const r=createPracticeMetronomeResonance();play(r,events(4.14),4.14);r.reset(5);
  let result=sample(r,5);near(result.insistence,0);assert.ok(result.voices.every(voice=>voice.energy===0));
  play(r,events(2.14),2.14);result=sample(r,.5);near(result.insistence,0);assert.ok(result.voices.every(voice=>voice.energy===0));
});

test('folding long histories preserves sustained resonance instead of periodically restarting it',()=>{
  const result=play(createPracticeMetronomeResonance(),events(90),90,.05);
  assert.ok(result.coherence>.99);assert.ok(result.insistence>.99);
});
