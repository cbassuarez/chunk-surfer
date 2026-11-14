import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeChunkSurfState,SOURCE_FINALE_STAGE as STAGE,SOURCE_FINALE_ROUTE as ROUTE} from '../src/game/chunk-surf-state.js';
import {HORIZON_APPROACH_EVENT} from '../src/game/horizon-approach-scene.js';

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

const deferred=()=>{let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});return{promise,resolve,reject};};
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function crossingFixture(){
  const calls=[],stack=[],pending=[],renderer={dispose(){calls.push('dispose');}};
  const context=vm.createContext({
    horizonApproachPending:false,firstStrikeScene:null,chunkSurfRuntime:{},horizonApproachRenderer:renderer,
    horizonApproachScene:()=>null,
    scenes:{push(scene){stack.push(scene);},remove(scene){const i=stack.indexOf(scene);if(i>=0){stack.splice(i,1);scene.exit?.();}}},
    resetMotionInput(reason){calls.push(reason);},
    warmHorizonApproach(){const next=deferred();pending.push(next);return next.promise;},
    beginHorizonApproach(options){calls.push({approach:structuredClone(options)});return true;},
    startNeural(){assert.fail('the Horizon crossing must not wait for a field-light peak');},
    visualEffectsEnabled:()=>true,uiSize:()=>({cols:120,rows:40}),uiFill(){},uiCenter(){},
    BINDINGS:{promptLine:()=> 'E RETRY'},pushEvent:line=>calls.push(line),console:{error(){}},
  });
  vm.runInContext(actualFunction('beginHorizonInterruption'),context);
  return{context,calls,stack,pending};
}

test('the actual Horizon crossing opens on renderer readiness without a neural peak callback',async()=>{
  const f=crossingFixture();
  assert.equal(f.context.beginHorizonInterruption({returning:true,defeats:2}),true);
  assert.equal(f.stack.at(-1).id,'horizon-crossing');assert.equal(f.context.horizonApproachPending,true);
  assert.equal(f.pending.length,1);assert.equal(f.calls.some(call=>call?.approach),false,'preparing is not arrival');
  assert.equal(f.context.beginHorizonInterruption(),true);assert.equal(f.pending.length,1,'one crossing owns preparation');
  f.pending[0].resolve();await settle();
  assert.equal(f.context.horizonApproachPending,false);assert.equal(f.stack.length,0);
  assert.deepEqual(f.calls.filter(call=>call?.approach),[{approach:{live:true,returning:true,defeats:2}}]);
});

test('a failed Horizon warm keeps its real retry and the retry opens without a light callback',async()=>{
  const f=crossingFixture();f.context.beginHorizonInterruption({returning:true,defeats:3});
  f.pending[0].reject(new Error('fixture renderer unavailable'));await settle();
  const failed=f.stack.at(-1);assert.equal(failed.id,'horizon-crossing');assert.equal(f.context.horizonApproachPending,false);
  assert.equal(f.calls.some(call=>call?.approach),false);assert.equal(failed.key({key:'Escape'}),false);
  assert.equal(failed.key({key:'e'}),true);assert.ok(f.calls.includes('dispose'));
  assert.notEqual(f.stack.at(-1),failed);assert.equal(f.pending.length,2);assert.equal(f.context.horizonApproachPending,true);
  f.pending[1].resolve();await settle();
  assert.equal(f.stack.length,0);assert.equal(f.context.horizonApproachPending,false);
  assert.deepEqual(f.calls.filter(call=>call?.approach),[{approach:{live:true,returning:true,defeats:3}}]);
});

test('a retired crossing cannot open the Horizon when its old preparation later completes',async()=>{
  const f=crossingFixture();f.context.beginHorizonInterruption();
  f.context.scenes.remove(f.stack.at(-1));assert.equal(f.context.horizonApproachPending,false);
  f.pending[0].resolve();await settle();
  assert.equal(f.calls.some(call=>call?.approach),false);assert.equal(f.stack.length,0);
});

