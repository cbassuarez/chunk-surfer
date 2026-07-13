import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import { BUILDING_MAP } from '../src/data/building-map.js';
import { captureFloorplanMapSource, buildMapModel } from '../src/game/map-model.js';
import { ROOM_CELLS, TARGETS } from '../src/data/conservatory-script.js';

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
});
const project = (point) => {
  const runtime = FP.toRuntimePoint(point);
  const physical = FP.logicalToPhysical(runtime.x, runtime.y);
  return { x: physical.x, z: physical.z, height: physical.y };
};
const source = captureFloorplanMapSource({
  definition: BUILDING_MAP,
  physical: FP.physicalSpanData(),
  stairPortals: FP.floorplan().stairPortals,
  projectLogical: project,
  labelForRoom: (id) => id,
});
const floors = Object.fromEntries(source.targets.map((target) => [target.roomId, target.floorId]));
assert.equal(floors.main_b3, 'b1');
assert.equal(floors.the_tub, 'g');
assert.equal(floors.amplifications, 'g');
assert.equal(floors.soundnoisemusic, 'u1');
assert.equal(floors.lux_nova, 'u1');
assert.ok(source.connectors.some((connector) => [connector.a.floorId, connector.b.floorId].includes('b1')));
assert.ok(source.connectors.some((connector) => [connector.a.floorId, connector.b.floorId].includes('u1')));

const start = project(ROOM_CELLS.main_b3);
const job = { done:0, total:5, rooms:TARGETS.map((roomId) => ({ roomId, label:roomId, notes:[], recorded:false })) };
const model = buildMapModel({
  source, job, objectiveState:{target:'lux_nova'}, doors:[], contacts:[], navigation:{id:'directional',showMapTopology:true,showWaypoint:true,showCrossFloorConnector:true,minimapMode:'topology'},
  player:{x:start.x,y:start.z,height:start.height,roomId:'main_b3',heading:0},
});
assert.equal(model.route.status, 'ok');
assert.ok(model.route.nextConnectorId);
assert.equal(model.route.floorDelta, 2);

console.log('live map data tests ok');
