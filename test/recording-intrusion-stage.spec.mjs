import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as REC from '../src/game/recordist.js';
import * as HUNTER from '../src/game/take-hunter.js';
import {createB3SpeakerDisturbance,B3_SPEAKER_FLAGS as FLAGS} from '../src/game/b3-speaker-disturbance.js';
globalThis.document||={title:'Chunk Surfer',baseURI:'http://localhost/'};globalThis.window||=globalThis;
const RADIO=await import('../src/game/radio.js');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),a=main.indexOf("if(kind==='studio-b3-control'){",main.indexOf("qp.has('firstStrikeReview')")),b=main.indexOf("\n          if(kind==='source-II'){",a);
assert.ok(a>=0&&b>a);const source=main.slice(a,b);
function fixture(){
 RADIO.loadRadioState({schema:5,phase:'dead',dead:true,deathCause:'existing-source-break',squelches:4,
  milestones:{[RADIO.RADIO_CUES.POST_SECOND]:true},scheduler:{nextFaultRemainingMs:20,pulseRemainingMs:[0,300]}},1234);
 let flags={unrelated:true},visits=0,despawned=0;const commits=[],actions=[],savedRec={tapes:[{id:'take:1',roomId:'amplifications',status:'accepted'}]},
  speaker=createB3SpeakerDisturbance({savedFlags:{[FLAGS.woken]:true,[FLAGS.age]:8,[FLAGS.spoilAt]:6}}),
  h=vm.createContext({kind:'studio-b3-control',getSave:()=>({flags,rec:savedRec}),saveCommit:patch=>{commits.push(patch);if(patch.flags)flags=patch.flags;},
   b3Speaker:speaker,b3HushVisit:{reset:()=>visits++},b3FadersDirty:false,recordingReviewActions:actions,performance:{now:()=>1234},
   fear:.8,FEAR:{setFear(){}},takeHunter:HUNTER.armTakeHunter(null),HUNTER,RADIO,PRES:{despawn:()=>despawned++}});
 return{h,speaker,commits,actions,savedRec,run:()=>vm.runInContext(source,h),flags:()=>flags,visits:()=>visits,despawned:()=>despawned};
}
test.afterEach(()=>{REC.stopRecording();REC.stopListening();REC.setLoudNoiseSink(null);REC.setTakeSink(null);RADIO.resetRadioState();});

test('actual DEV stage uses existing post-console state and resets only its stale visit, preserving job and prior tape data',()=>{
 const f=fixture(),before=structuredClone(f.savedRec);assert.equal(f.speaker.snapshot().active,true);f.run();
 assert.equal(f.flags()[FLAGS.woken],true);assert.equal(f.flags()[FLAGS.silenced],true);assert.equal(f.flags()[FLAGS.faderPrefix+'3'],0);assert.equal(f.flags()['b3.speakers.visit.complete'],true);
 assert.equal(f.speaker.snapshot().phase,'silenced');assert.equal(f.speaker.snapshot().noiseRatio,0);assert.equal(f.visits(),1);assert.equal(f.h.b3FadersDirty,true);assert.equal(f.despawned(),1);
 assert.deepEqual(f.savedRec,before);assert.deepEqual(f.commits.map(p=>Object.keys(p)),[['flags'],['radio']]);assert.equal(f.flags().unrelated,true);
 assert.equal(f.actions[0].earnedVisit,false);assert.equal(f.actions[0].jobCredited,false);assert.equal(f.actions[0].kind,'DEV-post-console-visit');
});

test('staged post-console B3 supports an actual full unspoiled recording and HOLD/resume without claiming room credit or disabling the hunter',()=>{
 const f=fixture();f.run();REC.stopRecording();REC.stopListening();REC.setTakeSink(null);REC.setLoudNoiseSink(null);REC.setAcousticEmitter(null);REC.loadRecState({injuries:0});
 REC.configureDifficulty({minorNoise:'spoil',spoilNoiseScale:1,spoilToleranceScale:1,recordingNoiseScale:1,takeSecondsScale:1});REC.startListening();REC.startRecording();
 let maximumAmbient=0;
 for(let tick=0;tick<600;tick++){
  f.speaker.step({dt:.1,enabled:!REC.hasTake('main_b3'),recording:true,slating:false,roomId:'main_b3',takeElapsed:REC.recState().takeElapsed,minimumSeconds:REC.minimumTakeDuration()});
  f.speaker.reportToRecorder(REC,{x:40,y:21});REC.tickRecording(.1);maximumAmbient=Math.max(maximumAmbient,REC.ambientNoise());
  assert.deepEqual(RADIO.tickRadio(.1,{now:1234+tick*100,canAnswer:true,random:()=>.5}),[]);
 }
 assert.equal(REC.recState().spoiled,false);assert.equal(REC.usableTake(),true);assert.equal(REC.hasTake('main_b3'),false);assert.equal(maximumAmbient,0);
 REC.stallTake();REC.resumeTake();f.speaker.step({dt:1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:REC.recState().takeElapsed,minimumSeconds:REC.minimumTakeDuration()});assert.equal(f.speaker.snapshot().active,false);
 assert.equal(HUNTER.armTakeHunter(f.h.takeHunter,{cause:'real voice after console',roll:.5}).active,true);assert.deepEqual(f.commits.map(p=>Object.keys(p)),[['flags'],['radio']]);
});

