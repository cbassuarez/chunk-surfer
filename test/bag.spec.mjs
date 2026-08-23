//
//  bag.spec.mjs
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

import assert from 'node:assert/strict';

import { buildBagModel, bagEntry } from '../src/game/bag-model.js';
import {
  ensureBagSelectionVisible,
  initialBagState,
  reduceBagNav,
  repairBagSelection,
} from '../src/game/bag-navigation.js';
import { bagLayout } from '../src/render/bag-layout.js';

const equipment = [
  'light',
  'recorder + headphones',
  { id: 'radio', label: 'radio', value: 'LIVE', action() {} },
];

const job = {
  done: 1,
  total: 5,
  rooms: [
    {
      roomId: 'main_b3',
      label: 'Studio B3',
      marked: true,
      recorded: true,
      stamp: '22:14',
      notes: [{
        id: 'work-order',
        title: 'Work Order 4417-C',
        preview: 'Five room tones. Sixty seconds each. Unbroken.',
        body: [],
      }],
    },
    {
      roomId: 'natatorium',
      label: 'The Natatorium',
      marked: false,
      recorded: false,
      stamp: '',
      notes: [],
    },
  ],
  unfiled: [],
};

const model = buildBagModel({ equipment, job, loadout: { top: ['recorder', 'light'] } });
// SKILLS joins INVENTORY/MAP/SHEETS as a real fourth section (see bag-skills.spec).
assert.deepEqual(model.sections.map((section) => section.id), ['kit', 'map', 'sheets', 'skills']);
assert.equal(model.progress.done, 1);
assert.equal(model.sections[0].entries[0].sourceId, 'light');
assert.deepEqual(model.sections[0].entries.slice(0, 2).map((entry) => entry.sourceId), ['light', 'recorder']);
assert.equal(model.sections[0].entries[0].compartment, 'top');
assert.equal(model.sections[0].entries[2].compartment, 'storage');
assert.equal(model.sections[0].entries[2].actions.secondary.id, 'move-top');
// Tray reorder: the first top item has nowhere up (no tertiary); the second does.
assert.equal(model.sections[0].entries[0].actions.tertiary.id, 'reorder-up');
assert.equal(model.sections[0].entries[1].actions.tertiary, null);
assert.equal(model.sections[0].entries[2].actions.tertiary, null);
assert.equal(bagEntry(model, 'map', 'room:main_b3').state, 'recorded');
assert.equal(bagEntry(model, 'files', 'file:work-order').roomId, 'main_b3');
assert.equal(bagEntry(model, 'files', 'file:work-order').actions.secondary.id, 'unmark-room');

let nav = initialBagState(model, { sectionId: 'manifest', entryId: 'room:main_b3' });
assert.equal(nav.sectionId, 'map');
assert.equal(nav.selected.map, 'room:main_b3');

nav = reduceBagNav(nav, { type: 'MOVE_SELECTION', delta: 1 }, model);
assert.equal(nav.selected.map, 'room:natatorium');
nav = ensureBagSelectionVisible(nav, model, 1);
assert.equal(nav.scroll.map, 1);

const withoutRadio = buildBagModel({ equipment: equipment.slice(0, 2), job });
nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId: 'kit' }, model);
nav = reduceBagNav(nav, { type: 'SELECT_ENTRY', sectionId: 'kit', entryId: 'gear:radio' }, model);
nav = repairBagSelection(nav, withoutRadio);
assert.notEqual(nav.selected.kit, 'gear:radio');

const wide = bagLayout({ body: { x: 0, y: 0, w: 90, h: 28 } });
const compact = bagLayout({ body: { x: 0, y: 0, w: 60, h: 18 } });
assert.equal(wide.mode, 'wide');
assert.equal(compact.mode, 'compact');
assert.ok(wide.detail.w > wide.list.w);

console.log('bag tests ok');
