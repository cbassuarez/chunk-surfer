import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createPlayDurationClock,freshPlayDuration} from '../src/game/play-duration.js';
import {freshNightClock,advanceNightClock,createNightClockPace} from '../src/game/night-clock.js';
import {recordNightClockTravel,consumeNightClockTravel,clearNightClockTravel} from '../src/game/night-clock-travel.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function body(name){const start=main.indexOf(`function ${name}(`),end=main.indexOf('\n}\n',start)+3;assert.ok(start>=0&&end>start);return main.slice(start,end);}
function host(){
 clearNightClockTravel();const save={run:{id:'night-main',status:'active'},playDuration:freshPlayDuration(),nightClock:freshNightClock(),playSeconds:9999};
 const menus=new Set();let top=null,recording=false,listening=false,playing=false,speaking=false;
 const h={getSave:()=>save,storyMode:true,inRogue:true,paused:false,focused:true,scenes:{has:id=>menus.has(id),top:()=>top},
  REC:{isRecording:()=>recording,isListening:()=>listening},PB:{isPlaying:()=>playing},SPEECH:{isSpeaking:()=>speaking},
  sourceDriveSession:null,getInDriveTeaserScene:null,sourceReturnFlashbackScene:null,coastalMemoryScene:null,openingVehicleScene:null,openingOvertureScene:null,sourceContinuationScene:null,sourcePubScene:null,
  runPlayDurationClock:createPlayDurationClock(),nightClockPace:createNightClockPace(),advanceNightClock,consumeNightClockTravel,
  gameplayInputLifecycleActive:()=>h.focused,tickNightDeadline(){}};
 vm.createContext(h);vm.runInContext(body('nightClockSlowAction')+'\n'+body('tickRunPlayDuration'),h);
 return {h,save,menus,tick:now=>vm.runInContext(`tickRunPlayDuration(${now})`,h),slow:()=>vm.runInContext('nightClockSlowAction()',h),
  top:value=>{top=value;},record:value=>{recording=value;},listen:value=>{listening=value;},play:value=>{playing=value;},speak:value=>{speaking=value;}};
}

test('production clock uses accepted metres, never held keys, and keeps actual duration independent of variable night pace',()=>{
 const f=host();let now=0;f.tick(now);
 for(let i=0;i<180;i++){f.h.keysDown=new Set(['KeyW']);f.tick(now+=1000/60);}
 assert.ok(Math.abs(f.save.nightClock.elapsedSeconds-3)<1e-8,'blocked held input has no accepted travel receipt');
 for(let i=0;i<180;i++){recordNightClockTravel(.055);f.tick(now+=1000/60);}
 assert.ok(f.save.nightClock.rate>2.99);assert.ok(f.save.nightClock.elapsedSeconds>10);
 assert.ok(Math.abs(f.save.playDuration.seconds-6)<1e-8);assert.equal(f.save.playSeconds,9999);
 const started=f.save.nightClock.elapsedSeconds;
 for(let i=0;i<600;i++)f.tick(now+=1000/60);
 assert.ok(f.save.nightClock.rate<1.0001,'rest settles smoothly back to1×');assert.ok(f.save.nightClock.elapsedSeconds>started+10);
});

test('production pause, hidden/focus and settings edges drain stale motion without spending unseen time',()=>{
 const f=host();let now=0;f.tick(now);recordNightClockTravel(.5);f.tick(now+=1000);
 const old=f.save.nightClock.elapsedSeconds,real=f.save.playDuration.seconds;
 f.h.paused=true;recordNightClockTravel(1);f.tick(now+=10000);assert.equal(consumeNightClockTravel(),0);
 f.h.paused=false;f.tick(now+=10000);assert.equal(f.save.nightClock.elapsedSeconds,old);assert.equal(f.save.playDuration.seconds,real);
 for(const hold of ['settings','archive','focus']){
  if(hold==='focus')f.h.focused=false;else f.menus.add(hold);
  f.tick(now+=10000);const held=f.save.nightClock.elapsedSeconds;
  f.h.focused=true;f.menus.clear();f.tick(now+=10000);assert.equal(f.save.nightClock.elapsedSeconds,held);
 }
});

test('recording, listening, playback, dialogue, close inspection, van and memory force1×; custom walking owners remain eligible',()=>{
 const f=host();
 for(const [on,off] of [[()=>f.record(true),()=>f.record(false)],[()=>f.listen(true),()=>f.listen(false)],[()=>f.play(true),()=>f.play(false)],[()=>f.speak(true),()=>f.speak(false)]]){on();assert.equal(f.slow(),true);off();}
 for(const key of ['sourceDriveSession','getInDriveTeaserScene','sourceReturnFlashbackScene','coastalMemoryScene','openingVehicleScene','openingOvertureScene']){f.h[key]={};assert.equal(f.slow(),true,key);f.h[key]=null;}
 f.top({id:'inspect',blocksInput:true});assert.equal(f.slow(),true);
 for(const id of ['source-continuation','source-earthfall','source-false-return','source-pub']){
  const owner={id,blocksInput:true,allowsLook:true};f.h.sourceContinuationScene=id==='source-pub'?null:owner;f.h.sourcePubScene=id==='source-pub'?owner:null;f.top(owner);
  assert.equal(f.slow(),false,id+' owns real walking despite blocking ordinary-world input');
  owner.allowsLook=false;assert.equal(f.slow(),true,id+' contact/forced camera holds slow');
 }
});

test('ordinary accepted foot-distance records before any muted audio and rejects unsupported movement',()=>{
 clearNightClockTravel();const h={recordNightClockTravel,playerFootOwner:null,playerFootClock:{reset(){}},playerFootTravel:[],RT:{clearFootContacts(){},prepareFootsteps(){}}};
 vm.createContext(h);vm.runInContext(body('enqueuePlayerFootDistance'),h);
 h.muted=true;vm.runInContext("enqueuePlayerFootDistance(.5,.2,{supported:true,owner:'walk'})",h);assert.equal(consumeNightClockTravel(),.5);
 vm.runInContext("enqueuePlayerFootDistance(.5,.2,{supported:false,owner:'fall'})",h);assert.equal(consumeNightClockTravel(),0);
});

test('saved variable night resumes from its recorded instant without borrowing a new process interval',()=>{
 const f=host();f.tick(0);for(let i=1;i<=120;i++){recordNightClockTravel(.06);f.tick(i*1000/60);}
 const saved=JSON.parse(JSON.stringify(f.save)),g=host();Object.assign(g.save,saved);g.tick(900000);
 assert.equal(g.save.nightClock.elapsedSeconds,saved.nightClock.elapsedSeconds);assert.equal(g.save.playDuration.seconds,saved.playDuration.seconds);
 g.record(true);recordNightClockTravel(.5);g.tick(901000);assert.equal(g.save.nightClock.elapsedSeconds,saved.nightClock.elapsedSeconds+1);assert.equal(g.save.nightClock.rate,1);
});
