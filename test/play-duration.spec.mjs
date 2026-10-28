import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as D from '../src/game/play-duration.js';
import * as SAVE from '../src/game/save.js';
import * as PALETTE from '../src/render/palette.js';
import * as BINDINGS from '../src/game/bindings.js';
import * as TIPS from '../src/game/settings-tips.js';
import * as DISPLAY from '../src/platform/display-policy.js';
import * as DIFFICULTY from '../src/progression/difficulty-defs.js';
import * as PSYCH from '../src/game/psychological-profile.js';
import { achievementEntries } from '../src/progression/achievements.js';
import { returnFileEntries } from '../src/game/second-shift.js';
import { returnDefinition } from '../src/progression/report.js';
import { endingHintForEnding } from '../src/game/post-run-copy.js';
import {shouldOpenPauseForEvent} from '../src/game/pause.js';

const copy=x=>JSON.parse(JSON.stringify(x));

test('fresh measurement and legacy uncertainty remain distinct without using the fictional clock',()=>{
  assert.deepEqual(D.freshPlayDuration(),{schema:1,seconds:0,priorUnmeasured:false});
  for(const bad of [null,{}, {schema:1,seconds:-1},{schema:1,seconds:Infinity}])
    assert.deepEqual(D.normalizePlayDuration(bad),{schema:1,seconds:0,priorUnmeasured:true});
  assert.equal(D.playDurationReadout({playSeconds:999999}).value,'00:00:00');
  assert.equal(D.playDurationReadout({playSeconds:999999}).qualifier,'SINCE UPDATE');
  assert.equal(D.formatPlayDuration(360000.99),'100:00:00');
  assert.equal(D.formatPlayDuration(NaN),'00:00:00');
});

test('the monotonic duration counts actual presented time rather than capped simulation increments',()=>{
  const clock=D.createPlayDurationClock();let record=D.freshPlayDuration();
  const tick=(nowMs,active=true,runId='run:a')=>{const r=clock.update({runId,record,nowMs,active});record=r.record;return r;};
  assert.equal(tick(1000).addedSeconds,0);
  assert.equal(tick(1750).addedSeconds,.75);
  assert.equal(tick(6750).addedSeconds,5);
  assert.equal(record.seconds,5.75);
  assert.equal(tick(6750).addedSeconds,0,'duplicate sample cannot add time');
  assert.equal(tick(6000).addedSeconds,0,'backwards time resets the sample without subtraction');
  assert.equal(tick(7000).addedSeconds,1);
});

test('pause, background, menu and resume edges cannot accumulate an offscreen interval',()=>{
  const clock=D.createPlayDurationClock();let record=D.freshPlayDuration();
  const tick=(nowMs,active)=>{const r=clock.update({runId:'run:a',record,nowMs,active});record=r.record;return r;};
  tick(0,true);tick(1000,true);
  tick(1100,false);tick(901100,false);tick(901200,true);
  assert.equal(record.seconds,1,'held menu/background time is not play duration');
  tick(902200,true);assert.equal(record.seconds,2);
  clock.suspend();tick(5000000,true);assert.equal(record.seconds,2,'lifecycle reset covers suspended animation frames');
  tick(5000250,true);assert.equal(record.seconds,2.25);
});

test('reload and run replacement keep only measured history and cannot borrow another run interval',()=>{
  const clock=D.createPlayDurationClock();const old={schema:1,seconds:91.5,priorUnmeasured:true};
  clock.update({runId:'old',record:old,nowMs:1000,active:true});
  const next=clock.update({runId:'new',record:D.freshPlayDuration(),nowMs:100000,active:true});
  assert.equal(next.record.seconds,0);
  const loaded=D.createPlayDurationClock().update({runId:'old',record:copy(old),nowMs:900000,active:true});
  assert.deepEqual(loaded.record,old);assert.equal(loaded.addedSeconds,0);
  clock.reset();assert.equal(clock.update({runId:'new',record:next.record,nowMs:900000,active:true}).addedSeconds,0);
});

