import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {pubHospitalityReady,pubHospitalityInstance,pubHospitalityInput} from '../src/game/pub-hospitality.js';
import {PUB_HOSPITALITY_MESH} from '../src/data/pub-hospitality.js';
import {EXTERIOR_PUB} from '../src/data/exterior-pub.js';
import {ZONE} from '../src/data/floorplan/legend.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){
  const start=main.indexOf(`function ${name}(`),end=main.indexOf('\n}',start);
  assert.ok(start>=0&&end>start,`${name} has a production extraction boundary`);return main.slice(start,end+2);
}
const original=()=>({id:'pub-complete-interior',mesh:'exterior_pub_interior',x:-6,y:.12,z:109.75,yaw:-Math.PI/2,zone:22,structural:true,matrix:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,-6,.12,109.75,1])});

test('failed or pending warm assets keep the complete ordinary room; readiness replaces only its owned instance',()=>{
  const room=original(),before=structuredClone(room);
  for(const assets of[null,{}, {hospitality:false}, {hospitality:'true'}, {hospitality:0,error:'decode failed'}]){
    assert.equal(pubHospitalityReady(assets),false);assert.equal(pubHospitalityInstance(room,{assets}),room,'the real original is the complete failure fallback');
  }
  const warmed=pubHospitalityInstance(room,{assets:{hospitality:true}});
  assert.equal(warmed.mesh,PUB_HOSPITALITY_MESH);assert.equal(warmed.id,room.id);assert.equal(warmed.matrix,room.matrix);
  assert.deepEqual(room,before,'asset readiness cannot mutate the authored catalog or later Source copies');
  assert.deepEqual({...warmed,mesh:room.mesh},room,'placement, material zone and structural/depth contract survive replacement');
  for(const other of[{...room,id:'source-pub-room-0'},{...room,id:'some-other-room'},{...room,mesh:'different-interior'},{id:'pub-patron-ed',mesh:'pub_patron_ed'}])assert.equal(pubHospitalityInstance(other,{assets:{hospitality:true}}),other,'a matching mesh alias alone cannot claim another owner');
});

test('Source and other special spaces cannot borrow the warm room or ordinary hospitality audio context',()=>{
  const room=original(),bounds={x0:-14,x1:2,z0:107.05,z1:112.45};
  assert.equal(pubHospitalityInstance(room,{assets:{hospitality:true},source:true}),room);
  for(const special of[true])for(const zoneIsPub of[false,true]){
    const input=pubHospitalityInput({enabled:true,special,zoneIsPub,listener:{x:-6,z:109.75},doorOpen:true,bounds});
    assert.equal(input.inPub,false);assert.equal(input.nearPub,false);assert.equal(input.doorOpen,false);assert.equal(input.paused,true,'the audio owner is suspended even when Source reuses the pub zone number');
  }
  const disabled=pubHospitalityInput({enabled:false,zoneIsPub:true,listener:{x:-6,z:109.75},doorOpen:true,bounds});
  assert.equal(disabled.inPub,false);assert.equal(disabled.nearPub,false);assert.equal(disabled.paused,true);
});

test('ordinary hospitality follows the real room, immediate approach and existing pause/conversation ownership',()=>{
  const bounds={x0:-14,x1:2,z0:107.05,z1:112.45};
  const inside=pubHospitalityInput({enabled:true,zoneIsPub:true,listener:{x:-6,z:109.75},doorOpen:false,bounds});
  assert.equal(inside.inPub,true);assert.equal(inside.nearPub,true);assert.equal(inside.doorOpen,false);assert.equal(inside.paused,false);
  const approach=pubHospitalityInput({enabled:true,zoneIsPub:false,listener:{x:-6,z:102},doorOpen:true,bounds,busy:true});
  assert.equal(approach.inPub,false);assert.equal(approach.nearPub,true);assert.equal(approach.doorOpen,true);assert.equal(approach.busy,true);
  const far=pubHospitalityInput({enabled:true,zoneIsPub:false,listener:{x:-6,z:98},doorOpen:true,bounds,paused:true});
  assert.equal(far.nearPub,false);assert.equal(far.paused,true);
  const noListener=pubHospitalityInput({enabled:true,zoneIsPub:true,bounds});assert.equal(noListener.inPub,false);assert.equal(noListener.nearPub,false);assert.equal(noListener.paused,true);
});

test('the actual main Source render branch returns its own cold field before any ordinary room selector runs',()=>{
  const coldProps=[{id:'source-bell',mesh:'source_bell',zone:10}],coldLights=[{id:'source-field',color:[.3,.4,.5],intensity:.1}],calls=[];
  const environment={
    usingSourceSpace:()=>true,applySourceLighting:()=>calls.push('source-lighting'),px:100,py:-150,performance:{now:()=>2000},
    shakeMode:()=> 'full',flashMode:()=> 'full',liveLightCircuits:()=>new Set(),sourceLightingTorchState:()=>({torchOn:false}),getSave:()=>({settings:{}}),
    chunkSurfRuntime:{localLights:()=>coldLights,propInstances:()=>coldProps},endingSourcePropInstances:()=>[],
    PROPS:{attachInscriptions:props=>props},R3:{r3dSetLocalLights:lights=>calls.push(lights),r3dSetEmergencyShadows:shadows=>calls.push(shadows)},
    pubHospitalityInstance:()=>{throw Error('ordinary selector reached the Source branch');},
    syncArchitecturalLocalLights:()=>{throw Error('ordinary light sync reached the Source branch');},
  };
  vm.createContext(environment);vm.runInContext(production('worldRenderInstances'),environment);
  const result=environment.worldRenderInstances('source-space');assert.equal(result.length,1);assert.equal(result[0],coldProps[0]);
  assert.equal(calls[0],'source-lighting');assert.equal(calls[1],coldLights);assert.deepEqual(Array.from(calls[2]),[]);
});

