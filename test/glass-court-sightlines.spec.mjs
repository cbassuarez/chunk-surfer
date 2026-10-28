import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL,F,ZONE} from '../src/data/floorplan/legend.js';
import {districtLogicalAt} from '../src/data/exterior-district.js';
import {GLASS_COURT as C} from '../src/data/glass-court.js';
import {GLASS_COURT_SIGHTLINES as S} from '../src/data/glass-court-sightlines.js';
import {buildingWindowForObserver,buildingWindowForExteriorObserver,applyBuildingWindowView,
 applyBuildingWindowInteriorView,buildingWindowInteriorPlane,buildingWindowPortal} from '../src/world/building-window-views.js';
import {isBuildingWindowInterior,buildingWindowInteriorInstance,shouldHideCrossEnvelopeProp,worldPropVisibilityKey} from '../src/game/prop-visibility.js';

FP.compile(conservatory.levels,conservatory);
const source=FP.physicalSpanData();
const body=(x,z)=>({x:Math.round((x-.25)/CELL),y:Math.round((z-.25)/CELL)});
const authored=districtLogicalAt(84.25,-2.75),outsideRuntime=body(authored.x,authored.y);
const outside={x:84.25,z:-2.75,y:0,zone:FP.zoneAt(outsideRuntime.x,outsideRuntime.y)};
const greenhouse={x:84.25,z:30.25,y:0,spaceId:'natatorium',renderGroup:'ground'};
const copy=s=>({...s,solid:s.solid.slice(),floor:s.floor.slice(),ceil:s.ceil.slice(),flags:s.flags.slice(),zone:s.zone.slice(),material:s.material.slice()});
const index=(s,x,z)=>(Math.floor(z/CELL)-s.originY)*s.w+Math.floor(x/CELL)-s.originX;

test('greenhouse borrows the real foyer outlook; the ordinary pool keeps W4',()=>{
 assert.equal(buildingWindowForObserver(greenhouse)?.id,S.windowId);
 assert.equal(buildingWindowForObserver({...greenhouse,x:84,z:48.5,y:-2})?.id,'W4-pool-south');
 assert.equal(buildingWindowForObserver({...greenhouse,y:4.8}),null);
 assert.equal(buildingWindowForExteriorObserver(outside)?.id,S.windowId);
 assert.equal(buildingWindowForExteriorObserver({...outside,z:30}),null);
 assert.equal(buildingWindowForExteriorObserver({...outside,zone:ZONE.foyer}),null);
});

test('outside restoration contains actual enclosed volumes, opaque jambs and the same D0 throat',()=>{
 const before=FP.physicalRenderPlanFor(outsideRuntime.x,outsideRuntime.y),slice=copy(before);
 assert.equal(applyBuildingWindowInteriorView(slice,outside,source.cells)?.id,S.windowId);
 assert.equal(slice.solid[index(slice,84.25,15.25)],0);
 assert.equal(slice.floor[index(slice,84.25,15.25)],0);
 assert.equal(slice.ceil[index(slice,84.25,15.25)],17,'the real garden atrium remains full height');
 assert.equal(slice.solid[index(slice,83.25,3.25)],1,'the original wall beside W3 remains masonry');
 assert.equal(slice.floor[index(slice,84.25,3.25)],Math.fround(1.05));
 assert.equal(slice.ceil[index(slice,84.25,3.25)],Math.fround(3.45));
 assert.equal(slice.floor[index(slice,84.25,27.25)],0);
 assert.equal(slice.ceil[index(slice,84.25,27.25)],S.fanlight.head);
 const hall=index(slice,110.25,30.25);assert.equal(slice.floor[hall],before.floor[hall]);assert.equal(slice.ceil[hall],before.ceil[hall]);
});

test('an actual ridge-height ray fits W3, the atrium and the high D0 fanlight',()=>{
 const slice=copy(FP.physicalRenderPlanFor(outsideRuntime.x,outsideRuntime.y));
 applyBuildingWindowInteriorView(slice,outside,source.cells);
 const eye={x:84.25,y:1.65,z:-2.75},target={x:84.25,y:C.drawnFloor+C.ridge,z:30};
 for(let z=eye.z+.5;z<target.z;z+=.5){
  const t=(z-eye.z)/(target.z-eye.z),height=eye.y+(target.y-eye.y)*t,i=index(slice,eye.x,z);
  assert.equal(slice.solid[i],0,`ridge ray meets rock atz${z}`);
  assert.ok(height>slice.floor[i]&&height<slice.ceil[i],`ridge ray hits a header atz${z}: ${height}/${slice.ceil[i]}`);
 }
});

