import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BUILDING_MAP, REQUIRED_MAP_TARGETS } from '../src/data/building-map.js';
import { validateBuildingMap, validateMapSource } from '../src/game/map-schema.js';
import { floorForHeight, clampMarkerToEdge, fitBounds } from '../src/game/map-projection.js';
import { resolveMapPolicy } from '../src/game/map-policy.js';
import { findGridRoute, findFloorPath, resolveMapRoute } from '../src/game/map-routing.js';
import { buildMapModel, mapSpaceByRoom } from '../src/game/map-model.js';
import { initialMapNav, reduceMapNav, selectedMapSpace } from '../src/game/map-navigation.js';
import { buildMapCommands, buildMinimapCommands } from '../src/render/map-commands.js';
import { fixtureMapSource, MAP_LAB_CASES, mapLabJob, mapLabModel } from '../src/game/map-fixtures.js';

const authored = validateBuildingMap(BUILDING_MAP, { requiredRooms: REQUIRED_MAP_TARGETS });
assert.equal(authored.ok, true, authored.errors.join('\n'));
assert.equal(new Set(BUILDING_MAP.targets.map((target) => target.roomId)).size, 5);
assert.equal(floorForHeight(BUILDING_MAP, -4)?.id, 'b1');
assert.equal(floorForHeight(BUILDING_MAP, 0)?.id, 'g');
assert.equal(floorForHeight(BUILDING_MAP, 5)?.id, 'u1');

const source = fixtureMapSource();
assert.equal(validateMapSource(source).ok, true);
const floor = source.floors[0];
const route = findGridRoute(floor, { x: 1, y: 1 }, { x: 20, y: 10 });
assert.ok(route?.length >= 2);
assert.deepEqual(findFloorPath(source.floors, source.connectors, 'b1', 'u1'), ['b1', 'g', 'u1']);

const testCase = MAP_LAB_CASES.find((entry) => entry.id === 'cross-floor-waypoint');
const model = mapLabModel(testCase, source);
assert.equal(model.progress.done, 2);
assert.equal(model.waypoint.roomId, 'lux_nova');
assert.equal(model.route.status, 'ok');
assert.ok(model.route.nextConnectorId);
assert.equal(mapSpaceByRoom(model, 'main_b3').floorId, 'b1');

const arbitraryProp=buildMapModel({
  source,job:mapLabJob(testCase),objectiveState:{target:'main_b3'},
  activeWaypoint:{id:'story:ledger',label:'READ THE REKEY LEDGER',kind:'prop',propId:'box-office-ledger',floorId:'g',position:{x:20,y:12}},
  player:{x:7,y:20,height:-4,roomId:null,heading:0},navigation:{id:'directional',showWaypoint:true,showCrossFloorConnector:true},
});
assert.equal(arbitraryProp.waypoint.id,'story:ledger');
assert.equal(arbitraryProp.waypoint.propId,'box-office-ledger');
assert.equal(arbitraryProp.waypoint.label,'READ THE REKEY LEDGER');
assert.equal(arbitraryProp.waypoint.floorId,'g');
assert.equal(arbitraryProp.route.status,'ok');
assert.equal(arbitraryProp.spaces.filter((space)=>space.roomId).length,5,'all five recording-room targets remain available');
const arbitraryDoor=buildMapModel({
  source,job:mapLabJob(testCase),
  activeWaypoint:{id:'story:chapel-c17',label:'OPEN C-17',kind:'door',doorId:'chapel-c17',floorId:'u1',position:{x:30,y:16}},
  player:{x:20,y:12,height:0,roomId:null,heading:0},navigation:{id:'directional',showWaypoint:true,showCrossFloorConnector:true},
});
assert.equal(arbitraryDoor.waypoint.doorId,'chapel-c17');
assert.equal(arbitraryDoor.waypoint.kind,'door');
assert.deepEqual(arbitraryDoor.waypoint.position,{x:30,y:16});

let nav = initialMapNav({ model, preferredRoomId: 'main_b3' });
assert.equal(selectedMapSpace(nav, model).roomId, 'main_b3');
nav = reduceMapNav(nav, { type: 'NEXT_FLOOR' }, model);
assert.equal(nav.floorId, 'g');
nav = reduceMapNav(nav, { type: 'SELECT_ROOM', roomId: 'lux_nova' }, model);
assert.equal(nav.floorId, 'u1');
assert.equal(selectedMapSpace(nav, model).roomId, 'lux_nova');