test('actual main routes room sound and diagnostics by physical listener, pause, conversation and Source ownership',()=>{
  const ordinary=[],source=[],ordinaryOwner={update:input=>ordinary.push(input),snapshot:()=>({owner:'ordinary'})},sourceOwner={update:input=>source.push(input),snapshot:()=>({owner:'source'})};
  let special=false,focused=true,speaking=false,top=null;
  const environment={
    pubHospitalityInput,EXTERIOR_PUB,ZONE,CELL:.5,px:84,py:894,storyMode:true,inRogue:true,paused:false,
    sourcePubScene:null,sourceDriveSession:null,sourceContinuationScene:null,coastalMemoryScene:null,getInDriveTeaserScene:null,activeBattleId:null,pubRoomAudio:null,sourcePubAudio:null,actx:{},sfxGain:{},musicGain:{},STORY:{setRainRoomScale(){}},
    usingSpecialSpace:()=>special,gameplayInputLifecycleActive:()=>focused,mapHeading:()=>0,
    FP:{isLoaded:()=>true,logicalToPhysical:()=>({x:EXTERIOR_PUB.interiorAnchor.x*2,z:EXTERIOR_PUB.interiorAnchor.z*2,y:.12}),zoneAt:()=>ZONE.pub,forEachDoor:visit=>visit({id:'pub-west-entry',runtime:{openFraction:.8}})},
    R3:{r3dWorldYaw:()=>1.25,r3dPubStatus:()=>({hospitality:true})},REC:{isRecording:()=>false},SPEECH:{speaking:()=>speaking},scenes:{top:()=>top},
    createPubRoomAudio:()=>ordinaryOwner,createSourcePubAudio:()=>sourceOwner,
    pubHospitalityRendered:[{id:'pub-complete-interior',mesh:PUB_HOSPITALITY_MESH}],pubHospitalityLocalLightIds:['pub-hearth-light'],
  };
  vm.createContext(environment);for(const name of['currentPubHospitalityInput','tickPubRoomAudio','pubHospitalityProbe'])vm.runInContext(production(name),environment);
  environment.tickPubRoomAudio(.1);assert.equal(ordinary[0].inPub,true);assert.equal(ordinary[0].nearPub,true);assert.equal(ordinary[0].doorOpen,true);assert.equal(ordinary[0].paused,false);
  assert.deepEqual({...ordinary[0].listener},{x:EXTERIOR_PUB.interiorAnchor.x,z:EXTERIOR_PUB.interiorAnchor.z,yaw:1.25},'runtime cells become actual metre positions once');assert.equal(environment.pubHospitalityProbe().active,true);
  top={id:'conversation',blocksWorld:true};speaking=true;environment.tickPubRoomAudio(.1);assert.equal(ordinary.at(-1).busy,true,'a conversation does not strand a previously playing room owner');
  focused=false;environment.tickPubRoomAudio(.1);assert.equal(ordinary.at(-1).paused,true,'blur/hide follows the same input lifecycle gate');focused=true;environment.paused=true;environment.tickPubRoomAudio(.1);assert.equal(ordinary.at(-1).paused,true);environment.paused=false;
  top=null;speaking=false;special=true;environment.tickPubRoomAudio(.1);assert.equal(ordinary.at(-1).inPub,false);assert.equal(ordinary.at(-1).nearPub,false);assert.equal(ordinary.at(-1).paused,true);
  let probe=environment.pubHospitalityProbe();assert.equal(probe.active,false);assert.deepEqual(Array.from(probe.renderedIds),[]);assert.deepEqual(Array.from(probe.localLightIds),[]);
  special=false;environment.sourcePubScene={view:()=>({stage:0,ready:true})};environment.tickPubRoomAudio(.1);assert.equal(ordinary.at(-1).paused,true);assert.equal(source.at(-1).state.stage,0);
  probe=environment.pubHospitalityProbe();assert.equal(probe.active,false);assert.deepEqual(Array.from(probe.renderedIds),[]);assert.deepEqual(Array.from(probe.localLightIds),[]);
  environment.sourcePubScene=null;environment.sourceDriveSession={};environment.tickPubRoomAudio(.1);assert.equal(ordinary.at(-1).paused,true,'the Source vehicle cannot inherit pub chatter either');
  assert.equal(environment.pubRoomAudio,ordinaryOwner);assert.equal(environment.sourcePubAudio,sourceOwner,'owners are reused rather than accumulating after returns');
});
