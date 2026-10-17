import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { propInscriptionAttachments } from '../src/world/prop-inscriptions.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { EXTERIOR_INSPECTABLES } from '../src/data/exterior-district.js';
import { WORLD_INSCRIPTIONS } from '../src/data/world-inscriptions.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';

const matrix=Float32Array.from({length:16},(_,i)=>i+.25);
const host={id:'one-host',mesh:'imported-host',x:12,y:3,z:7,yaw:1.3,
  scale:.7,scaleX:2,scaleY:3,scaleZ:.6,matrix,zone:11,structural:true,
  fallbackMesh:'fallback',waterlineBody:{kind:'test'},waterlineOffset:.14};
const record={id:'actual-copy',hostId:host.id,hostMesh:host.mesh,
  mesh:'lettering_overlay_actual-copy',center:[.1,.2,.3],copy:'EXACT COPY'};
const result=propInscriptionAttachments([host],[record]);
assert.equal(result.length,2);assert.equal(result[0],host,'host must not be reconstructed or mutated');
const ink=result[1];
for(const key of ['x','y','z','yaw','scale','scaleX','scaleY','scaleZ','matrix','zone','structural','waterlineBody','waterlineOffset'])
  assert.equal(ink[key],host[key],`${key} must follow the final host transform/condition exactly`);
assert.equal(ink.mesh,record.mesh);assert.equal(ink.fallbackMesh,null);
assert.equal(ink.blocks,false);assert.equal(ink.interactive,false);
assert.equal(ink.letteringHostId,host.id);assert.equal(ink.letteringId,record.id);
assert.deepEqual(propInscriptionAttachments([], [record]),[],'a hidden/other-group host cannot leave floating ink');
assert.equal(propInscriptionAttachments([host],[{...record,hostId:'other-host'}]).length,1,'host ID must be exact');
assert.equal(propInscriptionAttachments([host],[{...record,hostMesh:'other-mesh'}]).length,1,'a replacement host must pass the mesh guard');
assert.deepEqual(record.center,[.1,.2,.3],'host-local face coordinates are already baked and cannot be added twice');

// Exercise the actual main render boundary: state visibility and the moving
// door/waterline poses are resolved after props.js exposes the base hosts.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=main.indexOf('function worldRenderInstances(group=null){');
const end=main.indexOf('\nfunction usingSourceSpace()',start);
assert.ok(start>=0&&end>start);
const hosts=[{id:'roof-gate',mesh:'gate',x:2,y:1,z:4,yaw:.2},
  {id:'academic-roof-home-cassette',mesh:'cassette',x:8,y:2,z:3},
  {id:'floating-host',mesh:'float',waterlineBody:'basin',waterlineOffset:.3,y:1}];
const labels=hosts.map(p=>({id:`${p.id}-ink`,hostId:p.id,hostMesh:p.mesh,mesh:`lettering_overlay_${p.id}`}));
const calls=[];
const boundary={usingSourceSpace:()=>false,usingStairAnomaly:()=>false,syncArchitecturalLocalLights:()=>{},
  chapelTowerState:()=>({phase:'other'}),CHAPEL_TOWER_PHASE:{TOWER_CLEARED:'cleared',CHAPEL_FINAL:'final',TOWER_ACTIVE:'active'},
  bellTowerRuntime:null,currentNatatoriumWaterRun:()=>0,PROPS:{renderInstances:options=>{calls.push(options);return hosts;},attachInscriptions:list=>propInscriptionAttachments(list,labels)},
  roofRenMemoryFoldActive:false,activeEndingCutscene:null,roofRenState:()=>({cabinetOpened:false}),
  KEY_CABINET_RING:{'C-17':{id:'key'}},playerKeys:new Set(),flagTest:name=>name==='roof.access',hideStaticTowerRope:()=>false,
  boothPresentationPose:'closed',brendanFinale:()=>null,hiddenCrossEnvelopeProp:()=>false,
  waterBodies:[{id:'basin',active:()=>true,levelM:8.2}],vigilCharacterIdForMesh:()=>null,
  boothGuardRenderInstance:p=>p,worldPaperIndex:()=>-1,storyGuidanceEmissive:()=>null,propEmissive:()=>null,doorRenderInstances:()=>[]};
const actual=new Function(...Object.keys(boundary),`${main.slice(start,end)}\nreturn worldRenderInstances;`)(...Object.values(boundary));
const final=actual('ground');assert.deepEqual(calls,[{group:'ground',inscriptions:false}]);
assert.ok(!final.some(p=>p.id.includes('academic-roof-home-cassette')),'hidden host must not leave floating letters');
const gate=final.find(p=>p.id==='roof-gate'),gateInk=final.find(p=>p.letteringHostId==='roof-gate');
assert.deepEqual([gate.x,gate.z,gate.yaw],[3,5,.2+Math.PI/2]);
assert.deepEqual([gateInk.x,gateInk.z,gateInk.yaw],[gate.x,gate.z,gate.yaw],'ink must follow the opened door pose');
const float=final.find(p=>p.id==='floating-host'),floatInk=final.find(p=>p.letteringHostId==='floating-host');
assert.equal(float.y,8.5);assert.equal(floatInk.y,float.y,'ink must follow the current waterline');

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
PROPS.propsInit(FP);const placed=PROPS.renderInstances(),actualHosts=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
for(const inscription of WORLD_INSCRIPTIONS){const actualHost=actualHosts.get(inscription.hostId);
  assert.ok(actualHost,`exact inscription host ${inscription.hostId} is absent`);
  assert.equal(actualHost.mesh,inscription.hostMesh);
  assert.equal(placed.filter(p=>p.letteringId===inscription.id).length,1,'each exact placed inscription must be attached once');
}
for(const entry of EXTERIOR_INSPECTABLES){const actualHost=actualHosts.get(entry.id),prop=PROPS.propById(entry.id),normal=entry.mountNormal;
  assert.equal(prop.mount,'wall');assert.equal(prop.frontAxis,'-z');assert.deepEqual(prop.wallContact&&{nx:prop.wallContact.nx,ny:prop.wallContact.ny},normal);
  assert.ok(Math.abs(Math.sin(actualHost.yaw)-normal.nx)<1e-9&&Math.abs(-Math.cos(actualHost.yaw)-normal.ny)<1e-9,'exterior inscription must face out into its street');
  const rear=PROP_BOUNDS.exterior_story_plaque.max[2],rearX=actualHost.x-Math.sin(actualHost.yaw)*rear,rearZ=actualHost.z+Math.cos(actualHost.yaw)*rear;
  const actualPlane=normal.nx?rearX:rearZ,expectedPlane=normal.nx?129:normal.ny<0?0:93;
  assert.ok(Math.abs(actualPlane-expectedPlane)<1e-8,'exterior stone rear must touch its actual compiled facade');
  assert.equal(prop.blocks,false);
}
console.log('prop inscription attachment specs passed');
