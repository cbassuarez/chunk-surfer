import assert from 'node:assert/strict';
import { conservatory, MAIN_STAIR_LAYOUT } from '../src/data/floorplan/conservatory.js';
import { migrateFloorplanPosition } from '../src/game/floorplan-position-migration.js';
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

const retired=runtime({x:58,y:30});
const nearest=migrateFloorplanPosition(FP,conservatory,{
  px:retired.x,py:retired.y,layoutRevision:2,facing:0,
});
assert.ok(nearest&&!FP.isSolid(nearest.x,nearest.y),'a retired cell falls back to walkable same-floor space');
assert.ok(Math.abs(FP.floorAt(nearest.x,nearest.y))<.001,'nearest fallback stays on Ground/1F');

console.log('floorplan position migration tests passed');
