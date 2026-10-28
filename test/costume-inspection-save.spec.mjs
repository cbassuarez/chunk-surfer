import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import {makeCostumeInspectionScene} from '../src/game/costume-inspection-scene.js';
import {CONSERVATORY_ADVERSARY_FLAGS,cancelCostumeInspection,costumeInspectionEligible,freshConservatoryAdversaries,stepConservatoryAdversaries} from '../src/game/conservatory-adversaries.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n}',start);assert.ok(start>=0&&end>start,name+' exists');return source.slice(start,end+2);}
function titleCheckpointPrefix(){
  const start=source.indexOf('function returnToTitle(){'),end=source.indexOf('  const titleRestored=',start);
  assert.ok(start>=0&&end>start,'title checkpoint precedes presentation setup');
  return source.slice(start,end)+'\n}';
}
test.afterEach(()=>scenes.clear());

function harness(){
  scenes.clear();
  const origin={x:8,y:38,yaw:.4,pitch:-.2,facing:0};let look={yaw:origin.yaw,pitch:origin.pitch};
  const data={flags:{},settings:{},view:{...look},facing:origin.facing,px:origin.x,py:origin.y,playSeconds:0};
  const calls={order:[],commits:[],inspections:[]},player={x:4,y:19};
  const costume=stepConservatoryAdversaries(freshConservatoryAdversaries(),{dt:0,group:'basement',player}).state;
  const context={
    scenes,makeCostumeInspectionScene,CONSERVATORY_ADVERSARY_FLAGS,cancelCostumeInspection,costumeInspectionEligible,freshConservatoryAdversaries,stepConservatoryAdversaries,
    costumeInspectionScene:null,costumeInspectionOrigin:null,costumeInspectionLastExit:null,conservatoryAdversaries:costume,conservatoryAdversaryAudio:null,
    // Unrelated scene owners are absent in the isolated ordinary autosave.
    standingTearScene:null,pubRoomAudio:null,sourcePubAudio:null,sourceContinuationAudio:null,
    sourceContinuationScene:null,coastalMemoryScene:null,getInDriveTeaserOrigin:null,
    storyMode:true,inRogue:true,RENDERER:'3d',paused:false,activeBattleId:null,usingPlan:()=>true,usingSpecialSpace:()=>false,usingStairAnomaly:()=>false,px:origin.x,py:origin.y,stepCount:17,
    basementWatcher:{roomId:'b1',resolved:false},FP:{logicalToPhysical:()=>({renderGroup:'basement'}),toAuthoredCoord:v=>v/2,toRuntimePoint:p=>({x:p.x*2,y:p.y*2})},
    REC:{isRecording:()=>false},R3:{r3dCostumeExchangeStatus:()=>({ready:true}),r3dLookAngles:()=>({...look}),r3dFacing:()=>((Math.round(look.yaw/(Math.PI/2))%4)+4)%4,
      r3dSetLookAngles:value=>{look={yaw:value.yaw,pitch:value.pitch};calls.order.push('restore-look');},r3dSnapCameraOnNextFrame(){},r3dResetVfdMemory(){}},
    getSave:()=>data,saveCommit:patch=>{calls.order.push(patch.view?'camera-checkpoint':'receipt');calls.commits.push(structuredClone(patch));Object.assign(data,structuredClone(patch));},
    flagSet:(key,value=true)=>{data.flags[key]=value;},flagGet:key=>data.flags[key],inspectPropTracked:id=>calls.inspections.push(id),PROPS:{savePropState:()=>({inspected:[...calls.inspections]})},
    ensureCtx(){},resetMotionInput:reason=>calls.order.push(reason),ensureInteractionFocus(){},mapHeading:()=>look.yaw,costumeInspectionWorldView:()=>({x:8,y:38,yaw:2.4,pitch:-.8}),
    document:{hidden:false,hasFocus:()=>true},tickRoomMicAcoustics(){},actx:null,sfxGain:null,sightCrossesClosedDoor:()=>false,pushEvent(){},createConservatoryAdversaryAudio:()=>({play(){},dispose(){}}),
    // The title cleanup covers unrelated worlds with no active owners in this fixture.
    rememberChapelTapeDemandDeparture(){},retireStandingTear(){},
    saveAcc:0,sourceReturnFlashbackScene:null,sourceDriveSession:null,sourcePubScene:null,saveAcademicGhostClub(){},escape:null,chapelTowerState:()=>({phase:'idle'}),CHAPEL_TOWER_PHASE:{TOWER_ACTIVE:'active'},bellTowerRuntime:null,towerBellDirector:null,chunkSurfRuntime:null,sourceRepriseWorldLease:null,hushAudioRuntime:null,
    RADIO:{saveRadioState:()=>({})},saveSourceView:()=>calls.order.push('source-view'),
  };
  vm.createContext(context);
  for(const name of['finishCostumeInspection','beginCostumeInspection','advanceConservatoryAdversaries','saveTick'])vm.runInContext(production(name),context);
  vm.runInContext(titleCheckpointPrefix(),context);
  assert.equal(context.beginCostumeInspection({id:'store-empty-chair'}),true);
  assert.equal(context.costumeInspectionOrigin.facing,0,'the actual entry retains a zero-valued body facing');
  const borrowed=()=>{look={yaw:2.4,pitch:-.8};};
  return{context,data,calls,origin,borrowed,look:()=>({...look})};
}

