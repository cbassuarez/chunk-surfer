import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import { BUILDING_MAP, REQUIRED_MAP_TARGETS } from '../src/data/building-map.js';
import { captureFloorplanMapSource } from '../src/game/map-model.js';
import { validateBuildingMap, validateMapSource } from '../src/game/map-schema.js';
import { roomLabel } from '../src/audio/manifest-map.js';

const authored = validateBuildingMap(BUILDING_MAP, { requiredRooms: REQUIRED_MAP_TARGETS });
assert.equal(authored.ok, true, authored.errors.join('\n'));
FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
});
const projectLogical = (point) => {
  const q = FP.toRuntimePoint(point);
  const p = FP.logicalToPhysical(q.x, q.y);
  return { x: p.x, z: p.z, height: p.y };
};
const source = captureFloorplanMapSource({
  definition: BUILDING_MAP,
  physical: FP.physicalSpanData(),
  stairPortals: FP.floorplan().stairPortals,
  projectLogical,
  labelForRoom: roomLabel,
});
const runtime = validateMapSource(source);
assert.equal(runtime.ok, true, runtime.errors.join('\n'));
assert.equal(source.targets.length, REQUIRED_MAP_TARGETS.length);
for (const target of source.targets) {
  assert.ok(target.floorId, `${target.roomId} has no floor`);
  assert.ok(Number.isFinite(target.position.x) && Number.isFinite(target.position.y));
}
console.log('map data ok');
console.log(`${source.targets.length} target rooms`);
console.log(`${source.floors.length} floors`);
console.log(`${source.connectors.length} vertical connectors`);
console.log(`${source.floors.reduce((sum, floor) => sum + floor.open.size, 0)} topology cells`);
