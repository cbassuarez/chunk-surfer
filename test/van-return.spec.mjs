import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {NodeIO} from '@gltf-transform/core';
import * as scenes from '../src/game/scenes.js';
import {makeOpeningVehicleScene} from '../src/game/opening-vehicle-scene.js';
import {OPENING_CAB_REQUIRED_MESHES,OPENING_CAB_ASSET} from '../src/game/opening-cab-inspection.js';
import {OPENING_VEHICLE} from '../src/data/opening-vehicle.js';
import {readFileSync} from 'node:fs';
import {VAN_RETURN,vanReturnAvailable,vanDriverDoorFocus,prepareVanReturn,finishVanReturn,vanReturnConversation,createVanReturn} from '../src/game/van-return.js';
import {freshSave,getSave,getMeta,saveCommit,withTransientGameState} from '../src/game/save.js';
import {freshRunRecord,freshMeta} from '../src/progression/schema.js';
import {openingVehiclePoint} from '../src/data/opening-vehicle.js';
const save=()=>({run:{id:'same-night',status:'active'},towerWarning:{phase:'leaving'},flags:{'work-order.accepted':true},takes:[{id:'B3'}],items:['key'],px:10,py:20});
test('only completed tipoff permits leaving, without requiring kit or guard',()=>{
  for(const phase of ['waiting','turning','speaking',undefined])assert.equal(vanReturnAvailable({...save(),towerWarning:{phase}}),false);
  for(const phase of ['leaving','departed'])assert.equal(vanReturnAvailable({...save(),towerWarning:{phase},flags:{}}),true);
  assert.equal(vanReturnAvailable(save(),{blocked:true}),false);
  for(const run of [{status:'return-committed'},{status:'active',pendingReturn:{}},{status:'active',finalizedReturn:{}}])assert.equal(vanReturnAvailable({...save(),run}),false);
});
test('driver handle is exterior, finite, within reach and deliberately looked at',()=>{
  const anchor={x:30,y:0,z:50,yaw:Math.PI/2},target=openingVehiclePoint(anchor,VAN_RETURN.handle,false),eye=openingVehiclePoint(anchor,[1.8,1.62,-2.48],false);
  const dx=target.x-eye.x,dy=target.y-eye.y,dz=target.z-eye.z,observer={...eye,yaw:Math.atan2(dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz))};
  assert.equal(vanDriverDoorFocus(anchor,observer)?.id,'yard-van-driver-handle');
  assert.equal(vanDriverDoorFocus(anchor,{...observer,yaw:observer.yaw+Math.PI}),null);
  assert.equal(vanDriverDoorFocus(anchor,{...observer,y:observer.y+4}),null);
  assert.equal(vanDriverDoorFocus(anchor,{...observer,x:NaN}),null);
  assert.equal(vanDriverDoorFocus(anchor,observer,{occluded:true}),null);
  assert.equal(vanDriverDoorFocus(anchor,{...observer,...openingVehiclePoint(anchor,[-1.8,1.62,-2.48],false)}),null);
});
test('checkpoint preserves active run, tapes, equipment and commitments through reload',()=>{
  const before=save(),patch=prepareVanReturn(before,{px:12,py:14,view:{yaw:2,pitch:-.1},cameraRevision:3},123),resumed=JSON.parse(JSON.stringify({...before,...patch}));
  assert.equal(resumed.run.id,before.run.id);assert.equal(resumed.run.status,'active');assert.equal(resumed.run.finalizedReturn,undefined);
  assert.deepEqual(resumed.takes,before.takes);assert.deepEqual(resumed.items,before.items);assert.equal(resumed.flags['work-order.accepted'],true);
  assert.equal(resumed.flags[VAN_RETURN.pending],true);assert.equal(resumed.flags[VAN_RETURN.count],1);assert.equal(resumed.px,12);assert.deepEqual(resumed.view,{yaw:2,pitch:-.1});
  assert.equal(prepareVanReturn(resumed,{},124).flags[VAN_RETURN.count],1);
  Object.assign(resumed,finishVanReturn(resumed));assert.equal(resumed.flags[VAN_RETURN.pending],false);assert.equal(resumed.run.status,'active');
  assert.equal(prepareVanReturn(resumed,{},125).flags[VAN_RETURN.count],2);
});
test('standard dialogue offers departure or stay, without filing an ending',()=>{
  const nodes=vanReturnConversation();assert.deepEqual(nodes.choice.choices.map(c=>c.vanReturn),['leave','stay']);
  for(const c of nodes.choice.choices)assert.ok(nodes[c.goto]);assert.match(nodes.choice.choices[0].text,/Come back/);
  const source=readFileSync(new URL('../src/game/van-return.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\bcommitReturn\s*\(|\bnewGame\s*\(|\bmetaCommit\s*\(/);
});
test('save precedes drive; duplicate callbacks cannot consume another visit',async()=>{
  const state=save(),calls=[];let done;
  const flow=createVanReturn({getSave:()=>state,commit:p=>{Object.assign(state,p);calls.push('commit');},persist:async()=>{calls.push('saved');return true;},drive:options=>{done=options.onDone;calls.push('drive');return true;},onTitle:()=>calls.push('title'),getCheckpoint:()=>({px:14,py:15}),now:()=>123});
  assert.equal(flow.choose('leave'),true);assert.equal(await flow.complete(),true);assert.deepEqual(calls,['commit','saved','drive']);assert.equal(await flow.complete(),false);
  done();done();assert.deepEqual(calls,['commit','saved','drive','commit','title']);assert.equal(state.flags[VAN_RETURN.pending],false);assert.equal(state.flags[VAN_RETURN.count],1);assert.equal(state.run.status,'active');
});
test('stay/cancel does nothing; failed saving is recoverable; unavailable film reaches title',async()=>{
  const state=save();let saved=false,drives=0,titles=0,errors=0;
  const flow=createVanReturn({getSave:()=>state,commit:p=>Object.assign(state,p),persist:async()=>saved,drive:()=>{drives++;return false;},onTitle:()=>titles++,onError:()=>errors++});
  assert.equal(await flow.complete(),false);flow.choose('stay');assert.equal(await flow.complete(),false);assert.equal(state.flags[VAN_RETURN.pending],undefined);
  flow.choose('leave');assert.equal(await flow.complete(),false);assert.equal(errors,1);assert.equal(drives,0);assert.equal(flow.view().busy,false);
  saved=true;assert.equal(await flow.complete(),true);assert.equal(drives,1);assert.equal(titles,1);assert.equal(state.flags[VAN_RETURN.count],1);
});

test('production save normalization retains suspension and every authoritative progression owner',async()=>{
  const initial=freshSave({run:freshRunRecord({id:'voluntary-visit',now:1000})});
  initial.towerWarning={phase:'departed'};initial.flags={'work-order.accepted':true,'van.closed':true};initial.items=['master_key'];
  initial.takes=[{id:'retained',room:'B3',usable:true}];
  const profile=freshMeta();
  await withTransientGameState({save:initial,meta:profile},async()=>{
    const run=structuredClone(getSave().run),meta=structuredClone(getMeta()),tapes=structuredClone(getSave().takes),items=structuredClone(getSave().items);
    saveCommit(prepareVanReturn(getSave(),{px:12,py:18,view:{yaw:1,pitch:0}},1234));
    assert.equal(getSave().flags[VAN_RETURN.pending],true);assert.equal(getSave().flags[VAN_RETURN.count],1);
    assert.deepEqual(getSave().run,run);assert.deepEqual(getSave().takes,tapes);assert.deepEqual(getSave().items,items);assert.deepEqual(getMeta(),meta);
    const disk=JSON.parse(JSON.stringify(getSave()));
    // Reconstruct from the same production normalizer used by real loading.
    await withTransientGameState({save:disk,meta:getMeta()},async()=>{
      assert.equal(getSave().run.status,'active');assert.equal(vanReturnAvailable(getSave()),true);assert.equal(getSave().px,12);
      saveCommit(finishVanReturn(getSave()));assert.equal(getSave().flags[VAN_RETURN.pending],false);assert.deepEqual(getSave().takes,tapes);
    });
  });
});

test('exterior focus is registered to the parked van’s visible handle rather than the interior release lever',()=>{
  const builder=readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8');
  assert.match(builder,/addBox\(m,\[s\*1\.025,1\.15,-2\.48\],\[\.035,\.055,\.28\],MAT\.black\)/);
  assert.deepEqual(VAN_RETURN.handle,[1.025,1.15,-2.48]);
  const anchor={x:30,y:0,z:50,yaw:Math.PI/2};
  const expected=openingVehiclePoint(anchor,[1.025,1.15,-2.48],false);
  const eye=openingVehiclePoint(anchor,[1.8,1.62,-2.48],false),dx=expected.x-eye.x,dy=expected.y-eye.y,dz=expected.z-eye.z;
  const target=vanDriverDoorFocus(anchor,{...eye,yaw:Math.atan2(dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz))});
  assert.deepEqual(target.point,expected);
});

function productionFixture(){
  scenes.clear();
  const anchor={x:30,y:0,z:50,yaw:Math.PI/2,group:'ground',zone:1};
  const state={...save(),px:8,py:16,cameraRevision:4,checkpointRevision:9,view:{yaw:.2,pitch:-.1},openingArrival:{phase:'complete',parkedAnchor:anchor},
    flags:{...save().flags,'opening.vehicle.exited':true,'opening.overture.completed':true,'prologueDone':true},presence:{sentinel:'HUSH UNCHANGED'}};
  const calls={conversation:null,drives:0,title:0,save:[],inspections:0,sounds:[],resets:[]};let driveDone;
  const look={yaw:.2,pitch:-.1};
  const context={VAN_RETURN,vanReturnAvailable,vanDriverDoorFocus,vanReturnConversation,createVanReturn,finishVanReturn,makeOpeningVehicleScene,
    RENDERER:'3d',planName:'conservatory',CELL:.5,px:8,py:16,stepCount:10,trail:[],renderMove:null,motionRig:null,paused:false,activeEndingCutscene:null,actx:null,
    OPENING_CAB_REQUIRED_MESHES,OPENING_CAB_ASSET,OPENING_VEHICLE,
    getSave:()=>state,getMeta:()=>({}),params:()=>new URLSearchParams(),flagTest:id=>state.flags[id]===true,flagGet:id=>state.flags[id],
    saveCommit:patch=>{Object.assign(state,patch);return state;},saveGameQueued:async value=>{calls.save.push(structuredClone(value));return calls.saveOK!==false;},withSaveTimeout:p=>p,
    openingVehiclePending:()=>false,openingDriveColliders:()=>[],openingVehiclePoint,
    scenes,usingSpecialSpace:()=>false,towerWarningListener:()=>calls.listener||null,
    R3:{r3dFacing:()=>1,r3dLookAngles:()=>({...look}),r3dSetLookAngles:v=>Object.assign(look,v),r3dProjectWorld:()=>null,
      r3dVehicleInteriorStatus:()=>({loaded:true}),r3dOpeningOvertureStatus:()=>({ready:true}),r3dOpeningStreetReady:()=>true,r3dElleryPublicFrontReady:()=>true,
      r3dBasePropsReady:()=>Promise.resolve(),r3dPrepareOpeningOverture:()=>Promise.resolve()},
    P3:{propMeshCatalog:()=>[...OPENING_CAB_REQUIRED_MESHES]},OPENING_AUTHORED_PROPS:[{id:'yard-van',x:66,y:208,yaw:Math.PI/2}],
    FP:{isLoaded:()=>true,logicalToPhysical:()=>({x:60,y:0,z:100,renderGroup:'ground'}),logicalAtPhysical:(x,y)=>({x,y}),zoneAt:()=>1},
    PROPS:{propById:()=>null},STORY:{stopOpeningOvertureScore(){},stopOpeningSceneBed(){},fadeSoundtrack(){},stopRain(){calls.rain=false;},startRain(){calls.rain=true;}},
    createOpeningArrivalAudio:()=>({prepare:()=>Promise.resolve(),update(){},event(){},dispose(){}}),
    OPENING_CAB_RADIO_STATIONS:[],createOpeningCabRadio:()=>({prepare:()=>Promise.resolve(),start(){},dispose(){},snapshot:()=>({}),update(){}}),
    openingArrivalWorldView:frame=>({x:frame.eye.x,y:frame.eye.z,yaw:frame.yaw,pitch:frame.pitch}),
    converse:(id,nodes,options)=>{calls.conversation={id,nodes,options};return true;},
    beginEndingDriveOff:options=>{calls.drives++;driveDone=options.onDone;return true;},returnToTitle:()=>{calls.title++;Object.assign(state,{px:context.px,py:context.py,view:{yaw:look.yaw,pitch:look.pitch}});},
    resetMotionInput:reason=>calls.resets.push(reason),refreshWorldProps(){},revealAround(){},gameplayInputLifecycleActive:()=>true,shakeMode:()=> 'full',
    queueMicrotask,structuredClone,console:{warn:(...args)=>calls.sounds.push(args),error:console.error},assetUrl:p=>p,
    windOpeningCabMusicBox(){},shakeOpeningCabMusicBox(){},combatBuild(){},bagJob(){},bagJournal(){},workOrderInkFor(){},workOrderShiftTicked(){},
    makeOpeningCabInspectionScene:()=>{calls.inspections++;return{id:'inspection'};},tickShiftOnWorkOrder(){},REC:{recState:()=>({}),composure(){},composureCeiling(){}},currentStoryGuidanceTarget(){},
  };
  vm.createContext(context);
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=main.indexOf('let openingVehicleScene='),end=main.indexOf('// The first interaction in the game',start);
  assert.ok(start>0&&end>start);vm.runInContext(main.slice(start,end),context);
  return{context,state,calls,anchor,driveDone:()=>driveDone?.(),ready:async()=>{assert.equal(context.beginOpeningVehicleArrival({returnVisit:true}),true);scenes.update(.1);await Promise.resolve();return scenes.top();}};
}

test('production re-entry uses parked cab and leaves arrival milestones, HUSH and opening checkpoint untouched',async()=>{
  const f=productionFixture(),before=structuredClone(f.state),cab=await f.ready();
  assert.equal(cab.id,'opening-vehicle');assert.equal(cab.view().phase,'seated');assert.equal(cab.view().anchor.x,f.anchor.x);assert.equal(cab.view().drive,null);
  assert.equal(f.calls.conversation.id,'van-return-decision');assert.equal(f.calls.conversation.options.blocksWorld,true);
  assert.equal(scenes.blocksWorld(),true);assert.equal(scenes.allowsLook(),true);
  f.calls.conversation.options.onChoice({vanReturn:'stay'});f.calls.conversation.options.onDone();assert.equal(cab.view().phase,'exiting');
  scenes.update(OPENING_VEHICLE.exitSeconds+.01);
  assert.equal(scenes.depth(),0);assert.equal(scenes.blocksInput(),false);
  assert.equal(f.state.px,before.px);assert.equal(f.state.py,before.py);assert.equal(f.state.view.yaw,before.view.yaw);
  assert.deepEqual(f.state.flags,before.flags);assert.deepEqual(f.state.openingArrival,before.openingArrival);assert.deepEqual(f.state.run,before.run);assert.deepEqual(f.state.presence,before.presence);
  assert.equal(f.calls.drives,0);assert.equal(f.calls.title,0);assert.equal(f.calls.rain,true,'street rain resumes after the cab releases it');scenes.clear();
});

test('production departure saves the pre-cab checkpoint and drives to title with an active resumable run',async()=>{
  const f=productionFixture(),before=structuredClone(f.state);await f.ready();
  f.calls.conversation.options.onChoice({vanReturn:'leave'});f.calls.conversation.options.onDone();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.drives,1);assert.equal(scenes.depth(),0);assert.equal(f.calls.save.length,1);
  assert.equal(f.calls.save[0].px,before.px);assert.equal(f.calls.save[0].py,before.py);assert.equal(f.calls.save[0].view.yaw,before.view.yaw);
  assert.equal(f.calls.save[0].flags[VAN_RETURN.pending],true);assert.deepEqual(f.calls.save[0].takes,before.takes);assert.deepEqual(f.calls.save[0].run,before.run);
  f.driveDone();f.driveDone();assert.equal(f.calls.title,1);assert.equal(f.state.px,before.px);assert.equal(f.state.py,before.py);assert.equal(f.state.view.yaw,before.view.yaw);assert.equal(f.state.view.pitch,before.view.pitch);assert.equal(f.state.flags[VAN_RETURN.pending],false);assert.equal(f.state.run.status,'active');scenes.clear();
});

