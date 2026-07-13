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

const model = buildBagModel({ equipment, job });
assert.deepEqual(model.sections.map((section) => section.id), ['kit', 'manifest', 'files']);
assert.equal(model.progress.done, 1);
assert.equal(model.sections[0].entries[1].sourceId, 'recorder');
assert.equal(bagEntry(model, 'manifest', 'room:main_b3').state, 'recorded');
assert.equal(bagEntry(model, 'files', 'file:work-order').roomId, 'main_b3');
assert.equal(bagEntry(model, 'files', 'file:work-order').actions.secondary.id, 'unmark-room');

let nav = initialBagState(model, { sectionId: 'manifest', entryId: 'room:main_b3' });
assert.equal(nav.sectionId, 'manifest');
assert.equal(nav.selected.manifest, 'room:main_b3');

nav = reduceBagNav(nav, { type: 'MOVE_SELECTION', delta: 1 }, model);
assert.equal(nav.selected.manifest, 'room:natatorium');
nav = ensureBagSelectionVisible(nav, model, 1);
assert.equal(nav.scroll.manifest, 1);

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