function departureFixture(){
  const calls=[],stack=[],point={x:44,y:91,facing:2},save={chunkSurf:{phase:'horizon'},flags:{}},cache={physicalKey:'old',physicalGroup:'horizon',fogSize:42};
  let options;
  const runtime={
    recognizeHorizonApproach(value){calls.push({recognize:structuredClone(value)});},
    decideHorizonApproach(tower){calls.push({decide:tower});return{handled:true};},
    chooseHorizonExit(exit){calls.push({choose:exit});return{handled:true};},
    checkpointPosition:()=>point,setPlayerPosition:value=>calls.push({place:structuredClone(value)}),state:()=>save.chunkSurf,
  };
  const context=vm.createContext({
    firstStrikeScene:null,horizonApproachRenderer:{},horizonApproachScene:()=>null,
    HORIZON_APPROACH_SAVE:'horizon.approach.state',HORIZON_APPROACH_EVENT,chunkSurfRuntime:runtime,
    getSave:()=>save,flagGet:()=>null,flagSet:(key,value)=>calls.push({persist:key,value:structuredClone(value)}),
    horizonApproachSelection:()=>({occupant:'daisy',condition:false,lyleBox:null}),
    resetMotionInput:reason=>calls.push(reason),STORY:{stopAll(){}},SPEECH:{clearSpeech:()=>calls.push('clear-speech')},
    stopAllVoices(){},stopWorldLayerVoice(){},silenceAmbientDrone(){},RT:{setBed(){}},
    createHorizonApproachScene(value){
      options=value;
      return{id:'horizon-approach',serialize:()=>({returning:value.returning,defeats:value.defeats}),
        view:()=>({state:{occupant:value.occupant,returning:value.returning,defeats:value.defeats}}),
        update(){},pause(){},resume(){},initialize:()=>Promise.resolve(true)};
    },
    scenes:{push(scene){stack.push(scene);},remove(scene){const at=stack.indexOf(scene);if(at>=0){stack.splice(at,1);calls.push('remove');options.onExit();}}},
    ensureInteractionFocus:()=>calls.push('focus'),pushEvent:line=>calls.push(line),
    startNeural(){assert.fail('Horizon departure must invoke its actual destination without a field-light callback');},
    visualEffectsEnabled:()=>true,resumeHorizonCathedralFight:()=>{assert.equal(stack.length,0);calls.push('cathedral-fight');return true;},
    px:0,py:0,renderMove:{},motionRig:{},trail:['old'],r3dCache:cache,
    R3:{r3dSetFacing:facing=>calls.push({facing})},saveCommit:value=>{Object.assign(save,value);calls.push('commit');},
    syncSourceRender:value=>calls.push({source:structuredClone(value)}),
  });
  vm.runInContext(actualFunction('arriveFromHorizonApproach')+'\n'+actualFunction('beginHorizonApproach'),context);
  return{context,calls,stack,point,save,cache,event:type=>options.onEvent({type})};
}

test('both actual live Horizon decision callbacks immediately restore their chosen Source destination',()=>{
  for(const[type,exit,tower]of[[HORIZON_APPROACH_EVENT.ACCEPTED,'tower',true],[HORIZON_APPROACH_EVENT.DECLINED,'chapel',false]]){
    const f=departureFixture(),scene=f.context.beginHorizonApproach({live:true});
    f.calls.length=0;f.event(type);
    assert.ok(f.calls.some(call=>call?.decide===tower));assert.ok(f.calls.some(call=>call?.choose===exit));
    assert.deepEqual(f.calls.find(call=>call?.place),{place:f.point});
    assert.equal(f.save.area,'source-space');assert.deepEqual([f.save.px,f.save.py],[f.point.x,f.point.y]);
    assert.ok(f.calls.some(call=>call?.source?.force));assert.ok(f.calls.includes('horizon-arrival'));
    assert.equal(f.stack.length,0);assert.equal(scene.approachProgress().closing,true);
    assert.deepEqual([f.cache.physicalKey,f.cache.physicalGroup],[null,null]);
    f.event(type);
    assert.equal(f.calls.filter(call=>call?.choose===exit).length,1,'a duplicate event cannot depart twice');
  }
});

test('the actual accepted Horizon return callback resumes its cathedral fight without a light callback',()=>{
  const f=departureFixture();f.context.beginHorizonApproach({live:true,returning:true,defeats:2});
  f.calls.length=0;f.event(HORIZON_APPROACH_EVENT.ACCEPTED);
  assert.equal(f.calls.filter(call=>call==='cathedral-fight').length,1);
  assert.equal(f.calls.some(call=>call?.decide!==undefined||call?.choose),false,'a return does not choose a fresh route');
  assert.equal(f.stack.length,0);
});

test('a non-live Horizon preview releases its borrowed scene without a field transition',()=>{
  const f=departureFixture();f.context.beginHorizonApproach({live:false});
  f.calls.length=0;f.event(HORIZON_APPROACH_EVENT.DECLINED);
  assert.equal(f.stack.length,0);assert.ok(f.calls.some(call=>call?.source?.force));
  assert.equal(f.calls.some(call=>call?.choose||call==='cathedral-fight'),false);
});
