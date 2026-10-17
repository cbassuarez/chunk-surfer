import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ACADEMIC_ROOF, ACADEMIC_ROOF_STAIR, ACADEMIC_ROOF_PROPS, roofPointToPhysical } from '../src/data/academic-roof.js';
import { F, MATERIAL, ZONE, STEP_UP, isOutdoorZone } from '../src/data/floorplan/legend.js';
import { BUILDING_MAP } from '../src/data/building-map.js';
import { resolveLightingContext, resolveLocalLights } from '../src/data/conservatory-lights.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});
PROPS.propsInit(FP);
assert.equal(FP.physicalSpanData().overlaps.length,0,'exterior stair must not overlap occupied volumes');
const runtime=point=>FP.toRuntimePoint(point);
const start=runtime({x:44,y:243.5});
const galleryApproach=start;
assert.equal(PROPS.pickProp(galleryApproach.x,galleryApproach.y,0,3.2,{yaw:0,pitch:-.03})?.id,
  'roof-gate','the north gallery leaf must focus when approached facing outward');
const inRoofRoute=({x,y})=>(x>=84&&x<100&&y>=478&&y<500)||
  (x>=316&&x<380&&y>=548&&y<586)||
  (x>=380&&x<428&&y>=540&&y<594);
const walk=(from)=>{
  const visited=new Map(),queue=[from];visited.set(`${from.x},${from.y}`,null);
  for(let i=0;i<queue.length;i++)for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
    const here=queue[i],step=FP.canStep(here.x,here.y,here.x+dx,here.y+dy,{keys:new Set(['master','chapel'])});
    if(!step.ok)continue;
    const next=step.redirect||{x:here.x+dx,y:here.y+dy},id=`${next.x},${next.y}`;
    if(!inRoofRoute(next)||visited.has(id)||!PROPS.propCanOccupy(next.x,next.y))continue;
    visited.set(id,here);queue.push(next);
  }
  return visited;
};
const reachable=walk(start);
for(const name of['entry','ren','seal','sitWest','sitEast','ladderTop']){
  const p=runtime(ACADEMIC_ROOF[name]);
  assert.ok(reachable.has(`${p.x},${p.y}`),`${name} reachable through the north facade stair`);
  assert.equal(FP.floorAt(p.x,p.y),17,`${name} stands on the roof, not the gallery`);
  assert.equal(FP.zoneAt(p.x,p.y),ZONE.academicRoof);
  assert.ok(FP.flagsAt(p.x,p.y)&F.SKY);
}
const returned=walk(runtime(ACADEMIC_ROOF.ren));
assert.ok(returned.has(`${start.x},${start.y}`),'Ren and both glass bays have an ordinary return to the north gallery');
assert.equal(isOutdoorZone(ZONE.academicRoof),true);