test('production save boundaries preserve measurement and do not backfill prior playSeconds',async()=>{
  const fresh=SAVE.freshSave();assert.deepEqual(fresh.playDuration,D.freshPlayDuration());
  const legacy={...fresh,playSeconds:10000};delete legacy.playDuration;
  await SAVE.withTransientGameState({save:legacy},async()=>{
    assert.deepEqual(SAVE.getSave().playDuration,{schema:1,seconds:0,priorUnmeasured:true});
    SAVE.saveCommit({playDuration:{schema:1,seconds:132.5,priorUnmeasured:true}});
    const serialized=copy(SAVE.getSave());
    assert.equal(serialized.playSeconds,10000);
    assert.equal(serialized.playDuration.seconds,132.5);
    await SAVE.withTransientGameState({save:serialized},async()=>{
      assert.deepEqual(SAVE.getSave().playDuration,serialized.playDuration);
    });
  });
  await SAVE.withTransientGameState({save:fresh},async()=>{
    assert.deepEqual(SAVE.getSave().playDuration,D.freshPlayDuration());
  });
});

function renderSurface(name,save,cols=100){
  const calls=[],hits=[];let popped=0;
  const context={...D,...PALETTE,...BINDINGS,...TIPS,...DISPLAY,...DIFFICULTY,...PSYCH,
    getSave:()=>save,saveCommit:patch=>Object.assign(save,patch),clearSave:()=>{},clearAllData:()=>{},
    scenes:{pop:()=>{popped++;}},AUDIO:{menuBack:()=>{}},achievementEntries,returnFileEntries,returnDefinition,endingHintForEnding,
    formatFps:()=> '60',performance:{now:()=>1000},
    uiSize:()=>({cols,rows:42}),uiFill:()=>{},uiLine:()=>{},uiScrim:()=>{},uiCenter:()=>{},
    uiText:(x,y,text)=>calls.push({x,y,text:String(text)}),uiWrap:(text,width)=>String(text).match(new RegExp(`.{1,${Math.max(1,Math.floor(width))}}`,'g'))||[],
    drawVfdText:(x,y,text)=>calls.push({x,y,text:String(text)}),
    drawVfdRow:(_,row)=>calls.push({x:row.x,y:row.y,text:row.label}),vfdRowStyle:()=>({}),
    createHitRegions:()=>({reset:()=>{},add:entry=>hits.push(entry),isHovered:()=>false}),
    withMachinePanel:(x,y,w,h,options,draw)=>draw({x:x+3,y:y+4,w:w-6,h:h-7}),
  };
  const source=fs.readFileSync(new URL(`../src/game/${name}.js`,import.meta.url),'utf8')
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm,'').replaceAll('export function ','function ');
  vm.createContext(context);vm.runInContext(source,context);
  const scene=name==='settings'?context.makeSettingsScene({initialTab:'memory'}):context.makeArchiveScene({meta:{achievements:{},returns:{records:{},history:[]}}});
  scene.render();return{calls,scene,popped:()=>popped};
}

