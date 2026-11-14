import test from 'node:test';
import assert from 'node:assert/strict';
import {conservatory as C,MAIN_STAIR_LAYOUT} from '../src/data/floorplan/conservatory.js';
import {MAIN_STAIR_GEOMETRY as STAIR} from '../src/data/main-stair-geometry.js';
import {migrateFloorplanPosition} from '../src/game/floorplan-position-migration.js';
import * as FP from '../src/world/floorplan.js';

FP.compile(C.levels,C);
const plan=FP.floorplan(),W=STAIR.stairwell;
const runtime=p=>FP.toRuntimePoint(p),key=p=>`${Math.floor(p.x)},${Math.floor(p.y)}`;

test('second-floor arrival renders its whole occupied hall instead of academic landing intrusions',()=>{
  const seam=FP.edgePortalState().find(p=>p.id==='upper-floor-landing-to-hall');
  const observers=[...seam.pairs.map(p=>p.to),runtime(MAIN_STAIR_LAYOUT.practiceMouth)];
  let columns=0;
  for(const observer of observers){
    const slice=FP.physicalRenderPlanFor(observer.x,observer.y);
    for(let y=140;y<158;y++)for(let x=292;x<316;x++){
      const cell=FP.cellAt(x,y);
      if(!cell||FP.isSolid(x,y)||FP.isCollisionOnly(x,y))continue;
      const p=FP.logicalToPhysical(x,y),mx=(p.x+.5)*.5,mz=(p.z+.5)*.5;
      if(mx>W.x0&&mx<W.x1&&mz>W.z0&&mz<W.z1)continue; // the hero mesh owns the well
      const i=(Math.floor(p.z)-slice.originY)*slice.w+Math.floor(p.x)-slice.originX;
      assert.equal(slice.solid[i],0,`visible rock on occupied upper hall at ${mx},${mz}`);
      assert.ok(Math.abs(slice.floor[i]-cell.floor)<.001,`foreign floor at ${mx},${mz}: ${slice.floor[i]} versus ${cell.floor}`);
      assert.ok(slice.ceil[i]-cell.floor>=1.8,'the route retains real head clearance');
      columns++;
    }
  }
  assert.ok(columns>1000,'the check covers all seam lanes and the approach beyond them');
});

test('the retired upper drawing contributes no ghost corridor air or practice-room chapel doorway',()=>{
  let orphanAir=0;
  for(let i=0;i<plan.w*plan.h;i++)if(plan.owner[i]==='upper'&&!plan.solid[i])orphanAir++;
  assert.equal(orphanAir,0);
  const side=FP.doorState().find(d=>d.id==='practice-side');
  assert.ok(side,'False Ellery retains its remembered entry identity');
  assert.equal(side.keyId,'closure-order');
  assert.equal(side.open,false);
  const behind=runtime({x:77,y:68});
  assert.equal(FP.isSolid(behind.x,behind.y),true,'even a previously open saved leaf ends in the retired masonry');
});

function upperReachable(chapelKey){
  FP.forEachDoor(d=>FP.setDoorOpen(d.id,!d.keyId||d.keyId==='master'||chapelKey&&d.keyId==='chapel'));
  const start=runtime(MAIN_STAIR_LAYOUT.practiceMouth),queue=[start],seen=new Set([key(start)]);
  for(let n=0;n<queue.length;n++)for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
    const at=queue[n],step=FP.canStep(at.x,at.y,at.x+dx,at.y+dy);
    if(!step.ok)continue;
    const to=step.redirect||{x:at.x+dx,y:at.y+dy},id=key(to);
    if(seen.has(id)||Math.abs(FP.floorAt(to.x,to.y)-4.8)>.01)continue;
    const p=FP.logicalToPhysical(to.x,to.y);
    if(p.renderGroup!=='upper')continue;
    seen.add(id);queue.push(to);
  }
  return queue;
}

test('the shared arrival hall and bridge remain the actual keyed chapel route',()=>{
  const without=upperReachable(false),withKey=upperReachable(true);
  const owners=points=>new Set(points.map(p=>plan.owner[Math.floor(p.y)*plan.w+Math.floor(p.x)]));
  assert.ok(owners(without).has('upper_atrium_bridge'),'the public approach remains usable without entering a classroom');
  assert.equal(owners(without).has('chapel_nave'),false,'a practice room cannot bypass the chapel key');
  assert.ok(owners(withKey).has('chapel_nave'),'the genuine chapel route is retained');
  for(const p of withKey)assert.notEqual(plan.owner[Math.floor(p.y)*plan.w+Math.floor(p.x)],'upper','the route never borrows the retired plan');
});

test('revision-five saves on retired corridor strips move to the existing practice arrival',()=>{
  for(const point of [{x:77,y:51.5},{x:80,y:64},{x:78.5,y:75}]){
    const old=runtime(point),got=migrateFloorplanPosition(FP,C,{px:old.x,py:old.y,layoutRevision:5,facing:0});
    assert.ok(got?.migrated);
    assert.match(got.migration,/^retired-upper-/);
    assert.deepEqual({x:got.x,y:got.y},runtime(MAIN_STAIR_LAYOUT.practiceMouth));
    assert.ok(Math.abs(FP.floorAt(got.x,got.y)-4.8)<.001);
  }
  for(const point of [{x:70,y:66},{x:90,y:65},{x:90,y:55}]){
    const at=runtime(point),got=migrateFloorplanPosition(FP,C,{px:at.x,py:at.y,layoutRevision:5,facing:0});
    assert.equal(got.migrated,false,'valid current rooms and bridge retain their exact saved position');
    assert.deepEqual({x:got.x,y:got.y},at);
  }
});