// The whole supported lantern is collision, not a large invisible fall trigger.
for(let y=276;y<289;y+=.5)for(let x=196;x<206;x+=.5){
  const p=FP.toRuntimePoint({x,y},{center:false});
  assert.equal(FP.floorAt(p.x,p.y),17);
  assert.equal(FP.materialAt(p.x,p.y),MATERIAL.roofGlass);
  assert.equal(FP.isSolid(p.x,p.y),false);
}
// The rim contributes a finite-height air span for the renderer, while its
// collision-only status rejects every attempted traversal. A solid '#' rim
// inherited the interior 24m ceiling and produced a seven-metre view blocker.
let renderedRim=0;
for(let y=270;y<297;y+=.5)for(let x=190;x<214;x+=.5){
  if(x>=191&&x<213&&y>=271&&y<296)continue;
  if(x>=205&&x<208&&y>=270&&y<271)continue; // guarded north bridge threshold
  const p=FP.toRuntimePoint({x,y},{center:false});
  assert.equal(FP.canStep(p.x+1,p.y,p.x,p.y,{}).ok,false,'every perimeter cell remains impassable');
  const at=FP.logicalToPhysical(p.x,p.y);
  const spans=FP.physicalSpanData().cells.get(`${Math.floor(at.x)},${Math.floor(at.z)}`)||[];
  for(const span of spans.filter(span=>span.owner==='academic_roof')){
    assert.ok(span.ceil<=18.10001,'physical roof rim rises only1.1m, preserving the city view');renderedRim++;
  }
}
assert.ok(renderedRim>250,'the finite-height roof rim is present in the physical renderer');
// The outdoor ray slice must keep a continuous sky ceiling across the low
// parapet. Otherwise its 18.1m collision span cuts a six-metre vertical slab
// out of the 24m exterior sky even though the native mesh is only 1.1m high.
const entryPoint=runtime(ACADEMIC_ROOF.entry);
const outdoorSlice=FP.physicalRenderPlanFor(entryPoint.x,entryPoint.y);
const galleryPoint=runtime(ACADEMIC_ROOF.gateInspect);
const gallerySlice=FP.physicalRenderPlanFor(galleryPoint.x,galleryPoint.y);
const firstLanding=runtime(ACADEMIC_ROOF.stairFoot);
const landingSlice=FP.physicalRenderPlanFor(firstLanding.x,firstLanding.y);
for(const [label,at] of [
  ['first exterior landing',ACADEMIC_ROOF.stairFoot],
  ...[282.25,283.25].flatMap(y=>Array.from({length:28},(_,index)=>[
    `lower flight half-metre band ${index+1} at y=${y}`,{x:160.25+index*.5,y},
  ])),
]){
  const cell=runtime(at);
  const physical=FP.logicalToPhysical(cell.x,cell.y);
  assert.equal(physical.renderGroup,'academicRoof',`${label} must select the outdoor roof render group`);
  assert.equal(FP.zoneAt(cell.x,cell.y),ZONE.academicRoof,`${label} must keep the outdoor light context`);
}
const roofLightContext=resolveLightingContext({group:'academicRoof',zone:ZONE.academicRoof,
  spaceId:FP.logicalToPhysical(firstLanding.x,firstLanding.y).spaceId});
assert.ok(resolveLocalLights(roofLightContext,{timeSec:0,liveCircuits:new Set()})
  .some(light=>light.id==='roof-north-lower-security'&&light.intensity>0),
  'the entire ascent group can select the maintained lower facade security light');
assert.ok(PROPS.renderInstances({group:'ground'}).some(prop=>prop.id==='district-north-car-east'),
  'the exterior ground group has the actual north-street car for roof sightlines');
const physicalCell=(slice,x,z)=>{
  const i=(z*2-slice.originY)*slice.w+(x*2-slice.originX);
  return {floor:slice.floor[i],flags:slice.flags[i],zone:slice.zone[i]};
};
for(const [label,x,z,height,logical] of [
  ['lower flight',86,-2,11.75,{x:166,y:283}],
  ['turn landing',80,-4,13.5,ACADEMIC_ROOF.stairTurn],
  ['head landing',88,-4,17,ACADEMIC_ROOF.stairHead],
  ['roof bridge',88,0,17,ACADEMIC_ROOF.northBridge],
]){
  const cell=physicalCell(outdoorSlice,x,z);
  const foot=runtime(logical);
  assert.equal(cell.zone,ZONE.academicRoof,`${label} belongs to the service ascent`);
  assert.ok(Math.abs(FP.floorAt(foot.x,foot.y)-height)<.25,`${label} keeps its real collision height`);
  assert.ok(cell.floor<height-2,`${label} renders ground below open grating, not an opaque high tread`);
  assert.ok(cell.flags&F.SKY,`${label} must leave the emergency stair open to the sky`);
}
assert.ok(physicalCell(gallerySlice,94,0).flags&F.SKY,
  'the open exterior landing admits sky through the gallery door');
assert.ok(physicalCell(gallerySlice,94,0).floor<8,
  'the opened gallery door sees through grating to the drop, not an opaque sector slab');
assert.equal(physicalCell(gallerySlice,94,3).floor,10,
  'the indoor gallery keeps its own solid safe floor up to the threshold');
assert.equal(physicalCell(gallerySlice,94,-5).zone,ZONE.street,
  'the opened north door looks into the exterior night instead of a loaded wall');
