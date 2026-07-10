// Save migration. Pure Node, no browser.
//
//   node tools/chunk_surfer/tests/save-migration.mjs
//
// v1 saves stored authored one-metre coordinates. v2 runs on half-metre
// runtime cells, so run-local coordinates move to the center of the expanded
// 2x2 block. Cross-run meta remains v1.

import { PLAN_SCALE } from '../../../public/labs/chunk-surfer/src/data/floorplan/legend.js';

let pass = true;
const ck = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const center = (v) => Math.round(v * PLAN_SCALE) + Math.floor(PLAN_SCALE / 2);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

store.set('chunk-surfer:save:v1', JSON.stringify({
  version: 1,
  area: 'world',
  px: 65,
  py: 10,
  obj: {
    read: ['page-1'],
    waypoint: { x: 85, y: 30, roomId: 'the_tub' },
    target: 'the_tub',
  },
}));
store.set('chunk-surfer:meta:v1', JSON.stringify({
  version: 1,
  endingsSeen: ['left'],
  hushMet: true,
  leftMidRun: true,
  runs: 7,
  lastSeenAt: 123,
}));

const SAVE = await import(`../../../public/labs/chunk-surfer/src/game/save.js?migration=${Date.now()}`);
ck('legacy save is visible before migration', SAVE.hasSave());

const { save, meta } = SAVE.saveLoad();
ck('save migrates to v2', save.version === 2, `version=${save.version}`);
ck('player x migrates to runtime center', save.px === center(65), `px=${save.px}`);
ck('player y migrates to runtime center', save.py === center(10), `py=${save.py}`);
ck('waypoint x migrates to runtime center', save.obj.waypoint.x === center(85), JSON.stringify(save.obj.waypoint));
ck('waypoint y migrates to runtime center', save.obj.waypoint.y === center(30), JSON.stringify(save.obj.waypoint));
ck('waypoint room survives', save.obj.waypoint.roomId === 'the_tub');
ck('v2 save is written after migration', !!store.get('chunk-surfer:save:v2'));

ck('meta stays on v1', meta.version === 1, `version=${meta.version}`);
ck('cross-run meta is preserved', meta.hushMet && meta.runs === 7 && meta.endingsSeen.includes('left'));

SAVE.clearSave();
ck('clearSave removes legacy and current run saves',
   !store.has('chunk-surfer:save:v1') && !store.has('chunk-surfer:save:v2'));

console.log(pass ? '\n✅ SAVE MIGRATION PASSED' : '\n❌ FAILURES');
process.exit(pass ? 0 : 1);
