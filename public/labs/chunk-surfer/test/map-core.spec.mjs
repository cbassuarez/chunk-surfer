import assert from 'node:assert/strict';

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

const minimalModel = mapLabModel(MAP_LAB_CASES.find((entry) => entry.id === 'dead-air-contact'), source);
const minimalCommands = buildMinimapCommands({ minimalModel, model: minimalModel, viewport: { x: 0, y: 0, w: 18, h: 8 }, now: 1000 });
assert.equal(minimalCommands.some((command) => command.kind === 'local-topology'), false);
assert.ok(minimalCommands.some((command) => command.kind === 'anomaly-contact' || command.kind === 'anomaly-edge'));

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