test('v1 migration retains the missing historical measurement instead of inheriting the fresh default',()=>{
  const previous=globalThis.localStorage;
  const entries=new Map([['chunk-surfer:save:v1',JSON.stringify({version:1,playSeconds:12345,px:1,py:1,flags:{prologueDone:true}})]]);
  globalThis.localStorage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};
  try{
    const loaded=SAVE.saveLoad();
    assert.equal(loaded.save.playSeconds,12345);
    assert.deepEqual(loaded.save.playDuration,{schema:1,seconds:0,priorUnmeasured:true});
  }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

test('actual Settings and Achievements render the same measured duration, independent of fictional penalties',()=>{
  const save={...SAVE.freshSave(),playSeconds:99999,playDuration:{schema:1,seconds:3661.9,priorUnmeasured:false}};
  for(const surface of ['settings','archive']){
    const {calls}=renderSurface(surface,save);
    assert.ok(calls.some(c=>c.text==='CURRENT RUN PLAY TIME  01:01:01'),surface);
    assert.ok(!calls.some(c=>c.text.includes('27:46:39')),surface+' does not render fictional night time');
  }
});

test('legacy duration qualification is visible on both actual surfaces and current save changes update it',()=>{
  const save={...SAVE.freshSave(),playDuration:{schema:1,seconds:65,priorUnmeasured:true}};
  for(const surface of ['settings','archive']){
    save.playDuration.seconds=65;
    const {calls,scene}=renderSurface(surface,save);
    assert.ok(calls.some(c=>c.text==='CURRENT RUN PLAY TIME  00:01:05 · SINCE UPDATE'),surface);
    calls.length=0;save.playDuration.seconds=66;scene.render();
    assert.ok(calls.some(c=>c.text.includes('00:01:06')),surface+' reads the current record');
  }
});

test('compact play-time readouts retain the full counter and the legacy qualifier',()=>{
  const save={playDuration:{schema:1,seconds:3661,priorUnmeasured:true}};
  assert.equal(D.playDurationLine(save,30),'SINCE UPDATE 01:01:01');
  assert.equal(D.playDurationLine(save,20),'UPDATE 01:01:01');
  assert.equal(D.playDurationLine({playDuration:D.freshPlayDuration()},24),'PLAY TIME  00:00:00');
  for(const surface of ['settings','archive']){
    const {calls}=renderSurface(surface,{...SAVE.freshSave(),...save},40);
    assert.ok(calls.some(c=>c.text==='SINCE UPDATE 01:01:01'),surface);
  }
});

test('production main clock excludes menus, pause, native focus loss and terminal runs while counting dialogue/cinematics',()=>{
  const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=main.indexOf('function tickRunPlayDuration('),end=main.indexOf('\n}\n',start)+3;
  assert.ok(start>=0&&end>start);
  const save={...SAVE.freshSave(),run:{id:'duration-host',status:'active'}},menus=new Set();
  const host={getSave:()=>save,runPlayDurationClock:D.createPlayDurationClock(),storyMode:true,inRogue:true,paused:false,
    scenes:{has:id=>menus.has(id)},focused:true,gameplayInputLifecycleActive:()=>host.focused};
  const tick=vm.runInNewContext(`(${main.slice(start,end)})`,host);
  let now=0;tick(now);tick(now+=1000);assert.equal(save.playDuration.seconds,1);
  for(const menu of ['settings','archive','pause','title','opening-credits']){
    menus.add(menu);tick(now+=1000);tick(now+=20000);menus.delete(menu);tick(now+=1000);
    assert.equal(save.playDuration.seconds,1,menu+' cannot add play duration');
  }
  menus.add('thought:dialogue');tick(now+=1000);assert.equal(save.playDuration.seconds,2);
  menus.clear();menus.add('get-in-drive-teaser');tick(now+=1500);assert.equal(save.playDuration.seconds,3.5);
  host.focused=false;tick(now+=1000);tick(now+=50000);host.focused=true;tick(now+=1000);
  assert.equal(save.playDuration.seconds,3.5);
  tick(now+=1000);assert.equal(save.playDuration.seconds,4.5);
  host.paused=true;tick(now+=1000);tick(now+=30000);host.paused=false;tick(now+=1000);
  assert.equal(save.playDuration.seconds,4.5);
  save.playSeconds+=600;tick(now+=1000);assert.equal(save.playDuration.seconds,5.5,'fictional recovery penalty remains separate');
  save.run.status='completed';tick(now+=1000);tick(now+=10000);assert.equal(save.playDuration.seconds,5.5);
});

test('Achievements owns Back before the global pause route and closes in one Escape',()=>{
  const h=renderSurface('archive',SAVE.freshSave());
  assert.equal(shouldOpenPauseForEvent({storyMode:true,key:'Escape',code:'Escape',topSceneId:h.scene.id,localEscape:h.scene.handlesEscape}),false);
  assert.equal(h.scene.key({key:'Escape',code:'Escape'}),true);assert.equal(h.popped(),1);
});
