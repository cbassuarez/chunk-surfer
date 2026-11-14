import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createPlayDurationClock,freshPlayDuration} from '../src/game/play-duration.js';
import {freshNightClock,advanceNightClock,createNightClockPace,holdNightClockForSource,leaveSourceNightClock,nightClockReadout,NIGHT_CLOCK_SOURCE_EXIT_SECONDS,NIGHT_CLOCK_PACE_POLICY} from '../src/game/night-clock.js';
import {NIGHT_DEADLINE_SECONDS} from '../src/game/night-deadline.js';
import {recordNightClockTravel,consumeNightClockTravel,clearNightClockTravel} from '../src/game/night-clock-travel.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function body(name){const start=main.indexOf(`function ${name}(`),end=main.indexOf('\n}\n',start)+3;assert.ok(start>=0&&end>start);return main.slice(start,end);}
function host(){
 clearNightClockTravel();const save={run:{id:'night-main',status:'active'},playDuration:freshPlayDuration(),nightClock:freshNightClock(),playSeconds:9999};
 const menus=new Set();let top=null,recording=false,listening=false,playing=false,speaking=false;
 const h={getSave:()=>save,storyMode:true,inRogue:true,paused:false,focused:true,scenes:{has:id=>menus.has(id),top:()=>top},
  REC:{isRecording:()=>recording,isListening:()=>listening},PB:{isPlaying:()=>playing},SPEECH:{isSpeaking:()=>speaking},
  sourceDriveSession:null,getInDriveTeaserScene:null,sourceReturnFlashbackScene:null,coastalMemoryScene:null,openingVehicleScene:null,openingOvertureScene:null,sourceContinuationScene:null,sourcePubScene:null,
  runPlayDurationClock:createPlayDurationClock(),nightClockPace:createNightClockPace(),advanceNightClock,holdNightClockForSource,NIGHT_DEADLINE_SECONDS,NIGHT_CLOCK_PACE_POLICY,nightClockHeldBySource:()=>h.inSource===true,consumeNightClockTravel,
  gameplayInputLifecycleActive:()=>h.focused,tickNightDeadline(){}};
 vm.createContext(h);vm.runInContext(body('nightClockSlowAction')+'\n'+body('tickRunPlayDuration'),h);
 return {h,save,menus,tick:now=>vm.runInContext(`tickRunPlayDuration(${now})`,h),slow:()=>vm.runInContext('nightClockSlowAction()',h),
  top:value=>{top=value;},record:value=>{recording=value;},listen:value=>{listening=value;},play:value=>{playing=value;},speak:value=>{speaking=value;}};
}

test('Source holds the clock and blanks it while real play time keeps counting, and any other way out resumes it',()=>{
 const f=host();let now=0;f.tick(now);
 for(let i=0;i<120;i++)f.tick(now+=1000/60);
 const entered=f.save.nightClock.elapsedSeconds;assert.ok(entered>1.9);assert.notEqual(nightClockReadout(f.save).value,'  :  ');
 f.h.inSource=true;
 for(let i=0;i<600;i++){recordNightClockTravel(.055);f.tick(now+=1000/60);}
 assert.ok(Math.abs(f.save.nightClock.elapsedSeconds-entered)<.02,'not one second passes in Source, even running');
 assert.equal(nightClockReadout(f.save).value,'  :  ');assert.ok(f.save.playDuration.seconds>11,'time on site is a separate record and still counts');
 f.h.inSource=false;f.tick(now+=1000/60);
 assert.notEqual(nightClockReadout(f.save).value,'  :  ');
 for(let i=0;i<120;i++)f.tick(now+=1000/60);
 assert.ok(f.save.nightClock.elapsedSeconds>entered+1.9&&f.save.nightClock.elapsedSeconds<entered+2.3,'running in Source banked no travel for the walk out');
});

