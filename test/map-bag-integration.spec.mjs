import assert from 'node:assert/strict';
import { buildBagModel, bagEntry, bagSection, normalizeBagSectionId } from '../src/game/bag-model.js';
import { initialBagState, reduceBagNav, repairBagSelection } from '../src/game/bag-navigation.js';
import { resolveMapAction, mapActionRail } from '../src/game/map-actions.js';
import { MAP_LAB_CASES, mapLabJob, mapLabModel } from '../src/game/map-fixtures.js';

const testCase = MAP_LAB_CASES[1];
const job = mapLabJob(testCase);
const map = mapLabModel(testCase);
const model = buildBagModel({ equipment: ['light'], job, map });
assert.deepEqual(model.sections.map((section) => section.id), ['kit', 'map', 'sheets', 'skills']);
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
const rail = mapActionRail(selected, { floorCount: 3 });
assert.ok(rail.some(([key, label]) => key === '[ / ]' && label === 'FLOOR'));
assert.ok(rail.some(([key, label]) => key === 'C' && label === 'CENTER'));

// THE TARGET VERB LEFT THE FOOTER, ON PURPOSE.
//
// Six entries with labels this long overran the rail and truncated it mid-word,
// and the word it cut was "[ENTER / SPACE] SET…" — the one verb a player most
// needs. It is printed on the SELECTED ROOM now (see drawDetail in
// render/map-view.js), beside the thing it acts on, which is both shorter and
// nearer the point of use. CONFIRM still performs it: activateSecondary in
// game/bag.js reads the selection directly and never consults this rail.
assert.ok(!rail.some(([, label]) => /TARGET/.test(label)),
  'the target verb is advertised on the room, not repeated in the footer');
assert.ok(!rail.some(([key, label]) => label === 'OPEN FILE' && /ENTER/.test(key)),
  'a pinned file never occupies the map confirm key');
assert.ok(rail.every(([key, label]) => `${key} ${label}`.length <= 24),
  'every rail entry is short enough that the footer cannot truncate');

console.log('map bag integration tests ok');
