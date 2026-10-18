import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILDING_WINDOWS} from '../src/data/building-windows.js';
import {CELL,EYE,F,MATERIAL} from '../src/data/floorplan/legend.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import {buildingWindowForObserver,buildingWindowExteriorPlane,applyBuildingWindowView} from '../src/world/building-window-views.js';

test('outlook selection distinguishes both academic rooms and exterior clipping retains only their outward side',()=>{
 for(const window of BUILDING_WINDOWS){
  const p=window.physical,n=window.inwardNormal;
  const x=(p.x0+p.x1)/2+n.x*2,z=(p.z0+p.z1)/2+n.z*2;
  const observer={x,z,y:window.roomFloor,spaceId:window.space,renderGroup:window.group};
  assert.equal(buildingWindowForObserver(observer).id,window.id);
  const plane=buildingWindowExteriorPlane(window),dot=(x,z)=>plane[0]*x+plane[2]*z+plane[3];
  assert.ok(dot(x,z)<0,'interior scenic protrusions are clipped');
  assert.ok(dot(x-n.x*5,z-n.z*5)>0,'genuine exterior geometry survives');
 }
 assert.equal(buildingWindowForObserver({x:58,z:3,y:0,spaceId:'academic',renderGroup:'academic'}),null,'a different storey is not granted an outlook');
});

test('window view wedges retain the aperture sill, head, jambs and pool chapel soffit',()=>{
 for(const window of BUILDING_WINDOWS){
  const w=300,h=300,originX=-30,originY=-30,count=w*h;
  const slice={w,h,originX,originY,solid:new Uint8Array(count).fill(1),floor:new Float32Array(count),ceil:new Float32Array(count),flags:new Uint8Array(count),zone:new Uint8Array(count),material:new Uint8Array(count)};
  const p=window.physical,n=window.inwardNormal;
  applyBuildingWindowView(slice,{x:(p.x0+p.x1)/2+n.x*2,z:(p.z0+p.z1)/2+n.z*2,y:window.roomFloor,spaceId:window.space,renderGroup:window.group});
  const at=(x,z)=>(Math.round(z*2)-originY)*w+Math.round(x*2)-originX;
  const centerX=(p.x0+p.x1)/2,centerZ=(p.z0+p.z1)/2;
  const aperture=at(centerX,centerZ);
  assert.equal(slice.solid[aperture],0,'the approved aperture replaces any stale physical span');
  assert.equal(slice.floor[aperture],Math.fround(window.sill),'the aperture keeps its real sill');
  assert.equal(slice.ceil[aperture],Math.fround(window.head),'the aperture keeps its real head');
  assert.equal(slice.flags[aperture],0,'the enclosed aperture is not open sky');
  assert.equal(slice.material[aperture],MATERIAL.doorGlassDuct);
  const jamb=p.axis==='x'?at(centerX,p.from-.5):at(p.from-.5,centerZ);
  assert.equal(slice.solid[jamb],1,'the aperture must not remove its side jamb');
  const firstExterior=p.axis==='x'?at(n.x>0?p.x0-CELL:p.x1,centerZ):at(centerX,n.z>0?p.z0-CELL:p.z1);
  assert.equal(slice.solid[firstExterior],0,'the aperture joins the first exterior cell with no masonry strip');
  assert.equal(slice.solid[at(centerX-n.x*3,centerZ-n.z*3)],0,'actual exterior beyond the aperture is rendered as air');
  if(window.wall==='south'){assert.equal(slice.ceil[at(87,53)],Math.fround(4.6));assert.equal(slice.flags[at(87,53)]&F.SKY,0);}
 }
});

