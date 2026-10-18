import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ACADEMIC_ROOF } from '../src/data/academic-roof.js';
import { roofGateEligibility } from '../src/game/roof-access.js';
import { CELL, F, ZONE } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
  edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});

const runtime = (point) => FP.toRuntimePoint(point);
const physicalCell = (slice, worldX, worldZ) => {
  const x = Math.floor(worldX / CELL) - slice.originX;
  const y = Math.floor(worldZ / CELL) - slice.originY;
  assert.ok(x >= 0 && x < slice.w && y >= 0 && y < slice.h,
    `physical sample ${worldX},${worldZ} is inside the compiled slice`);
  const i = y * slice.w + x;
  return {
    floor: slice.floor[i],
    ceil: slice.ceil[i],
    zone: slice.zone[i],
    solid: slice.solid[i],
    flags: slice.flags[i],
  };
};

const galleryObserver = runtime({ x: 25, y: 254 });
assert.equal(FP.floorAt(galleryObserver.x, galleryObserver.y), 10);
assert.equal(FP.logicalToPhysical(galleryObserver.x, galleryObserver.y).renderGroup, 'academic');
const gallerySlice = FP.physicalRenderPlanFor(galleryObserver.x, galleryObserver.y);

// A render-slice repair must not fill the actual ten-metre navigation opening
// or lower the occupied ring to the garden's ground floor.
const ring = runtime({ x: 27, y: 254 });
const voidPoint = runtime({ x: 33, y: 254 });
assert.equal(FP.isSolid(ring.x, ring.y), false);
assert.equal(FP.floorAt(ring.x, ring.y), 10);
assert.equal(FP.isSolid(voidPoint.x, voidPoint.y), true,
  'the centre remains a non-walkable gap in the academic floor');
const westLip = FP.toRuntimePoint({ x: 28.5, y: 254 }, { center: false });
const overLip = FP.toRuntimePoint({ x: 29, y: 254 }, { center: false });
assert.equal(FP.isSolid(westLip.x, westLip.y), false);
assert.equal(FP.canStep(westLip.x, westLip.y, overLip.x, overLip.y, {
  keys: new Set(['master']),
}).ok, false, 'ordinary navigation still rejects a step into the atrium void');
const adjacent = physicalCell(gallerySlice, 77, 14);
assert.equal(adjacent.floor, 10, 'the occupied gallery ring remains at ten metres');
assert.equal(adjacent.ceil, 17, 'the gallery still meets the roof soffit at seventeen metres');
assert.equal(adjacent.zone, ZONE.academic);

// The same physical column has a supported occupied roof. It must remain
// seventeen metres high when observed from that roof, including the glass bay.
const roofObserver = runtime(ACADEMIC_ROOF.entry);
const roofSlice = FP.physicalRenderPlanFor(roofObserver.x, roofObserver.y);
const roofAtVoid = physicalCell(roofSlice, 83, 14);
assert.equal(roofAtVoid.floor, 17, 'the roof observer retains the supported roof over the atrium');
assert.equal(roofAtVoid.solid, 0);
assert.equal(roofAtVoid.zone, ZONE.academicRoof);
assert.ok(roofAtVoid.flags & F.SKY, 'the roof observer remains outdoors');
const roofOverGarden = runtime({ x: 200, y: 282 });
assert.equal(FP.isSolid(roofOverGarden.x, roofOverGarden.y), false);
assert.equal(FP.floorAt(roofOverGarden.x, roofOverGarden.y), 17,
  'roof glass collision support remains independent of the gallery render choice');

// Architecture does not award or waive school/recording access. Ren's later
// shortcut key must not silently become the first-ascent permission.
assert.equal(roofGateEligibility(new Set(['master']), 0).canOpen, false);
assert.equal(roofGateEligibility(new Set(['ren-service']), 1).canOpen, false);
assert.equal(roofGateEligibility(new Set(['master']), 1).canOpen, true);

// Regression: the old academicAtriumVoid exception admitted ALL stacked
// spans. At gallery height10 the nearest candidate became roof17, not garden0,
// producing a seventeen-metre wall across what navigation called a void.
for (const [worldX, worldZ] of [[83, 14], [83.5, 14.5], [79.5, 8.5], [88.5, 20.5]]) {
  const below = physicalCell(gallerySlice, worldX, worldZ);
  assert.equal(below.floor, 0,
    `gallery view at ${worldX},${worldZ} must retain the garden ground, not the roof floor`);
  assert.equal(below.ceil, 17,
    `gallery view at ${worldX},${worldZ} retains the full atrium air volume`);
  assert.equal(below.zone, ZONE.foyer);
  assert.equal(below.solid, 0, 'the rendered garden is air below the guarded gallery opening');
}

console.log('academic gallery treatment: atrium render, ring/roof collision and access invariants passed');
