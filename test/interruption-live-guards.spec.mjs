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

test('generic seep cannot obscure calibration, a modal owner, listening or danger',()=>{
  const start=main.indexOf('function maybeMemorySeep(verb){'),end=main.indexOf('function showMemorySeep(',start);
  const called=[];let setup=false,modal=false,listening=false,recording=false,escape=null,pressure=0;
  const context={lastMinutes:{director:{takeoverFor:options=>{called.push(['takeover',options.blocked]);return null;},
    seepFor:(_verb,options)=>{called.push(['seep',options.blocked]);return options.blocked?null:{id:'wheel',set:'carnage',seconds:.3,gain:1};}},played:100,frame:{arc:.5},loss:0},
    storyMode:true,chunkSurfRuntime:null,flagTest:()=>true,setupComplete:()=>setup,paused:false,
    scenes:{blocksInput:()=>modal},REC:{isRecording:()=>recording,isListening:()=>listening},
    get escape(){return escape;},nightDeadlineCommitted:()=>false,sixLoopActive:()=>false,visualEffectsEnabled:()=>true,
    RENDERER:'3d',R3:{r3dTableauStats:()=>({active:false})},usingSpecialSpace:()=>false,
    presentedFearPressure:()=>({overall:pressure}),memoryFieldFlag:id=>id,beginWindowTakeover:()=>false,windowTakeoverYields:()=>false,
    lastMinutesReducedDread:()=>false,flashMode:()=> 'full',showMemorySeep:()=>true,actx:null};
  const maybe=vm.runInNewContext(main.slice(start,end)+'\nmaybeMemorySeep',context);
  for(const mode of['calibration','modal','listening','recording','escape','pressure']){
    setup=mode!=='calibration';modal=mode==='modal';listening=mode==='listening';recording=mode==='recording';escape=mode==='escape'?{}:null;pressure=mode==='pressure'?.6:0;
    called.length=0;assert.equal(maybe('torch'),false,mode);assert.ok(called.every(row=>row[1]===true),mode+' must be blocked before selection');
  }
  setup=true;modal=false;listening=false;recording=false;escape=null;pressure=0;
  assert.equal(maybe('torch'),true,'ordinary safe play still allows the authored effect');
});

test('a repeated dead verb releases immediately when the current world needs the action',()=>{
  const start=main.indexOf('function swallowDeadVerb(verb,cue){'),end=main.indexOf('// At the water',start);
  let danger=false,heard=0;const state={director:{deadVerbFor:()=>true},deadVerb:{verb:'torch',at:10,presses:1}};
  const context={lastMinutes:state,performance:{now:()=>10100},storyMode:true,usingSpecialSpace:()=>false,
    flagTest:()=>true,memoryFieldFlag:id=>id,lastMinutesReducedDread:()=>false,paused:false,
    REC:{isRecording:()=>false,isListening:()=>false},escape:null,nightDeadlineCommitted:()=>false,sixLoopActive:()=>false,
    scenes:{blocksInput:()=>false},presentedFearPressure:()=>({overall:danger?.8:0}),INTERRUPTION:{deadVerb:{quiet:.85,presses:2}}};
  const swallow=vm.runInNewContext(main.slice(start,end)+'\nswallowDeadVerb',context);
  danger=true;assert.equal(swallow('torch',()=>heard++),false);assert.equal(state.deadVerb,null);assert.equal(heard,0);
});

test('ordinary door faults stay outside Source and listening, and a blocked held fault relinquishes the real door',()=>{
  const start=main.indexOf('function doorMayMisbehave(door){'),end=main.indexOf('// A seep, on a verb.',start);
  let special=false,listening=false;const door={id:'hall-door',state:'closed'};
  const context={storyMode:true,setupComplete:()=>true,usingSpecialSpace:()=>special,GREY_DOOR_ID:'grey',playerKeys:new Set(),
    paused:false,escape:null,nightDeadlineCommitted:()=>false,sixLoopActive:()=>false,
    REC:{isRecording:()=>false,isListening:()=>listening,recState:()=>({takes:[]})},scenes:{blocksInput:()=>false},
    presentedFearPressure:()=>({overall:0}),sixCrashDue:()=>false,getSave:()=>({flags:{}}),dreadAllowed:()=>true,
    lastMinutes:{director:{},deadDoor:{id:'hall-door'}},FP:{doorState:()=>[door]}};
  const api=vm.runInNewContext(main.slice(start,end)+'\n({doorMayMisbehave,interceptDoorPress})',context);
  assert.equal(api.doorMayMisbehave(door),true);
  special=true;assert.equal(api.doorMayMisbehave(door),false);special=false;listening=true;
  assert.equal(api.interceptDoorPress({door:{portal:{id:'hall-door'}}}),false);
  assert.equal(context.lastMinutes.deadDoor,null,'a protected ordinary action does not keep an old fault latched');
});

test('the water-edge plate cannot bypass recording or modal exclusions and only spends its flag on delivery',()=>{
  const start=main.indexOf('function maybeUnderWaterSeep(){'),end=main.indexOf('function syncNeuralHud(',start);
  let recording=true,modal=false,spent=0,shown=0;
  const context={lastMinutes:{seep:null},storyMode:true,flagTest:()=>false,lastMinutesReducedDread:()=>false,
    visualEffectsEnabled:()=>true,setupComplete:()=>true,paused:false,scenes:{blocksInput:()=>modal},
    REC:{isRecording:()=>recording,isListening:()=>false},escape:null,nightDeadlineCommitted:()=>false,
    sixLoopActive:()=>false,usingSpecialSpace:()=>false,presentedFearPressure:()=>({overall:0}),
    memorySeepPlate:()=>({}),flagSet:()=>spent++,showMemorySeep:()=>shown++,actx:null};
  const seep=vm.runInNewContext(main.slice(start,end)+'\nmaybeUnderWaterSeep',context);
  assert.equal(seep(),false);recording=false;modal=true;assert.equal(seep(),false);
  assert.equal(spent,0);assert.equal(shown,0);modal=false;assert.equal(seep(),true);assert.equal(spent,1);assert.equal(shown,1);
});

test('only the exact top extras owner can bypass its own menu block, and any other modal yields',()=>{
  scenes.clear();let active=false,done;
  const start=main.indexOf('let windowTakeover=null,'),end=main.indexOf('// The same sentence',start);
  const context={scenes,RECORDER_SCENE_ID:'recorder',usingSourceSpace:()=>false,PRES:{isActive:()=>false},
    createWindowTakeover:()=>({active:()=>active,begin(_id,options){active=true;done=options.onDone;return true;}}),
    getSave:()=>({settings:{}}),getMeta:()=>({}),currentPsychProfileSettings:()=>({modules:{windowChoreography:false}}),
    windowTakeoverMode:()=> 'in-window',IS_TAURI:false};
  const api=vm.runInNewContext(main.slice(start,end)+'\n({beginWindowTakeover,windowTakeoverYields})',context);
  const room={id:'transfer-room',blocksInput:true};scenes.push(room);
  try{
    assert.equal(api.beginWindowTakeover('clouds'),false,'normal entry cannot ignore a modal');
    assert.equal(api.beginWindowTakeover('clouds',{owner:{id:'transfer-room'}}),false,'an invented owner has no lease');
    assert.equal(api.beginWindowTakeover('clouds',{owner:room}),true);assert.equal(api.windowTakeoverYields(),false);
    scenes.push({id:'settings',blocksInput:true});assert.equal(api.windowTakeoverYields(),true);
    done({});
  }finally{scenes.clear();}
});
