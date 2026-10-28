import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import {InputManager} from '../src/input/input-manager.js';
import {createPointerModeController} from '../src/input/pointer-mode.js';
import {makeCostumeInspectionScene} from '../src/game/costume-inspection-scene.js';
import {CONSERVATORY_ADVERSARY_FLAGS,freshConservatoryAdversaries,stepConservatoryAdversaries,cancelCostumeInspection,costumeInspectionEligible} from '../src/game/conservatory-adversaries.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){const start=main.indexOf(`function ${name}(`),end=main.indexOf('\n}',start);assert.ok(start>=0&&end>start,name+' production boundary exists');return main.slice(start,end+2);}
test.afterEach(()=>scenes.clear());

function fixture(){
  let state=freshConservatoryAdversaries(),clock=0,active=true,steps=0;
  const player={x:3.25,y:19.25},events=[],settled=[],looks=[];
  const step=dt=>{const r=stepConservatoryAdversaries(state,{dt,player,group:'basement',busy:false});state=r.state;events.push(...r.events);};
  step(0);state=stepConservatoryAdversaries(state,{dt:0,player,group:'basement',reachForPin:true}).state;
  assert.equal(state.costume.phase,'inspect');
  const input=new InputManager(),target={id:'map'};
  const lookAngles={yaw:0,pitch:0},arrivalLookEvents=[];
  let releases=0;
  const documentRef={pointerLockElement:target,visibilityState:'visible',hasFocus:()=>true,exitPointerLock(){this.pointerLockElement=null;releases++;}};
  const pointer=createPointerModeController({input,documentRef,getTargetElement:()=>target,getState:()=>({renderer:'3d',storyMode:true,inRogue:true,blocksInput:scenes.blocksInput(),blocksLook:scenes.blocksInput()&&!scenes.allowsLook()})});
  pointer.sync('test-start');const unsubscribe=scenes.subscribe(()=>pointer.sync('scene-change'));
  const context={scenes,RENDERER:'3d',paused:false,costumeInspectionScene:null,motionInput:input,holdUnavailableGameplayInput:()=>false,
    controllerGameplayAxes:()=>({turnX:.6,lookY:.4}),
    R3:{r3dLook:(yaw,pitch)=>{looks.push({yaw,pitch});lookAngles.yaw+=yaw;lookAngles.pitch+=pitch;},r3dLookAngles:()=>({...lookAngles})},
    noteExteriorArrivalControl:event=>arrivalLookEvents.push(event),
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),mouseLookSensitivity:()=>1,mouseInvertY:()=>false};
  vm.createContext(context);vm.runInContext(production('tickIndependentLook'),context);
  const scene=makeCostumeInspectionScene({getActor:()=>state.costume,isActive:()=>active,advance:dt=>{clock+=dt;steps++;step(dt);},onDone:r=>settled.push(r),onCancel:r=>{settled.push(r);state=cancelCostumeInspection(state).state;},onExit:()=>{context.costumeInspectionScene=null;}});
  context.costumeInspectionScene=scene;scenes.push(scene);
  return{scene,input,pointer,context,events,settled,looks,arrivalLookEvents,state:()=>state,clock:()=>clock,steps:()=>steps,releases:()=>releases,setActive:v=>{active=v;},close:()=>{scenes.clear();unsubscribe();}};
}

test('actual independent-look adapter drains input during the insert while retaining mouse capture, then accepts fresh look',()=>{
  const h=fixture();try{
    assert.equal(scenes.blocksInput(),true);assert.equal(scenes.blocksWorld(),true);assert.equal(scenes.allowsLook(),true);
    assert.equal(h.input.addPointerDelta(30,-14),true);h.context.tickIndependentLook(.1);
    assert.equal(h.input.pointerDx,0);assert.equal(h.input.pointerDy,0);assert.equal(h.looks.length,0,'controller and mouse cannot contaminate authored aim');
    assert.equal(h.input.pointerLocked,true);assert.equal(h.releases(),0,'a timer never surrenders a lease it cannot regain');
    assert.equal(h.arrivalLookEvents.length,0,'authored inspection aim cannot register voluntary exploration look');
    h.scene.key({key:'Escape'});assert.equal(scenes.blocksInput(),false);assert.equal(scenes.blocksWorld(),false);
    assert.equal(h.context.costumeInspectionScene,null);assert.equal(h.input.pointerLocked,true);
    h.input.addPointerDelta(9,4);h.context.tickIndependentLook(.1);
    assert.ok(h.looks.some(v=>v.yaw!==0),'fresh real input reaches the ordinary renderer after release');assert.equal(h.releases(),0);
    assert.equal(h.arrivalLookEvents.length,1,'only the released look reaches the arrival-control owner');
    assert.equal(h.arrivalLookEvents[0].type,'look');assert.equal(h.arrivalLookEvents[0].voluntary,true);
    assert.ok(h.arrivalLookEvents[0].yawDelta!==0,'arrival control receives the actual angular change');
  }finally{h.close();}
});

