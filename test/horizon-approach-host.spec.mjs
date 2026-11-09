import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeChunkSurfState,SOURCE_FINALE_STAGE as STAGE,SOURCE_FINALE_ROUTE as ROUTE} from '../src/game/chunk-surf-state.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function actualFunction(name){
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n}',start);
  assert.ok(start>=0&&end>start,`${name} must remain an actual host boundary`);
  return source.slice(start,end+2);
}
const hostSource=['resumeHorizonCathedralFight','resumeHorizonReturnFromSave'].map(actualFunction).join('\n');
function fixture({saved={returning:true,defeats:1,decided:null},defeats=1,stage=STAGE.CATHEDRAL,battleResult=true}={}){
  const state=normalizeChunkSurfState();
  state.finale={...state.finale,stage,route:ROUTE.TOWER,bust:{...state.finale.bust,recognized:true,decision:'accepted',defeats}};
  const save={chunkSurf:state},calls=[],cache={physicalKey:'cathedral-old',physicalGroup:'ground',fogSize:1024},world={plan:'horizon-local',doors:false,input:false,camera:false,vfd:false};
  const context=vm.createContext({
    HORIZON_APPROACH_SAVE:'horizon.approach.state',SOURCE_FINALE_STAGE:STAGE,
    flagGet:key=>key==='horizon.approach.state'?{scene:saved}:undefined,
    getSave:()=>save,normalizeChunkSurfState,r3dCache:cache,
    syncBuildingRender(){assert.deepEqual(cache,{physicalKey:null,physicalGroup:null,fogSize:-1});world.plan='cathedral';calls.push('building');},
    syncDoorDynamicProps(){assert.equal(world.plan,'cathedral');world.doors=true;calls.push('doors');},
    resetMotionInput(reason,options){assert.equal(reason,'horizon-cathedral-return');assert.equal(options.stopRenderMove,true);world.input=true;calls.push('input');},
    R3:{r3dSnapCameraOnNextFrame(){world.camera=true;calls.push('camera');},r3dResetVfdMemory(){world.vfd=true;calls.push('vfd');}},
    openCathedralFirstPhase(){assert.deepEqual(world,{plan:'cathedral',doors:true,input:true,camera:true,vfd:true});calls.push('battle');return battleResult;},
    beginHorizonInterruption(options){calls.push({offer:structuredClone(options)});return true;},
  });
  vm.runInContext(hostSource,context);
  return{context,calls,cache,world,save};
}

test('actual retry host restores ordinary geometry, doors, input and camera before the fight',()=>{
  const f=fixture();assert.equal(f.context.resumeHorizonCathedralFight(),true);
  assert.deepEqual(f.calls,['building','doors','input','camera','vfd','battle']);
});
test('a saved accepted retry completes the fight transition without replaying its offer',()=>{
  const f=fixture({saved:{returning:true,defeats:1,decided:'accepted'}}),before=JSON.stringify(f.save);
  assert.equal(f.context.resumeHorizonReturnFromSave(),true);
  assert.deepEqual(f.calls,['building','doors','input','camera','vfd','battle']);
  assert.equal(JSON.stringify(f.save),before,'the resume bridge does not invent another loss');
});
test('an unfinished matching return resumes its existing attempt instead of opening the fight',()=>{
  for(const defeats of [1,2]){
    const f=fixture({saved:{returning:true,defeats,decided:null},defeats});
    assert.equal(f.context.resumeHorizonReturnFromSave(),true);
    assert.deepEqual(f.calls,[{offer:{returning:true,defeats}}]);
    assert.equal(f.world.plan,'horizon-local');
  }
});
test('stale, unrelated and already advanced saves cannot redirect normal continuation',()=>{
  const cases=[
    {saved:null},
    {saved:{returning:false,defeats:1,decided:null}},
    {saved:{returning:true,defeats:0,decided:null}},
    {saved:{returning:true,defeats:2,decided:'accepted'},defeats:1},
    {saved:{returning:true,defeats:1,decided:'declined'}},
    {saved:{returning:true,defeats:1,decided:'other'}},
    {stage:STAGE.CATHEDRAL_FIGHT},
    {stage:STAGE.TOWER_ESCAPE},
    {stage:STAGE.RESOLVED},
  ];
  for(const value of cases){const f=fixture(value);assert.equal(f.context.resumeHorizonReturnFromSave(),false,JSON.stringify(value));assert.deepEqual(f.calls,[]);}
});
test('the actual accepted-retry bridge returns the fight opener result',()=>{
  const f=fixture({saved:{returning:true,defeats:1,decided:'accepted'},battleResult:false});
  assert.equal(f.context.resumeHorizonReturnFromSave(),false);assert.equal(f.calls.at(-1),'battle');
});
