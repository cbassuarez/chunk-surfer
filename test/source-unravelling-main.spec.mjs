import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function productionSection(from,to){
  const begin=main.indexOf(from),end=main.indexOf(to,begin);
  assert.ok(begin>=0&&end>begin,`production section exists: ${from}`);
  return main.slice(begin,end);
}
function execute(section,sandbox,expose){
  vm.createContext(sandbox);
  vm.runInContext(section+'\nglobalThis.api='+expose+';',sandbox,{filename:'src/main.js'});
  return sandbox.api;
}

function flurryHarness(active){
  let composure=12,clock=100000;
  const drains=[],flurry=[];
  const sandbox={
    chunkSurfRuntime:{horizonFrame:()=>({unravelling:{active}}),outskirtsPassAt:()=>24,setOutskirtsFlurry:value=>flurry.push(value)},
    tickPhoneWorld(){},payphoneLoopHolds:()=>false,PAYPHONE_PASS:{loop:10},flagGet:()=>false,
    payphoneIncomingForPass:()=>null,preparePayphoneRoadLoop(){},
    phoneWorld:{box:null},payphoneScene:null,SARAH_PAGE:{flurryFrom:15},performance:{now:()=>clock},
    REC:{COMPOSURE_FLOOR:0,composure:()=>composure,setComposure(value){composure=value;drains.push(value);}},
  };
  const api=execute(productionSection('let phoneFlurry=0,phoneFlurryDrainAt=0,phoneFlurryProbeOff=false;','\n// WHOSE PAGES.'),sandbox,
    '{syncPayphoneRoad,seed(value,next){phoneFlurry=value;phoneFlurryDrainAt=next;},snapshot:()=>({phoneFlurry,phoneFlurryDrainAt})}');
  return {api,drains,flurry,get composure(){return composure;},advance(ms){clock+=ms;}};
}

test('stale telephone-page flurry fades without punishing time spent in the unravelling street',()=>{
  const h=flurryHarness(true);h.api.seed(.8,0);
  h.api.syncPayphoneRoad({along:100});
  assert.ok(h.flurry[0]>.2,'the visible tail is still present, so absence of damage is not merely absence of flurry');
  assert.ok(h.flurry[0]<.8,'the inherited flurry eases away');
  for(let i=0;i<120;i++){h.advance(1000);h.api.syncPayphoneRoad({along:100});}
  assert.equal(h.composure,12);assert.deepEqual(h.drains,[]);
  assert.equal(h.flurry.at(-1),0);assert.equal(h.api.snapshot().phoneFlurryDrainAt,0);
});

test('the earlier telephone passage retains its authored flurry cost',()=>{
  const h=flurryHarness(false);h.api.seed(.8,0);
  h.api.syncPayphoneRoad({along:100});
  assert.ok(h.flurry[0]>.8);assert.equal(h.composure,11);assert.deepEqual(h.drains,[11]);
  assert.ok(h.api.snapshot().phoneFlurryDrainAt>100);
  h.api.syncPayphoneRoad({along:100});
  assert.equal(h.composure,11,'the existing cooldown still prevents a drain every render tick');
  h.advance(5000);h.api.syncPayphoneRoad({along:100});assert.equal(h.composure,10);
});

test('the retained street updates people and the phone, then crosses only at the far edge',()=>{
  const characters=[],order=[];
  let due=false,blocksWorld=false,blocksInput=true,focused=true;
  const sandbox={
    usingSourceSpace:()=>true,paused:false,hushRunActive:false,
    document:{hidden:false,hasFocus:()=>focused},px:12,py:-2200,
    scenes:{blocksInput:()=>blocksInput,blocksWorld:()=>blocksWorld},
    firstStrikeScene:null,horizonApproachPending:false,
    beginHorizonInterruption(){order.push('crossing');},
    chunkSurfRuntime:{
      bellsFrame:()=>({active:false}),setPlayerPosition(){order.push('position');},
      horizonFrame:()=>({active:true,preTape:true}),horizonApproachDue:()=>due,
      tickOutskirtsCharacters(dt,options){characters.push({dt,...options});order.push('characters');},
    },
    R3:{r3dFacing:()=>0,r3dLookAngles:()=>({yaw:.4,pitch:-.2})},
    endSourceHaystackMosh(){},endSourceBracketPresence(){},tickTowerPersonal:()=>false,
    PRES:{isActive:()=>false},sourceFearFloor:0,shakeMode:()=> 'full',
    preparePayphoneRoadLoop(){order.push('prepare');},syncOutskirtsNight(){order.push('street');},
    tickPayphone(dt){assert.equal(dt,.2);order.push('phone');},syncSourceRender(){order.push('render');},
  };
  const api=execute(productionSection('function tickSourceSpace(dt){','\nlet stairAnomalyEnteredAt='),sandbox,'{tickSourceSpace}');
  api.tickSourceSpace(.2);
  assert.deepEqual(order,['position','prepare','characters','street','phone','render']);
  assert.deepEqual(characters[0],{dt:.2,viewYaw:.4,pitch:-.2,reducedMotion:false,suspended:false});
  for(const change of ['paused','world','hidden','focus']){
    sandbox.paused=change==='paused';blocksWorld=change==='world';
    sandbox.document.hidden=change==='hidden';focused=change!=='focus';
    api.tickSourceSpace(.2);
    assert.equal(characters.at(-1).suspended,true,change);
  }
  sandbox.paused=false;blocksWorld=false;sandbox.document.hidden=false;focused=true;
  due=true;order.length=0;api.tickSourceSpace(.2);
  assert.deepEqual(order,[],'an input scene delays the crossing without advancing the street');
  blocksInput=false;api.tickSourceSpace(.2);
  assert.deepEqual(order,['crossing'],'walking to the far edge starts the approach without an interaction');
  for(const flag of ['firstStrikeScene','horizonApproachPending']){
    sandbox[flag]=true;order.length=0;api.tickSourceSpace(.2);
    assert.deepEqual(order,[],'an existing crossing cannot be opened twice');sandbox[flag]=null;
  }
});