test('the real scene owns one advancing clock despite its world lock, and pause or inactive focus freezes it',()=>{
  const h=fixture();try{
    scenes.update(.1);assert.equal(h.steps(),1);assert.equal(h.clock(),.1);assert.equal(h.scene.view().age,.1);
    const paused=h.scene.view();scenes.push({id:'pause',blocksInput:true,blocksWorld:true});scenes.update(.1);
    assert.equal(h.clock(),.1);assert.equal(h.scene.view().age,paused.age);scenes.pop();
    h.setActive(false);scenes.update(.1);assert.equal(h.clock(),.1);h.setActive(true);
    for(let n=0;n<100&&scenes.has('costume-inspection');n++)scenes.update(.1);
    assert.equal(h.settled.length,1);assert.equal(h.settled[0].completed,true);assert.equal(h.settled[0].committed,true);
    assert.equal(h.state().costume.phase,'done');assert.equal(scenes.blocksInput(),false);assert.equal(h.events.filter(e=>e.kind==='costume-done').length,1);
    assert.equal(h.releases(),1,'only the intentional pause menu released capture');
  }finally{h.close();}
});

test('Escape before the snap resets to work; post-snap escape and external removal settle exactly once',()=>{
  for(const committed of[false,true]){
    const h=fixture();try{
      if(committed)for(let n=0;n<30&&!h.scene.view().committed;n++)scenes.update(.1);
      assert.equal(h.scene.view().committed,committed);h.scene.key({key:'Escape'});h.scene.exit();
      assert.equal(h.settled.length,1);assert.equal(h.settled[0].committed,committed);assert.equal(h.settled[0].completed,committed);
      assert.equal(scenes.blocksInput(),false);assert.equal(scenes.blocksWorld(),false);
      if(!committed)assert.equal(h.state().costume.phase,'work');
    }finally{h.close();}
  }
  const removed=fixture();try{scenes.clear();assert.equal(removed.settled.length,1);assert.equal(removed.settled[0].reason,'removed');assert.equal(removed.context.costumeInspectionScene,null);}finally{removed.close();}
});

function productionHarness(){
  scenes.clear();let look={yaw:.4,pitch:-.2},ready=false,recording=false;
  const data={flags:{},settings:{}},calls={inspections:[],audio:[],resets:[],commits:[]};
  const player={x:4,y:19},state=stepConservatoryAdversaries(freshConservatoryAdversaries(),{dt:0,group:'basement',player}).state;
  const environment={
    scenes,makeCostumeInspectionScene,costumeInspectionEligible,cancelCostumeInspection,stepConservatoryAdversaries,freshConservatoryAdversaries,CONSERVATORY_ADVERSARY_FLAGS,
    costumeInspectionScene:null,costumeInspectionOrigin:null,costumeInspectionLastExit:null,conservatoryAdversaries:state,conservatoryAdversaryAudio:null,
    academicAdversaryAudio:null,academicAdversaryReactionDispatch:null,academicAdversaries:{load(){},save:()=>({})},
    storyMode:true,usingPlan:()=>true,usingSpecialSpace:()=>false,paused:false,activeBattleId:null,RENDERER:'3d',px:8,py:38,
    basementWatcher:{roomId:'b1',resolved:false},FP:{logicalToPhysical:()=>({renderGroup:'basement'}),toAuthoredCoord:v=>v/2,toRuntimePoint:p=>({x:p.x*2,y:p.y*2})},
    REC:{isRecording:()=>recording},R3:{r3dCostumeExchangeStatus:()=>({ready}),r3dLookAngles:()=>look,r3dSetLookAngles:v=>{look={yaw:v.yaw,pitch:v.pitch};},r3dSnapCameraOnNextFrame(){},r3dResetVfdMemory(){}},
    getSave:()=>data,saveCommit:patch=>{Object.assign(data,patch);calls.commits.push(structuredClone(patch));},flagSet:(key,value=true)=>{data.flags[key]=value;},flagGet:key=>data.flags[key],
    inspectPropTracked:id=>calls.inspections.push(id),PROPS:{savePropState:()=>({inspected:[...calls.inspections]})},
    ensureCtx(){},resetMotionInput:reason=>calls.resets.push(reason),ensureInteractionFocus(){},mapHeading:()=>look.yaw,costumeInspectionWorldView:()=>({x:8,y:38,yaw:.1,pitch:-.3}),
    document:{hidden:false,hasFocus:()=>true},tickRoomMicAcoustics(){},actx:null,sfxGain:null,sightCrossesClosedDoor:()=>false,pushEvent(){},
    createConservatoryAdversaryAudio:()=>({play:event=>calls.audio.push(event.kind),dispose(){}}),
  };
  vm.createContext(environment);
  for(const name of['finishCostumeInspection','beginCostumeInspection','advanceConservatoryAdversaries','loadConservatoryAdversaries'])vm.runInContext(production(name),environment);
  return{environment,data,calls,look:()=>look,ready:value=>{ready=value;},recording:value=>{recording=value;}};
}