const layout = { mapViewport: { x: 0, y: 0, w: 50, h: 22 } };
const commands = buildMapCommands({ model, nav, layout, now: 1000 });
assert.ok(commands.some((command) => command.kind === 'topology'));
assert.ok(commands.some((command) => command.kind === 'objective' && command.roomId === 'lux_nova'));
assert.equal(commands.some((command) => command.kind === 'enemy'), false);

const mini = buildMinimapCommands({ model, viewport: { x: 0, y: 0, w: 18, h: 8 }, now: 1000 });
assert.ok(mini.some((command) => command.kind === 'player'));
assert.ok(mini.some((command) => command.kind === 'connector-target' || command.kind === 'connector-edge' || command.kind === 'floor-target'));
assert.equal(mini.some((command) => command.kind === 'enemy'), false);

const equipmentModel=buildMapModel({
  source,job:mapLabJob(testCase),player:{x:7,y:20,height:-4,roomId:null,heading:0},
  equipmentMarkers:[{id:'radio',kind:'radio',label:'RADIO',floorId:'b1',position:{x:9,y:10},carrierOpen:true}],
});
assert.equal(equipmentModel.equipmentMarkers.length,1);
assert.equal(equipmentModel.contacts.length,0,'equipment does not enter the HUSH contact layer');
const equipmentCommands=buildMinimapCommands({model:equipmentModel,viewport:{x:0,y:0,w:18,h:8},now:1000});
assert.ok(equipmentCommands.some((command)=>command.kind==='equipment'&&command.carrierOpen),'radio marker is exact and pulses only from carrier state');

const minimalModel = mapLabModel(MAP_LAB_CASES.find((entry) => entry.id === 'dead-air-contact'), source);
const minimalCommands = buildMinimapCommands({ minimalModel, model: minimalModel, viewport: { x: 0, y: 0, w: 18, h: 8 }, now: 1000 });
assert.equal(minimalCommands.some((command) => command.kind === 'local-topology'), false);
assert.equal(minimalCommands.some((command) => command.kind === 'anomaly-contact' || command.kind === 'anomaly-edge'),false,'unseen point telemetry never becomes an exact map coordinate');

