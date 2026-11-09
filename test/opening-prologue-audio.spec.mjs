import test from 'node:test';
import assert from 'node:assert/strict';
import {OPENING_PROLOGUE_AUDIO as A,openingPrologueMix,openingPrologueThunderDue,createOpeningPrologueAudio,openingPrologueSpeechActive} from '../src/audio/opening-prologue-audio.js';
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
  const drive={speed:13,engineLoad:.35,throttle:.45,gear:4,engineOn:true,wiperMoving:true,wiperAngles:[-.6,.6]};
  let mix;for(let t=0;t<A.roadOnlySeconds-.5;t+=.1)mix=audio.update({dt:.1,stageMusic:.6,drive});
  assert.equal(mix.musicStarted,false);assert.deepEqual(strikes,[5.5,13.5]);
  assert.ok(cabCalls.at(-1).state.drive.wiperMoving&&cabCalls.at(-1).state.drive.speed>0,'cruising, wipers going');
  for(let t=0;t<A.radioRiseSeconds+A.radioDwellSeconds+3;t+=.1)mix=audio.update({dt:.1,stageMusic:.6,spoken:true,drive});
  assert.equal(mix.musicStarted,true);assert.ok(mix.radio<1,'the other has spoken: it is opening');
  audio.dispose();assert.equal(audio.snapshot().disposed,true);
});

test('cab sound follows actual speed, gear and blade pose, including an explicit impossible hold',()=>{
  const pair=fakeAudio(),calls=[];
  const audio=createOpeningPrologueAudio({getAudio:()=>pair,
    createCab:()=>({update:args=>calls.push(args),dispose(){}}),createThunder:()=>({prepare(){},strike(){},stop(){}})});
  const drive={speed:7.5,engineLoad:.21,throttle:.18,gear:3,engineOn:true},weather={rain:.64,roadWetness:.42,wiperMoving:true,wiperAngles:[-.73,.73]};
  audio.update({dt:.1,drive,weather,stageMusic:.6});let call=calls.at(-1);
  assert.equal(call.state.drive.speed,7.5);assert.equal(call.state.drive.gear,3);assert.deepEqual(call.weather.wiperAngles,[-.73,.73]);
  audio.update({dt:.1,drive:{...drive,speed:0},weather,wiperHeld:true});call=calls.at(-1);
  assert.equal(call.state.drive.speed,0);assert.equal(call.weather.wiperMoving,false);assert.deepEqual(call.weather.wiperAngles,[-.73,.73]);
  assert.equal(audio.snapshot().mix.physical.wiperHeld,true);audio.dispose();
});

test('missing physical input never fabricates a moving cruise and recording holds retire old thunder',()=>{
  const pair=fakeAudio(),calls=[];let stopped=0;
  const audio=createOpeningPrologueAudio({getAudio:()=>pair,
    createCab:()=>({update:args=>calls.push(args),dispose(){}}),createThunder:()=>({prepare(){},strike(){},stop(){stopped++;}})});
  audio.update({dt:1});assert.equal(calls.at(-1).ready,false);assert.equal(calls.at(-1).state,null);
  const elapsed=audio.snapshot().elapsed;audio.update({dt:1,protectedAudio:true});audio.update({dt:1,protectedAudio:true});
  assert.equal(audio.snapshot().elapsed,elapsed);assert.equal(stopped,1);assert.equal(audio.snapshot().held,true);audio.dispose();
});

test('the other has its own voice, and ducking follows actual speech rather than caption length',()=>{
  const v=VOICE_PROFILES.other;assert.ok(v&&v.lp>=3000,'close enough to follow every word');assert.ok(v.rate<1);
  assert.equal(openingPrologueSpeechActive({who:'unknown',voice:0}),true,'queued first syllable');
  assert.equal(openingPrologueSpeechActive({who:'unknown',voice:.7}),true);
  assert.equal(openingPrologueSpeechActive({who:'unknown',voice:1}),false,'finished sounding');
  assert.equal(openingPrologueSpeechActive({who:'unknown',voice:null,line:{text:'A long caption still being read'}}),false);
  assert.equal(openingPrologueSpeechActive({who:'me',voice:.2}),false);
});