test('after Source the night runs at one fixed pace however far the player walks, so 05:38 to 06:01 is 15:20 of play',()=>{
 const pace=NIGHT_CLOCK_PACE_POLICY.finalStretchRate;assert.equal(pace,1.5);
 const f=host();let now=0;f.tick(now);
 for(let i=0;i<300;i++){recordNightClockTravel(.055);f.tick(now+=1000/60);}
 assert.ok(f.save.nightClock.rate>2.9,'walking before Source still runs at 3x');
 const left=leaveSourceNightClock(f.save.nightClock).clock;f.save.nightClock={...left,rate:f.save.nightClock.rate};
 f.tick(now+=1000/60);
 assert.equal(f.save.nightClock.rate,pace,'the walking pace is dropped at the door, not eased out of');
 for(const walking of[true,false]){
  const from=f.save.nightClock.elapsedSeconds;
  for(let i=0;i<600;i++){if(walking)recordNightClockTravel(.055);f.tick(now+=1000/60);}
  assert.equal(f.save.nightClock.rate,pace);
  assert.ok(Math.abs(f.save.nightClock.elapsedSeconds-from-15)<.001,(walking?'running':'standing')+' for ten seconds is fifteen seconds of night');
 }
 f.record(true);const during=f.save.nightClock.elapsedSeconds;for(let i=0;i<60;i++)f.tick(now+=1000/60);f.record(false);
 assert.ok(Math.abs(f.save.nightClock.elapsedSeconds-during-1.5)<.001,'a take runs at the same pace');
 const seconds=(NIGHT_DEADLINE_SECONDS-NIGHT_CLOCK_SOURCE_EXIT_SECONDS)/pace;
 assert.equal(seconds,15*60+20);
 const f2=host();let then=0;f2.tick(then);f2.save.nightClock={...leaveSourceNightClock(f2.save.nightClock).clock};
 for(let i=0;i<seconds*60;i++){recordNightClockTravel(.055);f2.tick(then+=1000/60);}
 assert.ok(Math.abs(f2.save.nightClock.elapsedSeconds-NIGHT_DEADLINE_SECONDS)<.01,'running the whole way still takes all of it');
 for(let i=0;i<60;i++)f2.tick(then+=1000/60);
 assert.equal(nightClockReadout(f2.save).value,'06:01');
});

test('a finale that has taken over stops the live clock at 06:00, and an armed night runs on to the strike',()=>{
 const f=host();let now=0;f.tick(now);
 f.save.nightClock=freshNightClock({elapsedSeconds:NIGHT_DEADLINE_SECONDS-1.5});f.save.nightDeadline={phase:'superseded'};
 for(let i=0;i<240;i++)f.tick(now+=1000/60);
 assert.equal(f.save.nightClock.elapsedSeconds,NIGHT_DEADLINE_SECONDS-1);assert.equal(nightClockReadout(f.save).value,'06:00');
 f.save.nightDeadline={phase:'warning'};
 for(let i=0;i<240;i++)f.tick(now+=1000/60);
 assert.ok(f.save.nightClock.elapsedSeconds>NIGHT_DEADLINE_SECONDS);assert.equal(nightClockReadout(f.save).value,'06:01');
});

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

test('the actual host counts the same active night at15,30,60FPS and through foreground render hitches',()=>{
 const play=(pattern,{moving=false,source=false,final=false}={})=>{
  const f=host();let now=0;f.h.inSource=source;if(final)f.save.nightClock=leaveSourceNightClock(f.save.nightClock).clock;f.tick(now);
  let frame=0;while(now<12000-1e-6){const milliseconds=Math.min(pattern[frame++%pattern.length],12000-now);if(moving)recordNightClockTravel(milliseconds/1000*2.6);f.tick(now+=milliseconds);}
  return f.save;
 };
 for(const settings of [{},{moving:true},{final:true,moving:true},{source:true,moving:true}]){
  const reference=play([1000/60],settings);
  for(const pattern of [[1000/30],[1000/15],[1000/60,1000/60,500],[1000/60,900,1000/30]]){
   const save=play(pattern,settings);
   assert.ok(Math.abs(save.playDuration.seconds-12)<1e-8,'actual presented duration never inherits the50ms simulation cap');
   assert.ok(Math.abs(save.nightClock.elapsedSeconds-reference.nightClock.elapsedSeconds)<1e-8,JSON.stringify({settings,pattern,elapsed:save.nightClock.elapsedSeconds,reference:reference.nightClock.elapsedSeconds}));
  }
 }
});

test('an accepted-travel hitch cannot bank clock movement through pause, stopped input or Source',()=>{
 const f=host();let now=0;f.tick(now);recordNightClockTravel(2);f.tick(now+=800);
 const before=f.save.nightClock.elapsedSeconds;f.h.paused=true;recordNightClockTravel(3);f.tick(now+=8000);f.h.paused=false;f.tick(now+=8000);
 assert.equal(f.save.nightClock.elapsedSeconds,before,'neither pause edge counts the unpresented gap');
 for(let i=0;i<600;i++)f.tick(now+=1000/60);
 assert.ok(f.save.nightClock.rate<1.0001,'no new accepted travel settles back to rest');
 f.h.inSource=true;recordNightClockTravel(1);const held=f.save.nightClock.elapsedSeconds;f.tick(now+=500);f.h.inSource=false;f.tick(now+=500);
 assert.ok(Math.abs(f.save.nightClock.elapsedSeconds-held-.5)<.0001,'Source travel never accelerates the return interval');
});
