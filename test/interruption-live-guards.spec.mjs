import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import {memoryFieldDeliveryAllowed} from '../src/game/interruption-director.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('an owed post-take field waits for a safe boundary instead of stealing a chase or deadline',()=>{
  assert.equal(memoryFieldDeliveryAllowed(),false);
  assert.equal(memoryFieldDeliveryAllowed({setup:true}),true);
  for(const cause of['modal','checkoff','recording','listening','paused','escape','deadline','loop','special'])
    assert.equal(memoryFieldDeliveryAllowed({setup:true,[cause]:true}),false,cause);
  assert.equal(memoryFieldDeliveryAllowed({setup:true,pressure:.36}),false);
  assert.equal(memoryFieldDeliveryAllowed({setup:true,pressure:.35}),true);
  const start=main.indexOf('if(s.pending&&memoryFieldDeliveryAllowed('),end=main.indexOf('tickTheBagAndSigns(dt);',start);
  assert.ok(start>=0&&end>start);
  let delivered=0;const state={pending:'second'},context={s:state,memoryFieldDeliveryAllowed,
    setupComplete:()=>true,scenes:{blocksInput:()=>false,has:()=>false},REC:{isRecording:()=>false,isListening:()=>false},paused:false,
    escape:{},nightDeadlineCommitted:()=>false,sixLoopActive:()=>false,usingSpecialSpace:()=>false,
    presentedFearPressure:()=>({overall:0}),beginMemoryField:()=>{delivered++;}};
  const tick=()=>vm.runInNewContext(main.slice(start,end),context);
  tick();assert.equal(state.pending,'second');assert.equal(delivered,0,'escape holds the debt');
  context.escape=null;tick();assert.equal(delivered,1);assert.equal(state.pending,null);
});

test('ordinary world actions have no image, window, cab bleed or false-action director',()=>{
  for(const entry of ['createInterruptionDirector','maybeMemorySeep','showMemorySeep','swallowDeadVerb','maybeUnderWaterSeep','tickCabBleed','tickHaystackPaperOpportunity','startNeural'])
    assert.doesNotMatch(main,new RegExp('\\b'+entry+'\\s*\\('),entry);
  for(const entry of ['seepFor','takeoverFor','deadDoorFor','deadVerbFor','bleedFor'])
    assert.doesNotMatch(main,new RegExp('\\.'+entry+'\\s*\\('),entry);
  assert.doesNotMatch(main,/const realOpenRecorder=openRecorder;/,'ordinary recorder-opening latency is retired');
});

test('original ordinary controls pass through without lottery, swallowed input or delayed callbacks',()=>{
  const start=main.indexOf('const realInspectPropTracked=inspectPropTracked,'),end=main.indexOf('// The bag, on top',start);
  assert.ok(start>0&&end>start);
  const called=[],original=Object.fromEntries(['roll','toggleTorchAction','openBag','interactNatatoriumWater','openRecorder'].map(name=>[name,()=>{called.push(name);return name;}]));
  const context={...original,inspectPropTracked:()=> 'real words',tryDockHauntingDoor:()=>false,
    syncDoorDynamicProps(){},syncChapelTapeRepair(){},stopTake(){},render3d(){},storyMode:true,
    usingSpecialSpace:()=>false,meaningLineFor:()=>null,flagTest:()=>false,flagSet(){},
    lastMinutes:{frame:{meaning:0}},REC:{isRecording:()=>false,recState:()=>({takes:[]})},
    R3:{r3dSetPerception(){}},lastMinutesLook:()=>({}),interceptMemoryFieldDoor:()=>false};
  vm.runInNewContext(main.slice(start,end),context);
  for(const[name,fn]of Object.entries(original)){assert.equal(context[name],fn,name+' keeps its real owner');assert.equal(context[name](),name);}
  assert.equal(called.length,5);
});