test('inside borrowed outlook preserves the occupied atrium and opens only the real fanlight',()=>{
 const point=body(greenhouse.x,greenhouse.z),before=FP.physicalRenderPlanFor(point.x,point.y),slice=copy(before);
 applyBuildingWindowView(slice,greenhouse);
 for(const z of[5.25,10.25,15.25,20.25,26.25]){
  const i=index(slice,84.25,z);assert.equal(slice.floor[i],before.floor[i]);assert.equal(slice.ceil[i],before.ceil[i]);
 }
 assert.equal(slice.ceil[index(slice,84.25,27.25)],S.fanlight.head);
 assert.equal(FP.ceilAt(point.x,54),Math.fround(3.4),'the logical D0 ceiling has not been raised');
 const door=FP.doorState().find(d=>d.id===S.fanlight.doorId);assert.equal(door.aperture.height,3.4);assert.equal(door.leaf.height,2.28);
 assert.equal(FP.isSolid(...Object.values(body(83.25,3.25))),true,'the window has not become a walking bypass');
});

test('outside prop admission is clipped to W3 and never admits a main stair or hostile planted body',()=>{
 const window=buildingWindowForExteriorObserver(outside);
 const fitting={id:'atrium-public-fittings',mesh:'atrium_public_fittings',x:85.5,y:0,z:15,zone:ZONE.foyer};
 assert.equal(shouldHideCrossEnvelopeProp(fitting,{observerZone:outside.zone}),true);
 assert.equal(shouldHideCrossEnvelopeProp(fitting,{observerZone:outside.zone,exteriorWindow:window}),false);
 const framed=buildingWindowInteriorInstance(fitting,window);
 assert.deepEqual(framed.exteriorClipPlane,buildingWindowInteriorPlane(window));
 assert.deepEqual(framed.exteriorPortal,buildingWindowPortal(window));assert.equal(framed.noShadow,true);
 assert.equal(isBuildingWindowInterior({id:'main-open-well-stair',mesh:'main_open_well_stair',x:63,y:0,z:36,zone:ZONE.stair},window),false);
 assert.equal(isBuildingWindowInterior({id:'glass-court-planted-head',mesh:'apparition_pose_head_turn',x:76.6,y:0,z:28.6,zone:ZONE.glasshouse},window),false);
 assert.notEqual(worldPropVisibilityKey({group:'ground',zone:outside.zone}),worldPropVisibilityKey({group:'ground',zone:outside.zone,exteriorWindowId:window.id}));
});

test('the production floorplan adapter caches framed and ordinary exterior slices separately',()=>{
 const front=FP.physicalRenderPlanFor(outsideRuntime.x,outsideRuntime.y);
 const distant=districtLogicalAt(120.25,-2.75),point=body(distant.x,distant.y);
 const away=FP.physicalRenderPlanFor(point.x,point.y);
 assert.notEqual(front.key,away.key);assert.ok(front.key.endsWith(S.windowId));
 assert.ok(away.key.endsWith('no-inward-window'));
 const garden=index(front,84.25,15.25);
 assert.equal(front.floor[garden],0);assert.equal(front.ceil[garden],17);
 assert.notEqual(away.floor[garden],0,'an unrelated street observer does not receive a second exposed interior');
 const jamb=index(front,83.25,3.25);assert.equal(front.solid[jamb],1);assert.equal(front.rgba[jamb*4+2]&F.SOLID,F.SOLID);
 for(const [x,z] of [[65.25,9.25],[110.25,30.25]]){
  const i=index(front,x,z);
  for(const field of ['solid','floor','ceil','flags','zone','material'])assert.equal(front[field][i],away[field][i],`${field} changed outside the two approved existing rooms`);
 }
 assert.equal(FP.physicalRenderPlanFor(outsideRuntime.x,outsideRuntime.y),front,'ordinary cache reuse retains the same framed slice');
});

test('actual delivered greenhouse and street slices admit reciprocal views without changing the door',()=>{
 const insidePoint=body(greenhouse.x,greenhouse.z),inside=FP.physicalRenderPlanFor(insidePoint.x,insidePoint.y);
 const front=FP.physicalRenderPlanFor(outsideRuntime.x,outsideRuntime.y);
 assert.ok(inside.key.includes(S.windowId));
 for(const slice of [inside,front]){
  const d0=index(slice,84.25,27.25);assert.equal(slice.floor[d0],0);assert.equal(slice.ceil[d0],5.5);
  assert.equal(slice.rgba[d0*4+2]&F.SOLID,0,'the final renderer bytes contain the real high opening');
  for(let z=3.25;z<=30.25;z+=.5){
   const i=index(slice,84.25,z);assert.equal(slice.solid[i],0,`eye ray meets rock at${z}`);
   assert.ok(1.65>slice.floor[i]&&1.65<slice.ceil[i],`eye ray meets a riser/header at${z}`);
  }
 }
 assert.equal(FP.ceilAt(168,54),Math.fround(3.4));
 assert.equal(FP.doorState().find(d=>d.id==='pool-lobby').aperture.height,3.4);
 assert.equal(FP.canStep(168,53,168,54,{keys:new Set()}).ok,false,'a closed D0 is still a closed ordinary door');
 assert.equal(FP.canStep(168,5,168,6,{keys:new Set()}).ok,false,'W3 remains fixed glazing rather than an entrance');
});
