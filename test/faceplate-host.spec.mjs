import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nightClockReadout,freshNightClock} from '../src/game/night-clock.js';
import {mapAcquired,mapAvailable} from '../src/game/map-ownership.js';
import {workOrderAccepted} from '../src/game/work-order-state.js';
import {readOnlyBagMap} from '../src/game/bag-model.js';
import {FRONT_END_STATE} from '../src/game/front-end-session.js';
import {faceplateModulesEligible,beginFaceplateModuleState,faceplateUsesCurrentRunModules} from '../src/render/faceplate-module-state.js';

// Exercise the actual host decision, with only its world/audio/save sources
// replaced. This is CPU ownership evidence, not a substitute for native ink,
// final overlay composition or physical pointer acceptance.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
// Match the declaration name, not its parameter spelling. Execute the entire
// original declaration below; calling with no arguments preserves authored
// optional/default parameter behavior.
const start=/^function\s+sharedFaceplateContext\s*\(/m.exec(main)?.index??-1;
const end=main.indexOf('\nfunction drawStoryHud()',start);
assert.ok(start>=0&&end>start,'production shared faceplate host is available');
const hostBody=main.slice(start,end);
const filmOwners=['openingVehicleScene','openingOvertureScene','studentStrikeScene','activeEndingCutscene',
  'standingTearScene','sourceDriveSession','coastalMemoryScene','sourceReturnFlashbackScene','firstStrikeScene'];
const realFaceplateIds=['pause','settings','controller-settings','bag','field-map','thought:odette','dialogue:guard',
  'battle:guard','radio:desk','recorder','payphone','b3-console','tower-tenor-performance','academic-bouncers',
  'doc:field-note','object-detail:cup'];
const fixtureMap=()=>({context:'exterior',player:{resolved:true,floorId:'district',position:{x:12,y:14},heading:.7},
  floors:[{id:'district',label:'DISTRICT',order:0,open:new Set()}],policy:{showMap:true,showMapTopology:true},
  spaces:[{id:'public:lyric',floorId:'district',position:{x:14,y:16},waypoint:true,waypointable:true}],
  playerWaypoint:{spaceId:'public:lyric'},waypoint:{spaceId:'public:lyric',floorId:'district',position:{x:14,y:16}},
  route:{status:'ready',points:[{x:12,y:14},{x:14,y:16}]},contacts:[]});

function host(){
  const save={run:{id:'host-faceplate-run',status:'active'},flags:{'bag.taken':true,'map.taken':true,'work-order.accepted':true},
    nightClock:freshNightClock({elapsedSeconds:300})};
  const h={save,top:null,map:fixtureMap(),now:4200,missing:false,focused:true,special:false,worldHidden:false,
    roof:false,warning:false,mapReads:0,storyMode:true,inRogue:true,paused:false,document:{hidden:false},px:12,py:14,
    frontEndSession:null,FRONT_END_STATE,activeDifficulty:{navigation:{showMap:true}},dockCommandUntil:0,
    rec:{takes:['studio','hall'],injuries:1},monitor:{available:false,sourceId:'host-faceplate-monitor'},
    getSave:()=>save,lastExposureEvent:null,mapAcquired,mapAvailable,nightClockReadout,workOrderAccepted,readOnlyBagMap,faceplateUsesCurrentRunModules};
  h.scenes={top:()=>h.top,blocksWorld:()=>h.top?.blocksWorld===true};
  h.FP={isLoaded:()=>true,logicalToPhysical:()=>({renderGroup:h.roof?'academicRoof':'district'})};
  h.usingSpecialSpace=()=>h.special;h.towerWarningOwnsMoment=()=>h.warning;
  h.scenePresentationHidesWorld=()=>h.worldHidden;h.flagTest=key=>!!save.flags[key];h.itemLost=()=>h.missing;
  h.REC={recState:()=>h.rec};h.currentFacilityMapModel=()=>{h.mapReads++;return h.map;};
  h.performance={now:()=>h.now};h.gameplayInputLifecycleActive=()=>h.focused;
  h.recentMischief=()=>null;h.recentApparitions=()=>null;h.monitorDisplaySnapshot=()=>h.monitor;
  for(const owner of filmOwners)h[owner]=null;
  vm.createContext(h);vm.runInContext(hostBody,h);
  return{h,save,context:()=>vm.runInContext('sharedFaceplateContext()',h)};
}
const frame=context=>beginFaceplateModuleState(context,{cols:80,rows:45});

test('ordinary host supplies the live current-run map, canonical night reading and accepted-work telemetry',()=>{
  const f=host(),snapshot=f.context();
  assert.equal(faceplateModulesEligible(snapshot),true);assert.equal(snapshot.runId,f.save.run.id);
  assert.equal(snapshot.map,f.h.map);assert.deepEqual(snapshot.nightClock,nightClockReadout(f.save));
  assert.equal(snapshot.now,4200);assert.equal(snapshot.held,false);assert.equal(snapshot.navigationVisible,true);
  assert.equal(snapshot.telemetry.monitor,f.h.monitor);assert.equal(snapshot.telemetry.takes,2);
  assert.equal(snapshot.telemetry.injuries,1);assert.equal(snapshot.telemetry.takesEnabled,true);
  delete f.save.flags['work-order.accepted'];assert.equal(f.context().telemetry.takesEnabled,false);
  for(const hold of['pause','hidden','focus','blocking-panel']){
    f.h.paused=hold==='pause';f.h.document.hidden=hold==='hidden';f.h.focused=hold!=='focus';
    f.h.top=hold==='blocking-panel'?{id:'bag',blocksInput:true,blocksWorld:true}:null;f.h.now+=1000;
    const held=f.context();assert.equal(held.held,true,hold);
    assert.deepEqual(held.nightClock,snapshot.nightClock,'overlay never invents a second advancing clock');
    assert.equal(frame(held).context.telemetry.paused,true);
  }
});

test('host public preview is read-only survey data with canonical personal target and route removed',()=>{
  const f=host();f.save.flags={};f.h.top={id:'field-map',blocksInput:true,blocksWorld:true};
  const before=structuredClone(f.h.map),saveBefore=structuredClone(f.save),snapshot=f.context();
  assert.equal(faceplateModulesEligible(snapshot),true);assert.equal(snapshot.mapStatus,'PUBLIC PLAN');
  assert.equal(snapshot.navigationVisible,true);assert.equal(snapshot.map.policy.readOnly,true);
  assert.equal(snapshot.map.playerWaypoint,null);assert.equal(snapshot.map.waypoint,null);assert.equal(snapshot.map.route,null);
  assert.ok(snapshot.map.spaces.every(space=>!space.waypoint&&space.waypointable===false));
  assert.equal(snapshot.telemetry.takesEnabled,false);
  assert.deepEqual(f.h.map,before);assert.deepEqual(f.save,saveBefore,'viewing preview grants no equipment or shift state');
  f.save.flags['map.taken']=true;f.h.missing=true;
  const lost=f.context();assert.equal(lost.navigationVisible,false);assert.equal(lost.mapStatus,'PLAN MISSING');
  assert.equal(lost.map,f.h.map,'owned-map loss never downgrades to an unrestricted public preview');
});

test('HUD-suppressing instruments retain shared modules with their actual live or held world semantics',()=>{
  for(const [id,blocksWorld]of[['recorder',false],['radio:desk',true],['tower-tenor-performance',false],['b3-console',false],['doc:field-note',false]]){
    const f=host();f.h.top={id,blocksInput:true,blocksWorld,suppressesHud:true};
    const snapshot=f.context();assert.equal(faceplateModulesEligible(snapshot),true,id);
    assert.equal(snapshot.held,blocksWorld,id+' existing world-clock contract');
    assert.deepEqual(snapshot.nightClock,nightClockReadout(f.save));
  }
});

test('the actual film owns a full frame while genuine menu faceplates above it receive held instruments',()=>{
  for(const owner of filmOwners){
    const f=host();f.h[owner]={id:owner};f.h.worldHidden=true;
    f.h.top={id:owner==='studentStrikeScene'?'student-strike':'opening-overture',blocksInput:true,blocksWorld:true,suppressesHud:true};
    assert.equal(f.context().enabled,false,owner+' actual film');assert.equal(f.h.mapReads,0);
    for(const id of realFaceplateIds){
      f.h.top={id,blocksInput:true,blocksWorld:true,suppressesHud:true};
      const menu=f.context();assert.equal(faceplateModulesEligible(menu),true,owner+' / '+id);
      assert.equal(menu.held,true);assert.deepEqual(menu.nightClock,nightClockReadout(f.save));
    }
    f.h.top={id:'unidentified-capture',blocksInput:true,blocksWorld:true,suppressesHud:true};
    assert.equal(f.context().enabled,false,'a blocking cinematic is not automatically a menu faceplate');
  }
});

test('title, world-title, archive and historical displays cannot retain phantom current-run instruments',()=>{
  const f=host();
  for(const id of['title','world-title','archive-tapes','history','return-report','credits']){
    f.h.top={id,blocksInput:true};
    const context=f.context();assert.equal(faceplateModulesEligible(context),false,id);
    const disabled=frame(context);assert.equal(disabled.enabled,false);assert.equal(disabled.context,null);
  }
  f.h.top={id:'thought:old-transcript',blocksInput:true};
  const historical={...f.context(),scope:'historical'};
  assert.equal(faceplateModulesEligible(historical),false);assert.equal(frame(historical).context,null);
  for(const run of[null,{id:'ended-run',status:'complete'},{id:'failed-run',status:'failed'}]){
    f.save.run=run;f.h.top={id:'pause',blocksInput:true};assert.equal(f.context().enabled,false);
  }
  const fresh=host();fresh.h.frontEndSession={state:FRONT_END_STATE.TITLE};assert.equal(fresh.context().enabled,false);
});

test('captured Source and roof views retain their framing; real menus alone may borrow the navigator',()=>{
  for(const location of['special','roof']){
    const f=host();f.h[location]=true;
    assert.equal(f.context().enabled,false,location+' ordinary camera');assert.equal(f.h.mapReads,0);
    f.h.top={id:'source-capture',blocksInput:true,blocksWorld:true};assert.equal(f.context().enabled,false);
    for(const id of realFaceplateIds){
      f.h.top={id,blocksInput:true,blocksWorld:true};const menu=f.context();
      assert.equal(faceplateModulesEligible(menu),true,location+' / '+id);assert.equal(menu.held,true);
      assert.equal(menu.map,f.h.map,'host supplies the actual location model rather than a phantom background map');
    }
    f.h.warning=true;assert.equal(f.context().enabled,false,'an owned Tower warning remains full frame');
  }
});

test('the actual host snapshot cannot turn hidden HUSH or acoustic fixes into exact overlay coordinates',()=>{
  const f=host();f.h.top={id:'pause',blocksInput:true,blocksWorld:true};
  f.h.map.hush={active:true,sensed:true,visible:false,floorId:'district',position:{x:24,y:26}};
  f.h.map.contacts=[{id:'old-fix',observation:{position:{x:20,y:22},floorId:'district',observedAt:1000}}];
  let snapshot=frame(f.context());
  assert.equal(snapshot.context.map.hush.position,null);assert.equal(snapshot.context.map.contacts[0].observation.position,null);
  assert.deepEqual(f.h.map.hush.position,{x:24,y:26},'sanitizing display data cannot mutate the authoritative model');
  f.h.map.hush.visible=true;snapshot=frame(f.context());assert.deepEqual(snapshot.context.map.hush.position,{x:24,y:26});
  f.h.map.hush.visible=false;snapshot=frame(f.context());assert.equal(snapshot.context.map.hush.position,null,'losing direct sight removes the fix immediately');
});
