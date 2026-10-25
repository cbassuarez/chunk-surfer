import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {ZONE,CELL} from '../src/data/floorplan/legend.js';
import {GET_IN_GOODS_DOOR_ID,GET_IN_DOOR_ENTRY,canBeginGetInDoorEntry,getInGoodsDoorAim,getInDoorEntryFrame,getInDoorEntryPose} from '../src/game/get-in-door-entry.js';

// Execute the actual main entry owners against the actual floorplan/door
// runtime. Rendering, audio and scene scheduling are passive host doubles.
const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const section=(start,end)=>{const i=source.indexOf(start);assert.ok(i>=0);const j=source.indexOf(end,i);assert.ok(j>i);return source.slice(i,j);};
const bodies=[
  section('function aimedWorldDoor(', 'function focusedWorldDoor('),
  section('function getInDoorEntryPortal(', '// Where the door stood'),
  section('function beginGetInArrivalTitle(', 'function noteArrivalCrossing('),
].join('\n');
FP.compile(conservatory.levels,conservatory);
function host(position,{keys=['master'],flags={prologueDone:true}}={}){
  FP.resetDoors();
  const save={flags},stack=[],events=[];
  const context={FP,ZONE,CELL,Math,Number,GET_IN_DOOR_ENTRY,canBeginGetInDoorEntry,getInGoodsDoorAim,getInDoorEntryFrame,getInDoorEntryPose,
    GREY_DOOR_ID:GET_IN_GOODS_DOOR_ID,storyMode:true,px:position.x,py:position.y,playerKeys:new Set(keys),
    getInDoorEntryScene:null,facilityMapCache:{},trail:[],renderMove:null,motionRig:null,lastStepDx:0,lastStepDy:0,stepCount:0,
    usingPlan:()=>true,usingSpecialSpace:()=>false,greyDoorRetired:()=>false,setupComplete:()=>false,
    getSave:()=>save,flagTest:name=>!!save.flags[name],flagApply:items=>{for(const k of items)save.flags[k]=true;},
    flagClear:name=>{save.flags[name]=false;},
    REC:{recState:()=>({takes:[]})},
    saveCommit:patch=>Object.assign(save,patch),mapHeading:()=>Math.PI/2,shakeMode:()=> 'full',
    emitDoorArchitecture:()=>events.push('real leaves opened'),thoughtHad:()=>true,markThought:()=>{},
    SPEECH:{say:line=>events.push(line),sayAll:()=>{},clearSpeech:()=>{}},ARRIVAL_THOUGHTS:{door:[]},
    lockedDoorThought:()=> 'locked',syncDoorDynamicProps:()=>{},resetMotionInput:()=>{},revealAround:()=>{},
    noteDockTransitStep:()=>events.push('body crossed'),
    R3:{r3dLookAngles:()=>({yaw:Math.PI/2,pitch:0}),r3dSetLookAngles:()=>{},r3dFacing:()=>1,r3dLook:()=>{}},
    STORY:{},fireCue:()=>{},restoreOpeningEntryPose:()=>{},setGameplayPaused:()=>{},
    makeWorldTitleScene:options=>({id:'world-title',...options}),
    beginGetInDriveTeaser:()=>events.push('drive'),
    scenes:{push:s=>{stack.push(s);events.push(s.id);s.enter?.();},remove:s=>{stack.splice(stack.indexOf(s),1);s.exit?.();}},
  };
  vm.createContext(context);vm.runInContext(bodies,context);
  return{context,save,stack,events};
}

