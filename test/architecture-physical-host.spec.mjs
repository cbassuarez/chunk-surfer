import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as P from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {architectureFittingsPlan,architectureWallRuns} from '../src/world/architecture-fittings.js';
import {ARCHITECTURE_ROOM_SCHEDULE} from '../src/data/architecture-fittings.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {F,CELL} from '../src/data/floorplan/legend.js';
import {pubFloorContacts} from './helpers/pub-floor-contact.mjs';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
const plan=architectureFittingsPlan(FP),runs=architectureWallRuns(FP);
P.propsInit(FP);const rendered=new Map(P.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
function volume(slice,x,z){
  const ix=Math.floor(x/CELL)-slice.originX,iz=Math.floor(z/CELL)-slice.originY;
  if(ix<0||iz<0||ix>=slice.w||iz>=slice.h)return{solid:true};
  const i=iz*slice.w+ix;
  return{solid:!!slice.solid[i],floor:slice.floor[i],ceil:slice.ceil[i],sky:!!(slice.flags[i]&F.SKY)};
}
function containsAir(v,y){return!v.solid&&y>=v.floor&&(v.sky||y<=v.ceil);}

test('the native loggia and gallery failures reconstruct logical walls with air behind their supposed mounting planes',()=>{
  // Native33010/c49 showed the loggia kit at z39, before the real enclosure.
  // Both samples are read directly from the production renderer's slice.
  const loggia=FP.physicalRenderPlanFor(28,557);
  assert.ok(FP.isSolid(28,558),'the paper plan alone claims a south wall');
  assert.ok(containsAir(volume(loggia,64.25,38.995),11.3));
  assert.ok(containsAir(volume(loggia,64.25,39.005),11.3));
  assert.ok(!runs.some(r=>r.ny===-1&&r.cells.some(c=>c.x===28&&c.y===557)),
    'no profile remains on the unsupported loggia seam');
  const gallery=FP.physicalRenderPlanFor(57,510);
  assert.ok(FP.isSolid(58,510),'the paper plan alone claims an east gallery wall');
  assert.ok(containsAir(volume(gallery,78.995,15.25),11.3));
  assert.ok(containsAir(volume(gallery,79.005,15.25),11.3));
  assert.ok(!runs.some(r=>r.nx===-1&&r.cells.some(c=>c.x===57&&c.y===510)),
    'the gallery seam cannot host joinery or services');
});

test('all actual rendered wall-kit bounds have continuous masonry behind and air in front throughout their footprint',()=>{
  const failures=[];
  for(const p of plan.placements.filter(p=>p.mount==='wall')){
    const r=rendered.get(p.id),b=PROP_BOUNDS[p.mesh],slice=FP.physicalRenderPlanFor(p.x/CELL,p.y/CELL);
    assert.ok(r&&b,p.id);
    // This check starts with resolved runtime poses and actual packed bounds,
    // independently of the wall-selection predicate and its advertised sizes.
    const c=Math.cos(r.yaw),s=Math.sin(r.yaw),nx=-s,nz=c;
    const from=b.min[0]*(r.scaleX||1),to=b.max[0]*(r.scaleX||1);
    const bottom=r.y+b.min[1]+.0005,top=r.y+b.max[1]-.0005;
    const count=Math.max(1,Math.ceil((to-from)/.125));
    for(let i=0;i<=count;i++){
      const t=from+(to-from)*i/count,x=r.x+c*t-s*b.min[2],z=r.z+s*t+c*b.min[2];
      const front=volume(slice,x+nx*.005,z+nz*.005),back=volume(slice,x-nx*.005,z-nz*.005);
      if(front.solid||front.floor>bottom+.0001||!front.sky&&front.ceil<top-.0001
        ||!back.solid&&top>back.floor+.0001&&(back.sky||bottom<back.ceil-.0001)){
        failures.push({id:p.id,x,z,bottom,top,front,back});break;
      }
    }
  }
  assert.deepEqual(failures,[],'a logical-space join or wrong ceiling must never become a floating mounted assembly');
});

test('physical rehosting retains the complete finite room schedule and every routine member',()=>{
  assert.deepEqual(plan.rooms.map(p=>p.id),ARCHITECTURE_ROOM_SCHEDULE.map(p=>p.id));
  assert.deepEqual(plan.statistics.unresolvedRooms,[]);
  assert.equal(new Set(plan.placements.map(p=>p.id)).size,plan.placements.length);
  for(const room of plan.rooms){
    if(['retain-specialist','aggregate'].includes(room.treatment))continue;
    assert.ok(room.placements.length>0,`${room.id}: routine coverage remains`);
    for(const id of room.placements)assert.ok(rendered.has(id),`${id}: resolves to an actual render instance`);
  }
  const routines=['switch','socket-a','socket-b','callpoint','sounder','radiator','grille','use-wear'];
  for(const room of['academic-loggia','academic-gallery'])for(const suffix of routines)
    assert.ok(plan.placements.some(p=>p.id===`architecture-space-${room}-${suffix}`),`${room}: preserve ${suffix}`);
  assert.equal(plan.statistics.categories.electrical,122);
  assert.equal(plan.statistics.categories.fire,64);
  assert.equal(plan.statistics.categories.hvac,74);
  assert.equal(plan.statistics.categories.wear,42);
  assert.equal(plan.statistics.categories.maintenance,5);
});

test('pub thresholds meet the actual packed mesh floor, which deliberately covers the lowered exterior slice',()=>{
  const report=pubFloorContacts({rendered,thresholds:plan.placements.filter(p=>/^architecture-threshold-pub-/.test(p.id)),bounds:PROP_BOUNDS});
  assert.equal(report.contacts.length,3);
  assert.ok(report.horizontalFloorTriangles>0,'use emitted packed floor triangles, not only a declared floor level');
  assert.deepEqual(report.contacts.filter(p=>!p.passed),[],
    'each threshold overlaps its existing mesh finish and leaves at most a4mm edge above it');
});
