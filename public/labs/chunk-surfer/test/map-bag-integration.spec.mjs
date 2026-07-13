import assert from 'node:assert/strict';
import { buildBagModel, bagEntry, bagSection, normalizeBagSectionId } from '../src/game/bag-model.js';
import { initialBagState, reduceBagNav, repairBagSelection } from '../src/game/bag-navigation.js';
import { resolveMapAction, mapActionRail } from '../src/game/map-actions.js';
import { MAP_LAB_CASES, mapLabJob, mapLabModel } from '../src/game/map-fixtures.js';

const testCase = MAP_LAB_CASES[1];
const job = mapLabJob(testCase);
const map = mapLabModel(testCase);
const model = buildBagModel({ equipment: ['light'], job, map });
assert.deepEqual(model.sections.map((section) => section.id), ['kit', 'map', 'files']);
assert.equal(normalizeBagSectionId('manifest'), 'map');
assert.equal(bagSection(model, 'manifest').id, 'map');
assert.equal(bagEntry(model, 'map', 'room:main_b3').floorId, 'b1');

let nav = initialBagState(model, { sectionId: 'manifest', entryId: 'room:main_b3' });
assert.equal(nav.sectionId, 'map');
const legacy = repairBagSelection({ ...nav, sectionId: 'manifest', selected: { manifest: 'room:main_b3' }, scroll: { manifest: 0 } }, model);
assert.equal(legacy.sectionId, 'map');
assert.equal(legacy.selected.map, 'room:main_b3');
nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId: 'manifest' }, model);
assert.equal(nav.sectionId, 'map');

const calls = [];
const selected = map.spaces.find((space) => space.roomId === 'main_b3');
assert.equal(resolveMapAction(selected, 'clear-waypoint', { markRoom: (id) => { calls.push(['mark', id]); return true; } }), true);
assert.deepEqual(calls, [['mark', 'main_b3']]);
assert.ok(mapActionRail(selected, { floorCount: 3 }).some(([key, label]) => key === '[ / ]' && label === 'FLOOR'));

console.log('map bag integration tests ok');