const hushModel={
  ...minimalModel,
  hush:{active:true,floorId:minimalModel.player.floorId,position:{x:minimalModel.player.position.x+2,y:minimalModel.player.position.y+1}},
};
const hushCommands=buildMinimapCommands({model:hushModel,viewport:{x:0,y:0,w:18,h:8},now:1000});
assert.equal(hushCommands.some((command)=>String(command.kind).startsWith('hush')),false,'an unseen HUSH never becomes reciprocal radar');
const seenHushCommands=buildMinimapCommands({model:{...hushModel,hush:{...hushModel.hush,visible:true}},viewport:{x:0,y:0,w:18,h:8},now:1000});
assert.ok(seenHushCommands.some((command)=>command.kind==='hush-visible'),'a directly seen manifestation is confirmed on the minimap');
const mapIconSource=readFileSync('src/render/map-icons.js','utf8');
assert.match(mapIconSource,/export function drawHushMarker[\s\S]*uiGlyph\(x,y,'\?','ui-danger'/,'the visible manifestation is a themed red question mark');
assert.doesNotMatch(mapIconSource,/ctx\.arc\(cx, cy - unit/,'the retired humanoid marker is gone');

const edge = clampMarkerToEdge({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0, w: 20, h: 10 }, 1);
assert.equal(Math.round(edge.x), 19);
const transform = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, { x: 0, y: 0, w: 50, h: 25 });
assert.ok(transform.point({ x: 50, y: 25 }).x > 20);

const policy = resolveMapPolicy({ id: 'minimal', showMapTopology: false });
assert.equal(policy.id, 'minimal');
assert.equal(policy.showMapTopology, false);

const unresolved = resolveMapRoute({ floors: [], connectors: [], player: { resolved: false }, waypoint: null });
assert.equal(unresolved.status, 'unresolved');
assert.equal(mapLabJob(testCase).rooms.length, 5);

console.log('map core tests ok');

// ── the minimap sightline ───────────────────────────────────────────────────
// The old facing hint was a 0.75-cell tick on the player dot: it said which way
// you were pointing and nothing about whether you could SEE that way, and it
// pointed straight through corners. The cone is masked by the same open cells the
// topology layer draws, so a wall stops it.
{
  const { SIGHT, openCellLookup, sightPolygon, visibilityLookup } = await import('../src/render/minimap.js');

  // A one-cell-wide corridor running north from the player, with a room to the
  // east that is NOT connected: nothing in it may be visible.
  const open = new Set();
  for (let y = 0; y <= 10; y += 1) open.add(`5,${y}`);       // the corridor
  for (let y = 2; y <= 4; y += 1) for (let x = 8; x <= 10; x += 1) open.add(`${x},${y}`);
  const isOpen = openCellLookup({ open });
  assert.equal(isOpen(5, 5), true);
  assert.equal(isOpen(9, 3), true);
  assert.equal(isOpen(7, 3), false, 'the corridor and the room do not touch');

  const origin = { x: 5.5, y: 8.5 };
  const north = sightPolygon({ origin, heading: 0, isOpen, radius: 12 });
  assert.equal(north.length, SIGHT.rays);
  // Looking north up the corridor, the centre ray runs a long way...
  const centre = north[Math.floor(SIGHT.rays / 2)];
  assert.ok(origin.y - centre.y > 5, `the corridor is visible along its length (${(origin.y - centre.y).toFixed(2)})`);
  // ...and every point of the cone stays on open floor, so nothing is seen
  // through a wall.
  for (const point of north) {
    assert.ok(isOpen(Math.floor(point.x), Math.floor(point.y)),
      `no ray ends inside geometry (${point.x.toFixed(2)},${point.y.toFixed(2)})`);
  }
  // Nothing in the sealed room is ever inside the cone, from any heading.
  for (let i = 0; i < 16; i += 1) {
    const heading = (i / 16) * Math.PI * 2;
    for (const point of sightPolygon({ origin, heading, isOpen, radius: 14 })) {
      assert.ok(point.x < 7, `the sealed room stays unseen at heading ${heading.toFixed(2)}`);
    }
  }
  // Facing a wall collapses the cone to the player's own cell rather than
  // punching through it.
  const south = sightPolygon({ origin: { x: 5.5, y: 10.5 }, heading: Math.PI, isOpen, radius: 12 });
  for (const point of south) {
    assert.ok(point.y <= 11.5, 'a wall one cell away stops the cone dead');
  }

  // Sight retains the compiled half-metre cells even when the map topology is
  // simplified to one metre. A thin wall occupying half of one thumbnail cell
  // must still occlude, and a live closed leaf must occlude its otherwise-open
  // threshold.
  const detailed = new Set();
  for(let y=0;y<40;y++)for(let x=0;x<40;x++)detailed.add(`${x},${y}`);
  for(let x=0;x<40;x++)detailed.delete(`${x},20`);
  const detailedSight=visibilityLookup({open:new Set(['5,5']),visibilityOpen:detailed,visibilityScale:2});
  assert.equal(detailedSight(5,9.75),true);
  assert.equal(detailedSight(5,10.05),false,'the half-metre wall survives map simplification');

  const doorSight=visibilityLookup({
    open:new Set(Array.from({length:30},(_,y)=>`5,${y}`)),
    doors:[{state:'closed',position:{x:5.5,y:8},widthAxis:'x',apertureWidth:1}],
  });
  assert.equal(doorSight(5.5,8),false,'a closed live leaf blocks sight');
  assert.equal(doorSight(5.5,7.5),true);

  const longCorridor=new Set(Array.from({length:40},(_,y)=>`5,${y}`));
  const long=sightPolygon({origin:{x:5.5,y:30.5},heading:0,isOpen:openCellLookup({open:longCorridor}),radius:18});
  assert.ok(30.5-long[Math.floor(long.length/2)].y>17,'the viewshed reaches the minimap edge instead of stopping at the old 14m cap');
}