test('real main input owns both goods leaves, including unzoned threshold handles, then title before drive',()=>{
  for(const x of[110.5,114,114.5])for(const y of[19.4,21.6]){
    const h=host({x,y}),focus=h.context.aimedWorldDoor([1,0],5);
    assert.equal(focus?.portal.id,GET_IN_GOODS_DOOR_ID,`real main focus resolves leaf at ${x},${y}`);
    assert.equal(h.context.tryGetInDoorEntry({doorWins:true,door:focus}),true);
    assert.equal(h.stack[0]?.id,'get-in-door-entry','one E starts the whole act, rather than a generic toggle');
    assert.equal(FP.doorState().find(d=>d.id===GET_IN_GOODS_DOOR_ID).state,'opening');
    h.stack[0].update(GET_IN_DOOR_ENTRY.duration);
    assert.equal(h.context.px,118.5);assert.equal(h.context.py,20.5);
    assert.equal(h.stack[0]?.id,'world-title');
    assert.equal(h.save.flags['opening.driveTeaser.pending'],true);
    assert.equal(h.events.includes('drive'),false,'no drive precedes the actual world title');
    h.stack[0].onDone();assert.equal(h.events.at(-1),'drive');
  }
});

test('a missing real key cannot start crossing or consume the title',()=>{
  const h=host({x:110.5,y:20.5},{keys:[]}),focus=h.context.aimedWorldDoor([1,0],5);
  assert.equal(h.context.tryGetInDoorEntry({doorWins:true,door:focus}),true);
  assert.equal(h.stack.length,0);assert.equal(h.save.flags['title.shown'],undefined);
  assert.equal(FP.doorState().find(d=>d.id===GET_IN_GOODS_DOOR_ID).state,'closed');
});

test('the first actual title clears only the stale pre-entry departure inference',()=>{
  const h=host({x:110.5,y:20.5},{flags:{prologueDone:true,'dock.departed':true,'unrelated.flag':true}});
  h.context.beginGetInArrivalTitle();
  assert.equal(h.save.flags['dock.departed'],false);
  assert.equal(h.save.flags['unrelated.flag'],true);
  assert.equal(h.stack[0]?.id,'world-title');
});

test('the later inside reach and already shown title never re-enter the arrival scene',()=>{
  for(const [position,flags]of[[{x:118.5,y:20.5},{prologueDone:true}],
    [{x:110.5,y:20.5},{prologueDone:true,'title.shown':true}]]){
    const h=host(position,{flags}),focus=h.context.aimedWorldDoor(position.x>114.5?[-1,0]:[1,0],5);
    assert.equal(h.context.tryGetInDoorEntry({doorWins:true,door:focus}),false);assert.equal(h.stack.length,0);
  }
});

test('the actual setup movement boundary leaves pre-title outdoor detours free',()=>{
  // The north end of the real arrival walk. Assert the physical redirect so
  // this fixture cannot silently turn into a synthetic outdoor placement.
  const edge={x:114,y:401,dx:0,dy:-1};
  const move=FP.canStep(edge.x,edge.y,edge.x+edge.dx,edge.y+edge.dy,{keys:new Set(['master'])});
  assert.ok(move.ok,'the ordinary yard-to-district step is accepted');
  edge.to=move.redirect||{x:edge.x+edge.dx,y:edge.y+edge.dy};
  assert.equal(FP.zoneAt(edge.x,edge.y),ZONE.dock);
  assert.equal(FP.zoneAt(edge.to.x,edge.to.y),ZONE.civicCourt);
  const boundary=section('  if(storyMode && hasEnteredGetIn() && !setupComplete()', '  // Geometry blocks the step.');
  const flags={},context={FP,storyMode:true,px:edge.x,py:edge.y,playerKeys:new Set(['master']),
    flagTest:k=>!!flags[k],hasEnteredGetIn:()=>!!flags['title.shown'],setupComplete:()=>false,usingPlan:()=>true,usingSpecialSpace:()=>false,
    atHomeThreshold:(x,y)=>[ZONE.dock,ZONE.getIn].includes(FP.zoneAt(x,y)),
    activeGeometry:()=>FP,setupExitDoorAhead:()=>null};
  vm.createContext(context);vm.runInContext('function boundary(dx,dy){'+boundary+"return 'free';}",context);
  assert.equal(context.boundary(edge.dx,edge.dy),'free','before entry there is no silent setup refusal');
  flags['title.shown']=true;
  assert.equal(context.boundary(edge.dx,edge.dy),undefined,'the intentional later indoor setup boundary remains');
});
