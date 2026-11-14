// Exercise the actual private host functions with the real transport and a
// deterministic audible clock. This is integration evidence, not rendering QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as engine from '../src/game/practice-metronomes.js';
import {METRONOME_FIELD} from '../src/audio/metronome-field.js';
import {createPracticeMetronomeResonance} from '../src/game/practice-metronome-resonance.js';
import * as realRecorder from '../src/game/recordist.js';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf("const metronomeControlsFlag="),source.indexOf('// THE WING IS QUIET,',source.indexOf("const metronomeControlsFlag=")));
function host(flags={}){
  let now=1000,recording=false,paused=false,focused=true;
  const save={run:{id:'metronome-host'},flags:structuredClone(flags)},events=[],sounded=[],muted=[],commits=[],closed=new Set(),heard=[];
  const updates=[];
  const props=new Map(engine.PRACTICE_METRONOMES.map((v,i)=>[v.id,{id:v.id,rx:i,ry:0}]));
  const ctx=vm.createContext({...engine,METRONOME_FIELD,createPracticeMetronomeResonance,shakeMode:()=>'full',performance:{now:()=>now},document:{get hidden(){return paused;}},
    getSave:()=>save,flagGet:key=>save.flags[key],flagSet:(key,value=true)=>{save.flags[key]=value;},
    saveCommit:patch=>{Object.assign(save,structuredClone(patch));commits.push(structuredClone(patch));return save;},
    FP:{logicalToPhysical:(x,y)=>({x,z:y,renderGroup:'upper',spaceId:'practice'}),toAuthoredCoord:x=>x,
      doorState:()=>engine.PRACTICE_METRONOMES.flatMap(v=>v.doors.map(id=>({id,open:!closed.has(id)})))},
    PROPS:{propById:id=>props.get(id),renderSelectedHosts:()=>[...props.values()].map(p=>({...p,x:p.rx,y:0,z:p.ry}))},REC:{isRecording:()=>recording,isStalled:()=>false,
      emitRoomSourceNoise:(...args)=>events.push(args),emitNoise:()=>{}},
    scenes:{blocksWorld:()=>paused},practiceRoomAt:()=>engine.PRACTICE_METRONOMES[0].roomId,
    acousticOcclusionDb:()=>0,acousticSpatialAt:()=>({}),usingPlan:()=>true,usingSpecialSpace:()=>false,gameplayInputLifecycleActive:()=>focused,
    onPracticeWingQuieted:voice=>heard.push(voice.id),
  });
  vm.runInContext(`let metronomeModel=freshMetronomeState(),metronomeModelRun,metronomeControlScene=null,
    metronomeControlDirty=false,metronomePersistAt=0,metronomeTickQueue=[],metronomeTickClock=0,
    metronomeSettleCarry=0,metronomeSettleClock=0,metronomeDoorsAt=0,metronomeDoorsOpen=new Map(),
    metronomeQuietBefore=null,metronomeMeshesReady=false,metronomeControlCueAt=0,metronomeMeshPack=null;
    const practiceMetronomeIds=new Set(PRACTICE_METRONOMES.map(v=>v.id));const metronomeTakeEvents=createMetronomeCoincidenceAccumulator();
    const metronomeResonance=createPracticeMetronomeResonance();let metronomeResonanceFrame={coherence:0,insistence:0,voices:[]};
    let storyMode=true,activeBattleId=null,px=0,py=0,CELL=1,takeOrigin={x:0,y:0},takeRoom='soundnoisemusic';
    const actx={get currentTime(){return performance.now()/1000;}};
    let metronomeFieldFrame={active:true,voices:PRACTICE_METRONOMES.map(()=>({gain:1,running:true}))};
    let paused=false;`,ctx);
  ctx.update=frame=>updates.push(clone(frame));
  ctx.sound=(ticks)=>sounded.push(...structuredClone(ticks));ctx.mute=i=>muted.push(i);
  vm.runInContext(`const metronomeFieldRuntime={sound:ticks=>sound(ticks),silenceVoice:i=>mute(i),update:frame=>update(frame)};\n${block}\n
    globalThis.API={ensurePracticeMetronomeState,persistPracticeMetronomes,tickPracticeMetronomes,
      changePracticeMetronomeRunning,changePracticeMetronomeTempo,changePracticeMetronomeHold,
      tickMetronomeQuiet,flushMetronomeTakeEvents,holdPracticeMetronomeClock,clearMetronomeScheduledTicks,currentMetronomeFrame,tickMetronomeSettle,
      state:()=>serializeMetronomeState(metronomeModel),voices:()=>PRACTICE_METRONOMES.map(v=>metronomeVoiceState(metronomeModel,v.id)),
      setState:s=>{metronomeModel=restoreMetronomeState(s);},queue:t=>{metronomeTickQueue.push(...t);},
      resonance:()=>metronomeResonanceFrame,queued:()=>metronomeTickQueue.length,setPaused:p=>{paused=p;}};`,ctx);
  const api=ctx.API;api.ensurePracticeMetronomeState();
  return{api,save,events,sounded,muted,commits,closed,heard,updates,
    at:seconds=>{now=seconds*1000;},step:seconds=>{now+=seconds*1000;api.tickPracticeMetronomes(seconds);},
    useRecorder:recorder=>{ctx.REC=recorder;},record:on=>{recording=on;},focus:on=>{focused=on;},pause:on=>{paused=on;api.setPaused(on);},
    soleVoice:()=>{const s=api.state();s.controls.forEach((c,i)=>{c.stopped=i!==0;});api.setState(s);},
  };
}
const clone=x=>JSON.parse(JSON.stringify(x));