assert.equal(physicalCell(gallerySlice,94,-20).zone,ZONE.street,
  'the aperture stays clear all the way to the city horizon from inside the gallery');
assert.equal(physicalCell(landingSlice,84,-10).floor,0,
  'the visible north street below the fire escape uses the actual grade datum');
for(const logical of[{x:190,y:283},{x:213,y:283},{x:201,y:296}]){
  const rimPoint=runtime(logical);
  const physical=FP.logicalToPhysical(rimPoint.x,rimPoint.y);
  const i=(Math.floor(physical.z)-outdoorSlice.originY)*outdoorSlice.w
    +(Math.floor(physical.x)-outdoorSlice.originX);
  assert.equal(outdoorSlice.zone[i],ZONE.academicRoof,'roof rim survives in the exterior slice');
  assert.equal(outdoorSlice.ceil[i],24,'roof rim shares the outdoor sky ceiling');
}
for(const flight of ACADEMIC_ROOF_STAIR.flights){
  assert.ok(Math.abs(flight.toH-flight.fromH)/flight.rises<STEP_UP);
  const run=FP.floorplan().stairRuns.find(run=>run.owner==='academic-roof-service'&&run.flight===flight.id);
  assert.ok(run,'both roof flights compile as real stair runs');
  assert.equal(run.width,4,'two metres of clear climbing width');
}
assert.equal(FP.edgePortalState().find(portal=>portal.id==='academic-loggia-to-roof-service')?.lanes,3,
  'north gallery threshold crosses all three half-metre lanes in both directions');
assert.equal(FP.edgePortalState().find(portal=>portal.id==='academic-roof-service-switchback')?.lanes,3,
  'switchback joins its two height-separated logical strips in both directions');
assert.equal(FP.edgePortalState().find(portal=>portal.id==='academic-roof-service-to-loop')?.lanes,3,
  'roof bridge crosses all three half-metre lanes in both directions');

const bottom=runtime(ACADEMIC_ROOF.ladderBottom),top=runtime(ACADEMIC_ROOF.ladderTop);
const bp=FP.logicalToPhysical(bottom.x,bottom.y),tp=FP.logicalToPhysical(top.x,top.y);
assert.equal(bp.x,tp.x);assert.equal(bp.z,tp.z);
assert.equal(tp.y-bp.y,7,'service shortcut is genuinely the same X/Z at roof height');
for(const prop of ACADEMIC_ROOF_PROPS){
  const p=FP.toRuntimePoint({x:prop.x,y:prop.y},{center:false});
  assert.equal(FP.isSolid(p.x,p.y),false,`${prop.id} has a loaded placement cell`);
  if(prop.inspectAt){const at=runtime(prop.inspectAt);assert.equal(FP.isSolid(at.x,at.y),false,`${prop.id} has a reachable interaction anchor`);}
}
assert.equal(BUILDING_MAP.spaces.find(space=>space.id==='space:academic-roof')?.floorId,'academicRoof');
assert.deepEqual(roofPointToPhysical(ACADEMIC_ROOF.ren),{x:93,y:5});

const stats=JSON.parse(readFileSync(new URL('../public/assets/conservatory-props.stats.json',import.meta.url),'utf8'));
for(const name of['academic_roof_structure','academic_roof_glazing','academic_roof_service_stair','academic_roof_service_ladder','academic_roof_ren','academic_roof_ren_ritual','academic_roof_seal_imprint']){
  assert.ok(stats.meshes[name]?.triangles>20,`${name} is built in the production pack`);
}
assert.ok(stats.bounds.academic_roof_ren.max[1]>1.78,'Ren is a full-height body');
assert.ok(stats.bounds.academic_roof_ren.max[0]-stats.bounds.academic_roof_ren.min[0]>1,
  'Ren’s lost hemisphere makes a gameplay-distance silhouette wider than an ordinary torso');
assert.ok(stats.bounds.academic_roof_ren_ritual.min[2]<-.6,'ritual pose physically reaches toward the consenting player');
console.log('academic roof: north exterior ascent, gate focus, safe loop/glass, return, service shortcut and native mesh contracts pass');
