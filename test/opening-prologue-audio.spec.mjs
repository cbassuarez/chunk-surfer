import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OPENING_PROLOGUE_AUDIO as A,openingPrologueMix,openingPrologueThunderDue,createOpeningPrologueAudio} from '../src/audio/opening-prologue-audio.js';
import {VOICE_PROFILES} from '../src/audio/sam-voice.js';

test('the road comes first: no music at all for the opening stretch, whatever the talk does',()=>{
  for(const t of [0,4,10,A.roadOnlySeconds-.01]){
    const mix=openingPrologueMix({elapsed:t,stageMusic:.8,openedAt:2});
    assert.equal(mix.musicStarted,false);assert.equal(mix.music,0,`silent at ${t}s`);
  }
  assert.ok(openingPrologueMix({elapsed:A.cabFadeIn,stageMusic:.6}).cab>.99,'the van is there from the start');
  assert.ok(openingPrologueMix({elapsed:2}).wipers);
});

test('then the radio: small and narrow, until the other speaks',()=>{
  const radio=openingPrologueMix({elapsed:A.roadOnlySeconds+A.radioRiseSeconds,stageMusic:.6});
  assert.equal(radio.musicStarted,true);assert.equal(radio.radio,1);
  assert.ok(Math.abs(radio.music-.6*A.radioLevel)<1e-9,'the radio sits well under the scene level');
  const later=openingPrologueMix({elapsed:120,stageMusic:.6});assert.equal(later.radio,1,'it stays on the radio until spoken to');
});

test('when the other speaks it opens into the room, the van sinks, and the music dips under the voice',()=>{
  const spoke=A.roadOnlySeconds+A.radioRiseSeconds+A.radioDwellSeconds;
  const open=openingPrologueMix({elapsed:spoke+A.openSeconds,stageMusic:.6,openedAt:spoke});
  assert.equal(open.radio,0);assert.ok(Math.abs(open.music-.6)<1e-9);assert.ok(Math.abs(open.cab-A.cabUnder)<1e-9);assert.equal(open.wipers,false);
  assert.ok(Math.abs(openingPrologueMix({elapsed:spoke+A.openSeconds,stageMusic:.6,openedAt:spoke,speaking:true}).music-.6*A.speechDuck)<1e-9);
  // Spoken to early, it still lets the radio play at full radio level first.
  const early=openingPrologueMix({elapsed:A.roadOnlySeconds+A.radioRiseSeconds+A.radioDwellSeconds-.05,stageMusic:.6,openedAt:3});
  assert.equal(early.radio,1);assert.ok(Math.abs(early.music-.6*A.radioLevel)<1e-9);
});

test('as the film lets go the van comes back up, to hand straight to the drive',()=>{
  const end=openingPrologueMix({elapsed:200,stageMusic:0,openedAt:30,ending:1});
  assert.equal(end.music,0);assert.ok(Math.abs(end.cab-A.cabFull)<1e-9);assert.equal(end.wipers,true);
});

test('thunder is far, then nearer, and every strike falls in its own moment once',()=>{
  assert.deepEqual(openingPrologueThunderDue(0,A.roadOnlySeconds).map(s=>s.at),[5.5,13.5]);
  assert.ok(A.thunder[0].distance>A.thunder[1].distance);
  let seen=[];for(let t=0;t<60;t+=.25)seen.push(...openingPrologueThunderDue(t,t+.25));
  assert.equal(seen.length,A.thunder.length);
});

// A minimal Web Audio stand-in: enough to follow the levels the graph asks for.
function fakeAudio(){
  const param=v=>({value:v,targets:[],setTargetAtTime(x){this.value=x;this.targets.push(x);},cancelScheduledValues(){},setValueAtTime(x){this.value=x;},linearRampToValueAtTime(x){this.value=x;}});
  const node=()=>({gain:param(1),frequency:param(0),Q:param(0),pan:param(0),connect(){},disconnect(){}});
  const ctx={currentTime:0,state:'running',sampleRate:48000,createGain:node,createBiquadFilter:node,createWaveShaper:()=>({...node(),curve:null}),
    createStereoPanner:node};
  return{ctx,music:node(),sfx:node()};
}
test('the graph follows the timeline: van at once, music only after the road, thunder on time, a soft hand-off',()=>{
  const pair=fakeAudio(),cabCalls=[],strikes=[];
  const audio=createOpeningPrologueAudio({getAudio:()=>pair,
    createCab:()=>({update:args=>cabCalls.push(args),dispose(){},snapshot:()=>({})}),
    createThunder:()=>({prepare(){},strike:e=>strikes.push(e.at),stop(){}})});
  assert.ok(audio.musicPair().destination,'the recording has somewhere to play into');
  let mix;for(let t=0;t<A.roadOnlySeconds-.5;t+=.1)mix=audio.update({dt:.1,stageMusic:.6});
  assert.equal(mix.musicStarted,false);assert.deepEqual(strikes,[5.5,13.5]);
  assert.ok(cabCalls.at(-1).state.drive.wiperMoving&&cabCalls.at(-1).state.drive.speed>0,'cruising, wipers going');
  for(let t=0;t<A.radioRiseSeconds+A.radioDwellSeconds+3;t+=.1)mix=audio.update({dt:.1,stageMusic:.6,spoken:true});
  assert.equal(mix.musicStarted,true);assert.ok(mix.radio<1,'the other has spoken: it is opening');
  audio.dispose();assert.equal(audio.snapshot().disposed,true);
});

test('the other has its own voice, and the prologue starts the recording only when the mix says so',()=>{
  const v=VOICE_PROFILES.other;assert.ok(v&&v.lp>=3000,'close enough to follow every word');assert.ok(v.rate<1);
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const a=main.indexOf('function beginOpeningPrologue('),body=main.slice(a,main.indexOf('\n}',a));
  assert.doesNotMatch(body,/onStart:\(\)=>\{chaconne\.start\(\)/,'the music no longer starts on the first frame');
  assert.match(body,/if\(mix\?\.musicStarted&&!chaconneStarted\)\{chaconneStarted=true;chaconne\.setProgrammeDuck\(1,\{seconds:0\}\);chaconne\.start\(\);\}/);
  assert.match(body,/getAudio:\(\)=>prologueAudio\.musicPair\(\)/);
});