test('only the authored third visit can intercept an eligible post-crash door; its return retries the real action',()=>{
  const start=main.indexOf('function doorCanEnterMemoryField('),end=main.indexOf('function syncNeuralHud(',start);
  let special=false,listening=false,crashed=false,seen=false,opened=0,visit=null,after;
  const door={id:'hall-door',state:'closed'};
  const context={storyMode:true,setupComplete:()=>true,usingSpecialSpace:()=>special,GREY_DOOR_ID:'grey',playerKeys:new Set(),
    paused:false,escape:null,nightDeadlineCommitted:()=>false,sixLoopActive:()=>false,
    REC:{isRecording:()=>false,isListening:()=>listening,recState:()=>({takes:[]})},scenes:{blocksInput:()=>false},
    presentedFearPressure:()=>({overall:0}),sixCrashDue:()=>false,getSave:()=>({flags:{}}),dreadAllowed:()=>true,
    FP:{doorState:()=>[door]},SIX_LOOP:{flag:'crashed'},memoryFieldFlag:id=>'field.'+id,
    flagTest:key=>key==='crashed'?crashed:seen,
    beginMemoryField:(id,{onDone})=>{visit=id;after=onDone;return true;},interact:()=>opened++};
  const api=vm.runInNewContext(main.slice(start,end)+'\n({doorCanEnterMemoryField,interceptMemoryFieldDoor})',context);
  const focus={door:{portal:{id:'hall-door'}}};
  assert.equal(api.interceptMemoryFieldDoor(focus),false,'ordinary play never creates a failed door');
  crashed=true;assert.equal(api.interceptMemoryFieldDoor(focus),true);assert.equal(visit,'third');assert.equal(opened,0);
  after();assert.equal(opened,1,'the actual world action resumes after the visit');
  seen=true;assert.equal(api.interceptMemoryFieldDoor(focus),false,'a spent visit never intercepts another door');
  seen=false;special=true;assert.equal(api.interceptMemoryFieldDoor(focus),false);special=false;listening=true;
  assert.equal(api.interceptMemoryFieldDoor(focus),false,'listening still protects the field threshold');
});

test('light leaks can start only as field entry/return, and unsupported kinds never arm the compositor',()=>{
  const start=main.indexOf('function startFieldTransition('),end=main.indexOf('function neuralNow()',start);
  const state={},context={lastMinutes:state,performance:{now:()=>1000},Math};
  const transition=vm.runInNewContext(main.slice(start,end)+'\nstartFieldTransition',context);
  for(const kind of ['twitch','seep-in','seep-flash','seep-out','unknown']){assert.equal(transition(kind),false);assert.equal(state.transition,undefined);}
  assert.equal(transition('enter'),true);assert.equal(state.transition.owner,'field-visit');assert.equal(state.transition.kind,'enter');
  assert.equal(transition('emerge'),true);assert.equal(state.transition.kind,'emerge');
  const starts=[...main.matchAll(/startFieldTransition\('([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(starts,['enter','emerge'],'only the two live field boundaries request optical transition ownership');
});

test('the explicit media archive alone owns its player, never ordinary play or a haystack token',()=>{
  scenes.clear();let active=false,done;
  const start=main.indexOf('let windowTakeover=null,'),end=main.indexOf('// The same sentence',start);
  const context={scenes,RECORDER_SCENE_ID:'recorder',paused:false,gameplayInputLifecycleActive:()=>true,
    REC:{isRecording:()=>false,isSlating:()=>false,isListening:()=>false},PB:{isPlaying:()=>false},
    createWindowTakeover:()=>({active:()=>active,begin(_id,options){active=true;done=options.onDone;return true;}}),
    getSave:()=>({settings:{}}),getMeta:()=>({}),currentPsychProfileSettings:()=>({modules:{windowChoreography:false}}),
    windowTakeoverMode:()=> 'in-window',IS_TAURI:false};
  const api=vm.runInNewContext(main.slice(start,end)+'\n({beginWindowTakeover,windowTakeoverYields})',context);
  assert.equal(api.beginWindowTakeover('clouds'),false);
  assert.equal(api.beginWindowTakeover('paper-close',{owner:{id:'source-haystack-paper',runtime:{}}}),false);
  const room={id:'transfer-room',blocksInput:true};scenes.push(room);
  try{
    assert.equal(api.beginWindowTakeover('clouds',{owner:{id:'transfer-room'}}),false);
    assert.equal(api.beginWindowTakeover('clouds',{owner:room}),true);assert.equal(api.windowTakeoverYields(),false);
    scenes.push({id:'settings',blocksInput:true});assert.equal(api.windowTakeoverYields(),true);done({});
  }finally{scenes.clear();}
});
