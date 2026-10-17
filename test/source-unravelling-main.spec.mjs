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

test('speech and an embodied choice allow world decay, while pause, a world block, and hiding freeze it',()=>{
  const elapsed=[],mixed=[],order=[];
  let generation=0,blocksWorld=false;
  const sandbox={
    usingSourceSpace:()=>true,paused:false,document:{hidden:false},px:12,py:-2200,
    scenes:{blocksInput:()=>true,blocksWorld:()=>blocksWorld},SPEECH:{isSpeaking:()=>true},
    chunkSurfRuntime:{
      bellsFrame:()=>({active:false}),setPlayerPosition(){},
      horizonFrame:()=>({active:true,generation,unravelling:{active:true}}),
      tickHorizon(dt){elapsed.push(dt);generation++;order.push('world');},
    },
    R3:{r3dFacing:()=>0},endSourceHaystackMosh(){},endSourceBracketPresence(){},tickTowerPersonal:()=>false,
    PRES:{isActive:()=>false},sourceFearFloor:0,
    tickHorizonScore(frame){mixed.push(frame.generation);order.push('score');},
    speakHorizonMarker(){},syncOutskirtsNight(){order.push('street');},tickPayphone(){},syncSourceRender(){order.push('render');},
  };
  const api=execute(productionSection('function tickSourceSpace(dt){','\nlet stairAnomalyEnteredAt='),sandbox,'{tickSourceSpace}');
  api.tickSourceSpace(.2);
  assert.equal(elapsed[0],.2,'listening or an input-only choice does not stop cumulative loss');
  assert.deepEqual(mixed,[1],'the score receives the frame recomputed after decay');
  assert.deepEqual(order,['world','score','street','render']);
  sandbox.paused=true;api.tickSourceSpace(.2);sandbox.paused=false;
  blocksWorld=true;api.tickSourceSpace(.2);blocksWorld=false;
  sandbox.document.hidden=true;api.tickSourceSpace(.2);
  assert.deepEqual(elapsed,[.2,0,0,0]);
});

test('both portrait conversations are presented with the embodied street visible',()=>{
  const shown=[];
  const sandbox={chunkSurfRuntime:{},horizonBustRefusalTree:()=>({refusal:true}),
    horizonBustProposition:()=>({accepted:{lines:[]},declined:{lines:[]},questions:{choices:[]},decision:{choices:[]}}),
    presentFinale:(tree,options)=>shown.push({tree,options})};
  const api=execute(productionSection('function openHorizonBustRefusal(){','\n// THREADING THE TRANSPORT.'),sandbox,'{openHorizonBustRefusal,openHorizonBustChoice}');
  assert.equal(api.openHorizonBustRefusal(),true);assert.equal(api.openHorizonBustChoice(),true);
  assert.equal(shown.length,2);
  for(const {options} of shown)assert.equal(options.embodied,true,'the conversation must not obscure the changing world');
});