test('DEV offline radio clears inherited calls and pulses without granting milestones, then faults again after its canonical120s window',()=>{
 const f=fixture();RADIO.loadRadioState({schema:5,phase:'failing',squelches:7,milestones:{[RADIO.RADIO_CUES.POST_SECOND]:true},
  pendingCue:{id:RADIO.RADIO_CUES.INITIAL},call:{status:'calling',deadlineRemainingMs:12000,nextPulseRemainingMs:0},
  scheduler:{nextFaultRemainingMs:20,pulseRemainingMs:[0,300]}},1234);
 const before=RADIO.saveRadioState(1234);assert.equal(RADIO.radioCalling(),true);f.run();
 const saved=RADIO.saveRadioState(1234),receipt=f.actions.find(row=>row.kind==='DEV-radio-quiet');
 assert.equal(saved.phase,'dead');assert.equal(receipt.previousPhase,before.phase);assert.match(receipt.label,/DEV offline-radio/);assert.equal(saved.squelches,before.squelches);assert.deepEqual(saved.milestones,before.milestones);
 assert.deepEqual(saved.guidance,before.guidance);assert.equal(saved.pendingCue,null);assert.equal(saved.activeCue,null);assert.equal(saved.call.status,'idle');
 assert.equal(saved.scheduler.nextFaultRemainingMs,120000);assert.equal(saved.scheduler.pulseRemainingMs.length,0);assert.equal(receipt.earned,false);assert.equal(receipt.clearedPending,true);
 for(let tick=0;tick<480;tick++)assert.deepEqual(RADIO.tickRadio(.25,{now:1234+tick*250,canAnswer:true,random:()=>.5}),[]);
 const resumed=RADIO.tickRadio(.25,{now:121234,canAnswer:true,random:()=>.5});assert.ok(resumed.some(row=>row.type==='pulse'));
 assert.ok(RADIO.squelchCount()>before.squelches,'the ordinary fault scheduler remains enabled after the review window');
});

test('DEV native input receipt records bounded control metadata without typed text or synthetic-trust claims',()=>{
 const review=readFileSync(new URL('../src/dev/first-strike-review.js',import.meta.url),'utf8'),
  from=review.indexOf(' const receivedKeys='),to=review.indexOf(' const press=',from),listeners={};
 assert.ok(from>=0&&to>from);
 const scope=vm.createContext({addEventListener:(type,fn)=>{listeners[type]=fn;},panel:{contains:target=>target==='review'},performance:{now:()=>123},api:{inspect:()=>({scene:'source-continuation'})}});
 vm.runInContext(review.slice(from,to)+'\nglobalThis.receipt=inspect;',scope);
 listeners.keydown({code:'KeyA',key:'private typed text',isTrusted:true,target:'game'});
 assert.equal(scope.receipt().reviewKeyEvents.length,0);
 listeners.keydown({code:'KeyE',key:'e',isTrusted:true,target:'game'});
 listeners.keyup({code:'KeyE',key:'e',isTrusted:false,target:'review'});
 let rows=JSON.parse(JSON.stringify(scope.receipt().reviewKeyEvents));
 assert.deepEqual(rows,[{type:'keydown',code:'KeyE',repeat:false,trusted:true,withinReview:false,wall:123},{type:'keyup',code:'KeyE',repeat:false,trusted:false,withinReview:true,wall:123}]);
 for(let index=0;index<100;index++)listeners.keydown({code:'KeyS',key:String(index),repeat:true,isTrusted:true,target:'game'});
 rows=scope.receipt().reviewKeyEvents;assert.equal(rows.length,80);assert.ok(rows.every(row=>!('key' in row)&&row.repeat===true));
 assert.equal(scope.receipt().scene,'source-continuation');
});