test('the real four-second autosave saves the ordinary body and aim during an active inspection',()=>{
  const h=harness();h.borrowed();
  assert.equal(h.context.R3.r3dFacing(),2);assert.equal(scenes.blocksWorld(),true);
  h.context.saveTick(4);
  assert.deepEqual(h.data.view,{yaw:h.origin.yaw,pitch:h.origin.pitch});assert.equal(h.data.facing,h.origin.facing);
  assert.equal(h.data.px,h.origin.x);assert.equal(h.data.py,h.origin.y);assert.equal(h.data.area,'conservatory');
  assert.deepEqual(h.look(),{yaw:2.4,pitch:-.8},'autosave preserves the live authored camera while choosing the saved ordinary view');
  assert.equal(h.data.flags[CONSERVATORY_ADVERSARY_FLAGS.costume],undefined,'an early autosave cannot spend the unrevealed scare');
  assert.deepEqual(h.calls.inspections,[]);
});

test('ordinary autosave resumes saving the live aim once inspection relinquishes its lease',()=>{
  const h=harness();h.context.costumeInspectionScene.key({key:'Escape'});h.borrowed();h.context.saveTick(4);
  assert.deepEqual(h.data.view,{yaw:2.4,pitch:-.8});assert.equal(h.data.facing,2);
  assert.equal(h.context.costumeInspectionScene,null);assert.equal(scenes.blocksInput(),false);
});

for(const committed of[false,true])test(`return-to-title releases the ${committed?'revealed':'unrevealed'} insert before its ordinary checkpoint`,()=>{
  const h=harness();
  if(committed)for(let i=0;i<35&&!h.context.costumeInspectionScene.view().committed;i++)scenes.update(.1);
  assert.equal(h.context.costumeInspectionScene.view().committed,committed);
  h.borrowed();h.calls.order.length=0;h.context.returnToTitle();
  assert.equal(h.context.costumeInspectionScene,null);assert.equal(h.context.costumeInspectionOrigin,null);assert.equal(scenes.depth(),0);
  assert.equal(scenes.blocksInput(),false);assert.equal(scenes.blocksWorld(),false);
  const release=h.calls.order.indexOf('costume-inspection-exit'),sourceSave=h.calls.order.indexOf('source-view'),checkpoint=h.calls.order.indexOf('camera-checkpoint');
  assert.ok(release>=0&&sourceSave>release&&checkpoint>sourceSave,'scene cleanup and aim restoration precede every title camera checkpoint');
  assert.deepEqual(h.data.view,{yaw:h.origin.yaw,pitch:h.origin.pitch});assert.equal(h.data.facing,h.origin.facing);
  assert.equal(h.data.px,h.origin.x);assert.equal(h.data.py,h.origin.y);
  assert.equal(!!h.data.flags[CONSERVATORY_ADVERSARY_FLAGS.costume],committed,'title cancellation preserves the real reveal receipt');
  assert.equal(h.context.conservatoryAdversaries.costume.phase,committed?'done':'work');
  assert.deepEqual(h.calls.inspections,committed?['store-empty-chair']:[],'neither title checkpoint nor cleanup spends inspection copy early or twice');
});