test('actual main entry gates on the loaded asset and explicit eligible chair, then releases the original aim',()=>{
  const h=productionHarness(),e=h.environment,chair={id:'store-empty-chair'};
  assert.equal(e.beginCostumeInspection(chair),false);assert.equal(h.calls.inspections.length,0);
  h.ready(true);assert.equal(e.beginCostumeInspection({id:'store-rail-a'}),false);
  h.recording(true);assert.equal(e.beginCostumeInspection(chair),false);h.recording(false);
  e.basementWatcher.roomId='store';assert.equal(e.beginCostumeInspection(chair),false);e.basementWatcher.roomId='b1';
  const origin=h.look();assert.equal(e.beginCostumeInspection(chair),true);const scene=e.costumeInspectionScene;
  assert.equal(scenes.top(),scene);assert.equal(scene.view().phase,'inspect');assert.deepEqual(h.calls.inspections,[],'inspection copy is not spent before the actual snap');
  e.beginCostumeInspection(chair);assert.equal(h.calls.inspections.length,0,'repeat E cannot spend or install a second owner');
  e.R3.r3dSetLookAngles({yaw:2,pitch:.5});scene.key({key:'Escape'});
  assert.equal(e.costumeInspectionScene,null);assert.equal(e.costumeInspectionOrigin,null);assert.deepEqual(h.look(),origin);
  assert.equal(e.conservatoryAdversaries.costume.phase,'work');assert.equal(h.data.flags[CONSERVATORY_ADVERSARY_FLAGS.costume],undefined);
  assert.deepEqual(h.calls.resets,['costume-inspection-enter','costume-inspection-exit']);
});

test('actual main persists at the snap, ignores ordinary blocked ticking, and reloads a spent encounter without replay',()=>{
  const h=productionHarness(),e=h.environment;h.ready(true);assert.equal(e.beginCostumeInspection({id:'store-empty-chair'}),true);
  const scene=e.costumeInspectionScene;
  for(let n=0;n<30&&!scene.view().committed;n++){
    const before=e.conservatoryAdversaries.costume.elapsed;e.advanceConservatoryAdversaries(.1);
    assert.equal(e.conservatoryAdversaries.costume.elapsed,before,'the ordinary world call respects the scene lock');
    scenes.update(.1);
  }
  assert.equal(scene.view().committed,true);assert.equal(h.data.flags[CONSERVATORY_ADVERSARY_FLAGS.costume],true,'receipt exists before recovery or exit');
  assert.deepEqual(h.calls.inspections,['store-empty-chair'],'the snap spends the chair inspection exactly once');
  const held=structuredClone(e.conservatoryAdversaries.held);scene.key({key:'Escape'});
  assert.equal(e.costumeInspectionScene,null);assert.equal(e.conservatoryAdversaries.costume.phase,'done');
  e.loadConservatoryAdversaries();assert.equal(e.conservatoryAdversaries.costume.phase,'done');
  assert.equal(e.beginCostumeInspection({id:'store-empty-chair'}),false);assert.deepEqual(e.conservatoryAdversaries.held,held);
  assert.equal(h.calls.audio.filter(kind=>kind==='pin-snap').length,1);
  assert.deepEqual(h.calls.inspections,['store-empty-chair'],'completion and reload do not spend the inspection again');
});