test('production cancellation exits physically; failed departure save returns to a choice without driving',async()=>{
  const f=productionFixture(),cab=await f.ready();f.calls.conversation.options.onCancel();assert.equal(cab.view().phase,'exiting');scenes.update(OPENING_VEHICLE.exitSeconds+.01);
  assert.equal(scenes.blocksInput(),false);scenes.clear();
  const g=productionFixture();g.calls.saveOK=false;const second=await g.ready();g.calls.conversation.options.onChoice({vanReturn:'leave'});g.calls.conversation.options.onDone();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(g.calls.drives,0);assert.equal(second.view().phase,'seated');assert.match(g.calls.conversation.nodes.start.lines[0].text,/Try again/);assert.equal(g.state.run.status,'active');
  assert.equal(g.state.flags[VAN_RETURN.pending],true);g.calls.conversation.options.onChoice({vanReturn:'stay'});g.calls.conversation.options.onDone();
  assert.equal(g.state.flags[VAN_RETURN.pending],false,'abandoning a failed departure clears its pending receipt');
  scenes.update(OPENING_VEHICLE.exitSeconds+.01);assert.equal(g.calls.rain,true);assert.equal(scenes.blocksInput(),false);scenes.clear();
});

test('production driver handle uses the real parked anchor and yields to pause, scenes and incomplete warning',()=>{
  const f=productionFixture(),point=openingVehiclePoint(f.anchor,VAN_RETURN.handle,false),eye=openingVehiclePoint(f.anchor,[1.8,1.62,-2.48],false),dx=point.x-eye.x,dy=point.y-eye.y,dz=point.z-eye.z;
  f.calls.listener={...eye,yaw:Math.atan2(dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz))};
  assert.equal(f.context.focusedVanDriverDoor()?.action,'van-driver-door');
  f.context.paused=true;assert.equal(f.context.focusedVanDriverDoor(),null);f.context.paused=false;
  scenes.push({id:'some-dialogue',blocksInput:true});assert.equal(f.context.focusedVanDriverDoor(),null);scenes.clear();
  f.state.towerWarning.phase='speaking';assert.equal(f.context.focusedVanDriverDoor(),null);
  f.state.towerWarning.phase='departed';assert.equal(f.context.focusedVanDriverDoor()?.id,'yard-van-driver-handle');scenes.clear();
});

test('actual shipped parked-van handle bounds contain the exterior interaction point',async()=>{
  const doc=await new NodeIO().read(new URL('../public/assets/conservatory-props.glb',import.meta.url).pathname);
  const mesh=doc.getRoot().listMeshes().find(m=>m.getName()==='yard_van');assert.ok(mesh);
  const handle=[];
  for(const primitive of mesh.listPrimitives()){
    if(primitive.getMaterial()?.getName()!=='black lacquer')continue;
    const position=primitive.getAttribute('POSITION'),v=[0,0,0];
    for(let i=0;i<position.getCount();i++){
      position.getElement(i,v);
      if(v[0]>.99&&v[0]<1.06&&v[1]>1.1&&v[1]<1.2&&v[2]>-2.65&&v[2]<-2.30)handle.push([...v]);
    }
  }
  assert.ok(handle.length>=8,'the visible handle is present in the shipped mesh');
  for(let axis=0;axis<3;axis++){
    const min=Math.min(...handle.map(v=>v[axis])),max=Math.max(...handle.map(v=>v[axis]));
    assert.ok(VAN_RETURN.handle[axis]>=min&&VAN_RETURN.handle[axis]<=max,`handle axis ${axis} is backed by model surface`);
  }
});