test('the depressed pool basin and deck keep the same real south outlook',()=>{
 const window=BUILDING_WINDOWS.find(w=>w.id==='W4-pool-south');
 const observer={x:84,z:48.5,spaceId:'natatorium',renderGroup:'ground'};
 for(const y of[-2,-1.6,0]){
  assert.equal(buildingWindowForObserver({...observer,y})?.id,window.id,`pool floor ${y} lost its outlook`);
  const w=20,h=18,originX=156,originY=94,count=w*h;
  const slice={w,h,originX,originY,solid:new Uint8Array(count).fill(1),floor:new Float32Array(count),ceil:new Float32Array(count),flags:new Uint8Array(count),zone:new Uint8Array(count),material:new Uint8Array(count)};
  assert.equal(applyBuildingWindowView(slice,{...observer,y})?.id,window.id);
  const at=(x,z)=>(Math.round(z*2)-originY)*w+Math.round(x*2)-originX;
  const aperture=at(84,50.5);
  assert.equal(slice.solid[aperture],0,'basin observers retain the actual window air interval');
  assert.equal(slice.floor[aperture],Math.fround(window.sill));
  assert.equal(slice.ceil[aperture],Math.fround(window.head));
  assert.equal(slice.solid[at(84,51)],0,'the outer-plane row is exterior air too');
  assert.equal(slice.solid[at(84,53)],0,'exterior behind the opening stays air from the basin');
 }
 assert.equal(buildingWindowForObserver({...observer,y:-4}),null,'the basement receives no pool outlook');
 assert.equal(buildingWindowForObserver({...observer,y:4.8}),null,'the upper storey receives no pool outlook');
});

test('production basin and deck slices keep the whole W4 throat open without permitting body crossing',()=>{
 FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[],
 });
 const window=BUILDING_WINDOWS.find(w=>w.id==='W4-pool-south');
 for(const observer of[{x:84,z:47.5,floor:-2,pitch:.62},{x:84,z:49,floor:0,pitch:0}]){
  const rx=observer.x/CELL,ry=observer.z/CELL;
  assert.equal(FP.floorAt(rx,ry),observer.floor,'the test starts on the real basin/deck floor');
  const slice=FP.physicalRenderPlanFor(rx,ry);
  const at=(x,z)=>(Math.round(z/CELL)-slice.originY)*slice.w+Math.round(x/CELL)-slice.originX;
  for(let z=window.physical.z0;z<window.physical.z1;z+=CELL){
   for(let x=window.physical.x0;x<window.physical.x1;x+=CELL){
    const i=at(x,z);
    assert.equal(slice.solid[i],0,`floor ${observer.floor}: blocked aperture at ${x},${z}`);
    assert.equal(slice.rgba[i*4+2]&F.SOLID,0,'the delivered renderer texture also contains air');
    assert.equal(slice.floor[i],Math.fround(window.sill));
    assert.equal(slice.ceil[i],Math.fround(window.head));
    assert.equal(slice.flags[i],0,'glass remains enclosed below the real lintel');
    assert.deepEqual(FP.canStep(x/CELL,z/CELL-1,x/CELL,z/CELL,{keys:new Set(['master'])}),{ok:false,why:'wall'},
     'rendering the aperture must not open a body route through the wall');
   }
  }
  // The actual raised basin camera reaches the opening above its sill. Every
  // crossed interval, including the formerly skipped outer-plane row, admits
  // that ray; a stale lower-storey ceiling or solid strip would fail here.
  for(let z=window.physical.z0;z<=window.physical.z1+CELL;z+=CELL){
   const i=at(observer.x,z),height=observer.floor+EYE+(z-observer.z)*Math.tan(observer.pitch);
   assert.equal(slice.solid[i],0,`floor ${observer.floor}: the outlook ray meets masonry at z=${z}`);
   assert.ok(height>slice.floor[i]&&height<slice.ceil[i],`floor ${observer.floor}: the outlook ray meets a riser/header at z=${z}`);
  }
  const soffit=at(87,53);
  assert.equal(slice.ceil[soffit],Math.fround(4.6),'the real chapel/practice soffit survives the outward view');
  assert.equal(slice.flags[soffit]&F.SKY,0,'there is no invented sky through the overhead building');
 }
});
