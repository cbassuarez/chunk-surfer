import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { conservatory, MAIN_STAIR_LAYOUT } from '../src/data/floorplan/conservatory.js';
import { MAIN_STAIR_GEOMETRY } from '../src/data/main-stair-geometry.js';
import * as FP from '../src/world/floorplan.js';

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[],
});

const plan=FP.floorplan();
const runs=plan.stairRuns.filter((run)=>run.owner==='main-open-well');
assert.deepEqual(runs.map((run)=>run.rises),[14,14,15,15]);
assert.ok(runs.every((run)=>run.analyticHelix&&run.treadCount===run.rises),
  'every visible tread has exactly one navigable tread address');
const angleDelta=(a,b)=>{let d=a-b;while(d>Math.PI)d-=Math.PI*2;while(d<=-Math.PI)d+=Math.PI*2;return d;};

for(const run of runs){
  const stepM=[];
  for(let lane=0;lane<run.width;lane++){
    for(let tread=0;tread<run.rises;tread++){
      const x=run.logical0[0]+run.logicalDx*tread+run.logicalPx*lane;
      const y=run.logical0[1]+run.logicalDy*tread+run.logicalPy*lane;
      const expected=run.fromH+(run.toH-run.fromH)*(tread/run.rises);
      assert.ok(Math.abs(FP.floorAt(x,y)-expected)<1e-5,`${run.flight} tread ${tread} collision matches its visible riser`);
      const physical=FP.logicalToPhysical(x,y);
      assert.ok(Math.abs(FP.renderedFloorAt(x,y,physical.x,physical.z)-expected)<1e-5,
        `${run.flight} tread ${tread} camera and collision heights agree`);
      if(tread<run.rises-1){
        const nx=x+run.logicalDx,ny=y+run.logicalDy;
        assert.ok(FP.canStep(x,y,nx,ny).ok&&FP.canStep(nx,ny,x,y).ok,
          `${run.flight} tread ${tread} is bidirectional`);
        const next=FP.logicalToPhysical(nx,ny);
        stepM.push(Math.hypot(next.x-physical.x,next.z-physical.z)/plan.scale);
        const physicalHeading=Math.atan2(next.x-physical.x,-(next.z-physical.z));
        const logicalHeading=Math.atan2(run.logicalDx,-run.logicalDy);
        const screenHeading=logicalHeading+FP.arcYawOffset(x,y,physical.x,physical.z);
        assert.ok(Math.abs(angleDelta(screenHeading,physicalHeading))<.13,
          `${run.flight} camera faces along the helix tangent instead of its radial line`);
      }
      if(lane<run.width-1){
        const nx=x+run.logicalPx,ny=y+run.logicalPy;
        assert.ok(FP.canStep(x,y,nx,ny).ok&&FP.canStep(nx,ny,x,y).ok,
          `${run.flight} tread ${tread} permits lateral travel`);
      }
    }
  }
  assert.ok(Math.min(...stepM)>.18&&Math.max(...stepM)<.55,
    `${run.flight} has bounded physical pacing instead of raster jumps (${Math.min(...stepM)}..${Math.max(...stepM)}m)`);
}

for(const portal of FP.edgePortalState().filter((entry)=>[
  'ground-hall-to-lower-flight','lower-half-flight-seam','lower-flight-to-upper-floor-landing',
  'upper-floor-landing-to-academic-flight','upper-half-flight-seam','academic-flight-to-floor-landing',
].includes(entry.id))){
  for(const pair of portal.pairs){
    const forward=FP.canStep(pair.from.x,pair.from.y,pair.from.x+portal.from.exit.x,pair.from.y+portal.from.exit.y);
    const reverse=FP.canStep(pair.to.x,pair.to.y,pair.to.x+portal.to.exit.x,pair.to.y+portal.to.exit.y);
    assert.equal(forward.edgePortal,portal.id,`${portal.id} crosses forward`);
    assert.equal(reverse.edgePortal,portal.id,`${portal.id} crosses backward`);
    const a=FP.logicalToPhysical(pair.from.x,pair.from.y),b=FP.logicalToPhysical(pair.to.x,pair.to.y);
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<=portal.tolerance+1e-6,`${portal.id} stays inside its explicit transition apron`);
  }
}

// These hashes were captured before the stair rebuild. They cover logical and
// physical coordinates, floor/ceiling, material, flags and ownership, so a stair
// edit cannot silently resize either landing room or the practice corridor.
const roomHash=(owner)=>{
  const cells=[];
  for(let y=0;y<plan.h;y++)for(let x=0;x<plan.w;x++){
    const i=y*plan.w+x;if(plan.owner[i]!==owner)continue;
    cells.push([x,y,plan.solid[i],plan.floor[i],plan.ceil[i],plan.flags[i],plan.zone[i],plan.material[i],plan.physicalX[i],plan.physicalY[i],plan.layer[i],plan.space[i],plan.renderGroup[i]]);
  }
  return crypto.createHash('sha256').update(JSON.stringify(cells)).digest('hex');
};
assert.equal(roomHash('grand_ground_stair_hall'),'cb9be74e64b1f226acb3782d4e83d6b321dc3b1c6b9312b8ac759be1f7d9a258');
assert.equal(roomHash('grand_upper_stair_hall'),'59f5833a906073cc9c18963dea91ba75a1e12a6af0c8bb394f7512b782439fbf');
assert.equal(roomHash('practice_wing'),'c9bdfe0e13069c1e0f7dd065ccb4b322b39bd2976691b0a20b9ababdf88582e9');

const hallLogical=FP.toRuntimePoint(MAIN_STAIR_LAYOUT.groundHall);
const hallPhysical=FP.logicalToPhysical(hallLogical.x,hallLogical.y);
assert.deepEqual(MAIN_STAIR_GEOMETRY.floor1Aim,{x:hallPhysical.x/plan.scale,z:hallPhysical.z/plan.scale},
  'the Floor 1 transition aims at the actual immutable hall centre');

console.log('main stair analytic navigation contracts passed');
