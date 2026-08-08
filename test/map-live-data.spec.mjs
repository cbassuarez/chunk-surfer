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
  edgePortals: conservatory.edgePortals || [],
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

// ── the floor list is the building as a person describes it ──────────────────
// The turret used to page as U2 (ringing room / organ loft) and U3 (bell chamber),
// two nearly-empty floors either side of the third floor, so the map read as
// though the building had interstitial levels in it.
{
  const ids = source.floors.map((floor) => floor.id);
  assert.deepEqual(ids, ['b1', 'g', 'u1', 'academic', 'tower'],
    'five floors: basement, ground, upper, third, and one tower');
  assert.ok(!ids.includes('u2') && !ids.includes('u3'), 'no interstitial tower pages');
  for (const floor of source.floors) {
    assert.ok(floor.open.size > 200, `${floor.id} is a real floor, not a sliver (${floor.open.size} cells)`);
  }
  // Every tower landmark keeps its own callout on the single tower page.
  const towerLandmarks = (source.landmarks || []).filter((landmark) => landmark.floorId === 'tower');
  assert.equal(towerLandmarks.length, 3, 'ringing room, bell chamber and organ loft all live on TOWER');
  // A stair wholly inside one map floor is not a cross-floor connector.
  assert.ok(!source.connectors.some((c) => c.a.floorId === c.b.floorId));
}

// ── every objective is labelled, always ──────────────────────────────────────
// A marker whose name appears only once you have selected it cannot tell you that
// you could go there, which is the one thing this screen is for.
{
  const { buildMapCommands } = await import('../src/render/map-commands.js');
  const { initialMapNav } = await import('../src/game/map-navigation.js');
  const nav = initialMapNav({ model });
  const layout = { mapViewport: { x: 2, y: 2, w: 60, h: 20 } };
  // The basement page holds the room he is standing in: labelled and bright.
  const here = buildMapCommands({ model, nav, layout }).filter((c) => c.kind === 'objective');
  assert.equal(here.length, 1);
  assert.ok(here[0].showLabel && !here[0].dimLabel, 'the room you are in is labelled and bright');
  // The ground floor holds two takes, neither of them current nor the target.
  const ground = buildMapCommands({ model, nav: { ...nav, floorId: 'g' }, layout })
    .filter((c) => c.kind === 'objective');
  assert.equal(ground.length, 2, 'the tub and the hall');
  assert.ok(ground.every((c) => c.showLabel), 'no objective hides its name');
  assert.ok(ground.every((c) => c.dimLabel), 'and the ones you have not chosen are dimmed, not hidden');
  assert.ok(ground.every((c) => !c.selected && !c.current && !c.waypoint),
    'a dim callout is exactly one you have not selected, are not in, and have not targeted');
}
console.log('map live data extras ok');

// ── a room you have not been told about is still marked ──────────────────────
// Landmarks are revealed by the logs. Drawing nothing until then told the player
// the tower was empty, so there was no way to know anything could be unlocked.
{
  const { buildMapCommands } = await import('../src/render/map-commands.js');
  const towerNav = { floorId: 'tower', selectedByFloor: {} };
  const layout = { mapViewport: { x: 2, y: 2, w: 60, h: 20 } };
  const unknowns = buildMapCommands({ model, nav: towerNav, layout })
    .filter((command) => command.kind === 'objective' && command.unknown);
  assert.equal(unknowns.length, 3, 'all three unread tower rooms are marked ???');
  assert.ok(unknowns.every((command) => command.label === '???'), 'and unnamed');
  assert.ok(unknowns.every((command) => command.dimLabel && !command.waypoint),
    'dim, and never a target');
  // Unselectable until a log names it: knowing it is there gives nothing away.
  const towerSpaces = model.spaces.filter((space) => space.floorId === 'tower');
  assert.ok(towerSpaces.every((space) => space.unknown && space.selectable === false
    && space.waypointable === false));
  // Once a log names one, it stops being a question mark.
  const revealed = buildMapModel({
    source, job, objectiveState: { target: 'lux_nova' }, doors: [], contacts: [],
    navigation: { id: 'directional', showMapTopology: true, showWaypoint: true, showCrossFloorConnector: true, minimapMode: 'topology' },
    player: { x: start.x, y: start.z, height: start.height, roomId: 'main_b3', heading: 0 },
    landmarkState: { 'landmark:ringing-room': { visible: true, label: 'RINGING ROOM' } },
  });
  const named = revealed.spaces.filter((space) => space.floorId === 'tower' && !space.unknown);
  assert.equal(named.length, 1);
  assert.equal(named[0].label, 'RINGING ROOM');
  assert.equal(named[0].selectable, true, 'and becomes somewhere you can select');
}
console.log('unknown-room markers ok');

// ── no target means no target ────────────────────────────────────────────────
// Landmarks and unnamed rooms carry `roomId: null`, so matching the waypoint on a
// falsy objective target made the first one of them answer to "nothing is set"
// and the monitor read TARGET ??? on a fresh run.
{
  const noTarget = buildMapModel({
    source, job, objectiveState: {}, doors: [], contacts: [],
    navigation: { id: 'directional', showMapTopology: true, showWaypoint: true, showCrossFloorConnector: true, minimapMode: 'topology' },
    player: { x: start.x, y: start.z, height: start.height, roomId: 'main_b3', heading: 0 },
  });
  assert.equal(noTarget.waypoint, null, 'no objective target resolves to no waypoint');
  assert.ok(noTarget.spaces.some((space) => space.unknown), 'even with ??? rooms present');
  for (const target of [null, undefined, '']) {
    const model2 = buildMapModel({
      source, job, objectiveState: { target }, doors: [], contacts: [],
      navigation: { id: 'directional', showMapTopology: true, showWaypoint: true, showCrossFloorConnector: true, minimapMode: 'topology' },
      player: { x: start.x, y: start.z, height: start.height, roomId: 'main_b3', heading: 0 },
    });
    assert.equal(model2.waypoint, null, `target ${JSON.stringify(target)} is not a waypoint`);
  }
  // A real one still resolves.
  assert.equal(model.waypoint?.roomId, 'lux_nova');
}
console.log('waypoint resolution ok');
