import assert from 'node:assert/strict';
import { conservatory, MAIN_STAIR_LAYOUT } from '../src/data/floorplan/conservatory.js';
import { migrateFloorplanPosition } from '../src/game/floorplan-position-migration.js';
import { ACADEMIC_ROOF } from '../src/data/academic-roof.js';
import * as FP from '../src/world/floorplan.js';

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[],
});

const runtime=(point)=>FP.toRuntimePoint(point);
const migrate=(point,extra={})=>{
  const p=runtime(point);
  return migrateFloorplanPosition(FP,conservatory,{
    px:p.x,py:p.y,layoutRevision:0,facing:1,...extra,
  });
};

for(const [oldPoint,anchor,id] of [
  [{x:61,y:42},MAIN_STAIR_LAYOUT.groundLanding,'old-lower-coil'],
  [{x:63,y:42},MAIN_STAIR_LAYOUT.upperLanding,'old-upper-coil'],
  [{x:62,y:49},MAIN_STAIR_LAYOUT.upperLanding,'old-practice-gallery'],
  [{x:13,y:278},MAIN_STAIR_LAYOUT.academicLanding,'old-academic-seam'],
]){
  const got=migrate(oldPoint),want=runtime(anchor);
  assert.ok(got?.migrated,`${id} migrates`);
  assert.equal(got.migration,id);
  assert.deepEqual({x:got.x,y:got.y},want,`${id} reaches its safe open-hall anchor`);
  assert.equal(FP.isSolid(got.x,got.y),false,`${id} never restores inside masonry`);
}

const unchanged=runtime(MAIN_STAIR_LAYOUT.groundLanding);
const current=migrateFloorplanPosition(FP,conservatory,{
  px:unchanged.x,py:unchanged.y,layoutRevision:conservatory.layoutRevision,facing:3,
});
assert.deepEqual({x:current.x,y:current.y},unchanged,'current-revision positions are not moved');
assert.equal(current.migrated,false);

const priorWalk=runtime({x:59.5,y:51.5});
assert.equal(FP.isSolid(priorWalk.x,priorWalk.y),false);
const retained=migrateFloorplanPosition(FP,conservatory,{
  px:priorWalk.x,py:priorWalk.y,layoutRevision:3,facing:0,
});
assert.deepEqual({x:retained.x,y:retained.y},priorWalk,
  'the roof revision does not replay an older stair migration on a valid revision-3 save');
assert.equal(retained.migrated,false);

const retiredRoof=runtime({x:161,y:288});
const roofRestore=migrateFloorplanPosition(FP,conservatory,{
  px:retiredRoof.x,py:retiredRoof.y,layoutRevision:3,facing:0,
});
assert.equal(roofRestore.migration,'old-roof-east-escape');
assert.deepEqual({x:roofRestore.x,y:roofRestore.y},runtime(ACADEMIC_ROOF.entry));
assert.equal(FP.floorAt(roofRestore.x,roofRestore.y),17,
  'an old escape save retains rooftop progress instead of returning to the front door');

const retired=runtime({x:58,y:30});
const nearest=migrateFloorplanPosition(FP,conservatory,{
  px:retired.x,py:retired.y,layoutRevision:2,facing:0,
});
assert.ok(nearest&&!FP.isSolid(nearest.x,nearest.y),'a retired cell falls back to walkable same-floor space');
assert.ok(Math.abs(FP.floorAt(nearest.x,nearest.y))<.001,'nearest fallback stays on Ground/1F');

const migrateB3=(point)=>{
  const p=FP.toRuntimePoint(point,{center:false});
  return migrateFloorplanPosition(FP,conservatory,{px:p.x,py:p.y,layoutRevision:4,facing:1});
};
for(const [point,id] of [
  [{x:18,y:10},'b3-control-west-partition'], // rendered window, collision-only
  [{x:18.5,y:16},'b3-control-west-partition'],
  [{x:22,y:18.5},'b3-control-south-partition'],
]){
  const got=migrateB3(point);
  assert.equal(got.migration,id);
  assert.ok(got.migrated&&!FP.isSolid(got.x,got.y));
  assert.ok(Math.abs(FP.floorAt(got.x,got.y)+4)<.001,'recovery stays in B3 on basement level');
}
for(const point of [{x:17.5,y:10},{x:19,y:10},{x:22,y:17.5},{x:22,y:19}]){
  const p=FP.toRuntimePoint(point,{center:false}),got=migrateB3(point);
  if(!FP.isSolid(p.x,p.y)){
    assert.equal(got.migrated,false,'adjacent open old positions are not moved');
    assert.deepEqual({x:got.x,y:got.y},p);
  }
}

console.log('floorplan position migration tests passed');