test('the ordinary action opens the instrument at the existing pre-recording boundary',()=>{
  const hit=source.slice(source.indexOf('  const hit=focus.prop;'),source.indexOf("if(hit.action==='take-b3-cassettes')"));
  assert.ok(hit.indexOf('if(REC.isRecording())')<hit.indexOf("hit.action==='practice-metronome'&&openPracticeMetronome(hit.id)"));
  assert.equal(hit.includes("hit.action==='practice-metronome'&&stopPracticeMetronome"),false);
  assert.equal(/rollMetronomeRestart|tickMetronomeRestart|metronomeRestartPending/.test(source),false);
  assert.match(source,/id === 'practice-metronome'\) return \['recorder','light'\]/);
  const stop=source.slice(source.indexOf('function stopTake({silent=false}={}'),source.indexOf('function stopTake({silent=false}={}')+800);
  assert.ok(stop.indexOf('flushMetronomeTakeEvents({force:true})')<stop.indexOf('REC.stopRecording()'));
});

test('legacy stops migrate, structured state survives reload, and a transient grip never becomes a saved stop',()=>{
  const h=host({'practice.metronome.lesson.stopped':true});assert.equal(h.api.voices()[0].stopped,true);
  h.api.changePracticeMetronomeTempo(engine.PRACTICE_METRONOMES[0].id,72,{held:true});
  h.api.persistPracticeMetronomes();const saved=clone(h.save.flags);
  assert.equal(saved['practice.metronomes.controls.v2'].controls[0].held,false);
  const reload=host(saved);assert.equal(reload.api.voices()[0].stopped,true);assert.equal(reload.api.voices()[0].held,false);assert.equal(reload.api.voices()[0].tempo,72);
  reload.api.changePracticeMetronomeRunning(engine.PRACTICE_METRONOMES[0].id,true);assert.equal(reload.save.flags['practice.metronome.lesson.stopped'],false);
  h.api.changePracticeMetronomeTempo(engine.PRACTICE_METRONOMES[1].id,90,{held:true});
  h.api.changePracticeMetronomeHold(engine.PRACTICE_METRONOMES[1].id,false);
  assert.equal(host(clone(h.save.flags)).api.voices()[1].stopped,false);
});

test('equal BPM is a real running configuration and never awards quiet; the existing both-door solution still does',()=>{
  const h=host();h.api.tickMetronomeQuiet();
  for(const v of engine.PRACTICE_METRONOMES)h.api.changePracticeMetronomeTempo(v.id,168);
  for(let i=0;i<70;i++)h.step(.02);
  assert.equal(!!h.save.flags['practice.metronomes.quieted'],false);assert.ok(h.sounded.length>0);
  assert.ok(h.api.voices().every(v=>!v.stopped));
  for(const v of engine.PRACTICE_METRONOMES)for(const d of v.doors)if(d!=='practice-side')h.closed.add(d);
  h.step(.3);h.step(.02);assert.equal(!!h.save.flags['practice.metronomes.quieted'],false,'claimed room has another exit');
  h.closed.add('practice-side');h.step(.3);h.step(.02);
  assert.equal(h.save.flags['practice.metronomes.quieted'],true);assert.equal(h.heard.length,1);
  h.closed.clear();h.step(.3);h.step(.02);assert.equal(h.save.flags['practice.metronomes.quieted'],true,'historical achievement remains earned');
});

