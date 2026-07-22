import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import { BUILDING_MAP } from '../src/data/building-map.js';
import { captureFloorplanMapSource, buildMapModel, mapCurrentAreaLabel } from '../src/game/map-model.js';
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
  return { x: physical.x, z: physical.z, height: physical.y, renderGroup: physical.renderGroup };
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
assert.ok(source.connectors.some((connector) => [connector.a.floorId, connector.b.floorId].includes('academic')));

const start = project(ROOM_CELLS.main_b3);
const job = { done:0, total:5, rooms:TARGETS.map((roomId) => ({ roomId, label:roomId, notes:[], recorded:false })) };
const model = buildMapModel({
  source, job, objectiveState:{target:'lux_nova'}, doors:[], contacts:[], navigation:{id:'directional',showMapTopology:true,showWaypoint:true,showCrossFloorConnector:true,minimapMode:'topology'},
  player:{x:start.x,y:start.z,height:start.height,roomId:'main_b3',heading:0},
});
assert.equal(model.route.status, 'ok');
assert.ok(model.route.nextConnectorId);
assert.equal(model.route.floorDelta, 2);
assert.equal(model.floors.some((floor)=>floor.id==='academic'),false);

const academicPoint=project({x:8,y:275});
const academicModel=buildMapModel({
  source,job,objectiveState:{target:'lux_nova'},doors:[],contacts:[],navigation:{id:'directional'},
  discoveredFloorIds:new Set(['academic']),
  player:{x:academicPoint.x,y:academicPoint.z,height:academicPoint.height,renderGroup:academicPoint.renderGroup,roomId:null,areaLabel:'academic gallery',heading:0},
});
assert.equal(academicModel.player.floorId,'academic');
assert.equal(academicModel.floors.find((floor)=>floor.id==='academic')?.label,'THIRD FLOOR');
assert.equal(academicModel.spaces.some((space)=>space.floorId==='academic'),false);

const towerPlayer = buildMapModel({
  source, job, objectiveState:{target:'lux_nova'}, doors:[], contacts:[], navigation:{id:'directional'},
  player:{x:start.x,y:start.z,height:8.6,roomId:null,areaLabel:'stair turret',heading:0},
});
assert.equal(towerPlayer.player.areaLabel, 'stair turret');
assert.equal(mapCurrentAreaLabel(towerPlayer), 'STAIR TURRET');
assert.equal(towerPlayer.progress.total, 5);

console.log('live map data tests ok');
