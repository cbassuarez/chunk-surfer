import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function fn(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);if(name==='flushDeferredDoorDynamicProps')return source.slice(start,source.indexOf('\n',start));const end=source.indexOf('\n}',start);assert.ok(end>start,name);return source.slice(start,end+2);}
function harness(){
  const calls=[];
  const c={RENDERER:'3d',storyMode:true,inRogue:true,usingPlan:()=>true,usingSpecialSpace:()=>false,
    FP:{isLoaded:()=>true,logicalToPhysical:()=>({renderGroup:'ground'}),zoneAt:()=>1,tickDoors:()=>[{type:'opened'}],saveDoorState:()=>({door:'open'})},
    ZONE:{street:1,civicCourt:2,dock:3},px:4,py:5,scenePresentationHidesWorld:()=>false,
    scenes:{worldView:()=>null},escape:null,activeEndingCutscene:null,openingVehicleScene:null,roofRenMemoryFoldActive:false,
    chapelRetakeHauntFrame:null,recordingFalseHush:null,doorDynamicRenderPending:false,facilityMapCache:{key:'old'},
    pumpDoorAudioEvents:dt=>calls.push(['audio',dt]),saveCommit:patch=>calls.push(['save',patch]),
    syncDoorDynamicProps:options=>{calls.push(['sync',options?.preflightOnly===true?'preflight':'full']);c.doorDynamicRenderPending=options?.preflightOnly===true;}};
  vm.createContext(c);vm.runInContext([fn('canDeferOutdoorDoorProps'),fn('tickDoorRuntime'),fn('flushDeferredDoorDynamicProps')].join('\n'),c);
  return{c,calls};
}
test('production door tick keeps audio and save while deferring only ordinary outdoor drawing',()=>{
  const {c,calls}=harness();c.tickDoorRuntime(.25);
  assert.deepEqual(calls.map(call=>call[0]),['audio','audio','save','sync']);
  assert.equal(calls.at(-1)[1],'preflight');assert.equal(c.facilityMapCache.key,null);
  assert.equal(c.doorDynamicRenderPending,true);
  c.flushDeferredDoorDynamicProps();assert.equal(calls.at(-1)[1],'full');
  assert.equal(c.doorDynamicRenderPending,false);const count=calls.length;c.flushDeferredDoorDynamicProps();assert.equal(calls.length,count);
});
test('hidden, remote, special, non-outdoor and ending paths retain immediate full sync',()=>{
  const cases=[c=>{c.RENDERER='map';},c=>{c.scenePresentationHidesWorld=()=>true;},
    c=>{c.scenes.worldView=()=>({suppressActors:true});},c=>{c.usingSpecialSpace=()=>true;},
    c=>{c.FP.logicalToPhysical=()=>({renderGroup:'upper'});},c=>{c.FP.zoneAt=()=>99;},
    c=>{c.escape={kind:'cathedral-carry'};},c=>{c.activeEndingCutscene={};},
    c=>{c.openingVehicleScene={};},c=>{c.roofRenMemoryFoldActive=true;},
    c=>{c.chapelRetakeHauntFrame={active:true};},c=>{c.recordingFalseHush={};}];
  for(const setup of cases){const {c,calls}=harness();setup(c);c.tickDoorRuntime(.25);
    if(c.usingSpecialSpace())assert.equal(calls.length,0,'special space owns its separate render');
    else assert.equal(calls.at(-1)[1],'full');
    assert.equal(c.doorDynamicRenderPending,false);
  }
});
test('actual loop render branch flushes a pending submission on hidden and failed frames',()=>{
  const marker=source.indexOf('tickLastExposure(dt);');const end=source.indexOf('// Developer sample-field readouts',marker);
  const block=source.slice(marker,end);assert.ok(marker>=0&&end>marker);
  for(const failure of [false,true]){
    const {c,calls}=harness();c.tickDoorRuntime(.25);
    Object.assign(c,{lastExposureEvent:null,retainHushCatchFrame:()=>{},tickLastExposure:()=>{},tickHushCatchVacuum:()=>{},retainLastExposure:()=>{},frontEndHasNoCamera:()=>false,
      scenePresentationHidesWorld:()=>!failure,render3d:()=>{throw new Error('render failure');},R3:{}});
    vm.runInContext(`function renderBranch(dt){${block}}`,c);
    if(failure)assert.throws(()=>c.renderBranch(.02),/render failure/);else c.renderBranch(.02);
    assert.equal(calls.at(-1)[1],'full');assert.equal(c.doorDynamicRenderPending,false);
  }
});