test('an untouched initially closed wing does not auto-award the student encounter',()=>{
  const h=host();for(const v of engine.PRACTICE_METRONOMES)for(const d of v.doors)h.closed.add(d);
  h.api.tickMetronomeQuiet();h.step(.02);assert.equal(!!h.save.flags['practice.metronomes.quieted'],false);
});

test('a tick scheduled before REC starts is judged when it is actually heard during the take',()=>{
  const h=host();h.soleVoice();const s=h.api.state();s.phases[0]=.95;h.api.setState(s);
  h.step(.04);assert.ok(h.api.queued()>0);assert.equal(h.events.length,0);
  h.record(true);for(let i=0;i<8;i++)h.step(.02);
  assert.ok(h.events.length>0);assert.equal(h.events[0][4].sourceId,'practice-metronome-lesson');
  assert.equal(h.events[0][4].interruption,'authored','recording quality semantics are preserved');
});

test('catch cancels an unheard future tick but keeps an already heard event awaiting its neighbour',()=>{
  const h=host();h.soleVoice();h.record(true);
  h.api.queue([{index:0,at:1.1},{index:0,at:1.3}]);h.at(1.105);h.api.flushMetronomeTakeEvents();
  assert.equal(h.events.length,0,'25ms window is still open');
  h.api.changePracticeMetronomeRunning('practice-metronome-lesson',false);assert.equal(h.api.queued(),0);
  h.at(1.14);h.api.flushMetronomeTakeEvents();assert.equal(h.events.length,1);
  h.at(1.4);h.api.flushMetronomeTakeEvents();assert.equal(h.events.length,1,'cancelled future tick cannot enter tape');
  assert.ok(h.muted.includes(0));
});

test('a transport stop includes its last audible tick and excludes future queued sound',()=>{
  const h=host();h.record(true);h.api.queue([{index:0,at:.999},{index:1,at:1.003}]);
  h.api.flushMetronomeTakeEvents({force:true});assert.equal(h.events.length,1);assert.equal(h.api.queued(),1);
  h.record(false);h.at(1.05);h.api.flushMetronomeTakeEvents();assert.equal(h.events.length,1);
});

test('a new run clears audio history and old controls; hidden/paused wing time cannot settle the weights',()=>{
  const h=host();h.api.changePracticeMetronomeTempo('practice-metronome-lesson',40);
  h.api.queue([{index:0,at:9}]);h.save.run.id='another-run';h.save.flags={};h.api.ensurePracticeMetronomeState();
  assert.equal(h.api.voices()[0].tempo,112);assert.equal(h.api.queued(),0);
  h.api.currentMetronomeFrame();h.pause(true);h.at(4);h.api.currentMetronomeFrame();
  assert.equal(h.save.flags['practice.metronomes.settle']||0,0);
});

test('a long background gap discards queued sound without dumping events onto the recorder',()=>{
  const h=host();h.soleVoice();h.record(true);h.step(.02);
  h.api.queue([{index:0,at:1.03}]);h.at(2);h.api.tickPracticeMetronomes(.02);
  assert.equal(h.api.queued(),0);assert.equal(h.events.length,0);
});


test('release and restart restore audibility inside the instrument without moving the body',()=>{
  const h=host(),id='practice-metronome-lesson';
  h.api.changePracticeMetronomeHold(id,true);assert.equal(h.updates.at(-1).voices[0].running,false);
  h.api.changePracticeMetronomeHold(id,false);assert.equal(h.updates.at(-1).voices[0].running,true);assert.ok(h.updates.at(-1).voices[0].gain>0);
  h.api.changePracticeMetronomeRunning(id,false);assert.equal(h.updates.at(-1).voices[0].running,false);
  h.api.changePracticeMetronomeRunning(id,true);assert.equal(h.updates.at(-1).voices[0].running,true);assert.ok(h.updates.at(-1).voices[0].gain>0);
});

test('a pause boundary records its already heard tick before cancelling unheard scheduling',()=>{
  const h=host();h.record(true);h.api.queue([{index:0,at:.999},{index:1,at:1.03}]);
  h.api.holdPracticeMetronomeClock();assert.equal(h.events.length,1);assert.equal(h.api.queued(),0);
});

test('pre-roll drains already heard idle clicks before REC but preserves scheduled clicks after onset',()=>{
  const roll=source.slice(source.indexOf('function roll(){'),source.indexOf('function roll(){')+4000);
  assert.ok(roll.indexOf('flushMetronomeTakeEvents({force:true})')<roll.indexOf('REC.startRecording('));
  const h=host();h.api.queue([{index:0,at:.999},{index:1,at:1.03}]);h.api.flushMetronomeTakeEvents({force:true});h.record(true);
  h.at(1.07);h.api.flushMetronomeTakeEvents();assert.equal(h.events.length,1);assert.equal(h.events[0][4].sourceId,'practice-metronome-claimed');
});


test('paused, hidden and unfocused host frames cannot rearm sound or advance drift',()=>{
  for(const reason of ['paused','focus']){
    const h=host();h.api.changePracticeMetronomeTempo('practice-metronome-lesson',60);h.step(.02);
    h.api.holdPracticeMetronomeClock();const before=clone(h.api.state()),sounds=h.sounded.length;
    if(reason==='paused')h.pause(true);else h.focus(false);
    for(let i=0;i<100;i++)h.step(.02);
    assert.deepEqual(clone(h.api.state()),before);assert.equal(h.api.queued(),0);assert.equal(h.sounded.length,sounds);
  }
});


test('room resonance follows actual due ticks while idle and never changes recording or quiet state',()=>{
  const h=host();h.soleVoice();h.api.queue([{index:0,at:1.01}]);h.at(1.02);h.api.flushMetronomeTakeEvents();
  h.at(1.045);h.api.flushMetronomeTakeEvents();const r=h.api.resonance();
  assert.ok(r.voices[0].energy>0);assert.equal(h.events.length,0);assert.equal(!!h.save.flags['practice.metronomes.quieted'],false);
  assert.ok(Math.hypot(...r.voices[0].caseOffset)<=.00018+1e-9);
  h.api.changePracticeMetronomeRunning('practice-metronome-lesson',false);h.at(4);h.api.flushMetronomeTakeEvents();
  assert.ok(h.api.resonance().voices[0].energy<r.voices[0].energy);assert.equal(h.events.length,0);
});


test('the actual recorder still hears equal-rate clocks and can finish a take after their physical stops',()=>{
  const prior=realRecorder.saveRecState(),difficulty=realRecorder.recordistDifficulty();
  try{
    realRecorder.configureDifficulty({spoilNoiseScale:1,minorNoise:'spoil',pauseSeconds:0,recordingNoiseScale:1,spoilToleranceScale:1,takeSecondsScale:1});
    const begin=()=>{realRecorder.loadRecState({injuries:0,battery:1,takes:[]});realRecorder.startListening();assert.equal(realRecorder.startRecording(),true);};
    const h=host();h.useRecorder(realRecorder);
    for(const voice of engine.PRACTICE_METRONOMES)h.api.changePracticeMetronomeTempo(voice.id,168);
    begin();for(let i=0;i<100&&!realRecorder.takeInterrupted();i++){h.step(.02);realRecorder.decayNoise(.02);realRecorder.tickRecording(.02);}
    assert.equal(realRecorder.takeInterrupted(),true);assert.equal(realRecorder.recState().spoilMeta.interruption,'authored');
    assert.match(realRecorder.recState().spoilMeta.sourceId,/practice-metronome/);realRecorder.stopRecording();
    for(const voice of engine.PRACTICE_METRONOMES)h.api.changePracticeMetronomeRunning(voice.id,false);
    begin();let outcome;for(let i=0;i<Math.ceil(realRecorder.takeDuration()/.02)+2;i++){
      h.step(.02);realRecorder.decayNoise(.02);outcome=realRecorder.tickRecording(.02);if(outcome==='complete')break;
    }
    assert.equal(outcome,'complete');assert.equal(realRecorder.stopRecording().completed,true);
    assert.ok(h.api.voices().every(v=>v.stopped));
  }finally{realRecorder.configureDifficulty(difficulty);realRecorder.loadRecState(prior);}
});


test('the unedited wing settling clock advances while standing still without audio refresh calls',()=>{
  const h=host();for(let i=0;i<310;i++)h.step(.02);
  assert.ok(h.save.flags['practice.metronomes.settle']>=5);assert.ok(h.api.voices()[0].tempo>112);
  assert.ok(h.updates.length<=2,'level refresh is not the clock owner');
  const before=h.save.flags['practice.metronomes.settle'];h.pause(true);for(let i=0;i<310;i++)h.step(.02);
  assert.equal(h.save.flags['practice.metronomes.settle'],before);
});
