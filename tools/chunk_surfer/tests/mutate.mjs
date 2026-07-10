// The building that changes. Pure Node, no browser.
//
//   node tools/chunk_surfer/tests/mutate.mjs
//
// Three disciplines, hammered. If any of these ever fails, the game has become
// the Backrooms and the player has stopped trusting the space — which is the
// exact trust the horror spends.
//
//   1. rooms never move
//   2. connectivity is guaranteed, always
//   3. it is never observed: not in the light, not in the frustum, not in a
//      cell whose noise has not decayed

import { testbed } from '../../../public/labs/chunk-surfer/src/data/floorplan/testbed.js';
import * as FP from '../../../public/labs/chunk-surfer/src/world/floorplan.js';
import * as MUT from '../../../public/labs/chunk-surfer/src/world/mutate.js';
import { F, ZONE } from '../../../public/labs/chunk-surfer/src/data/floorplan/legend.js';

let pass = true;
const ck = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const rc = (x, y, opts) => FP.toRuntimePoint({ x, y }, opts);

FP.compile(testbed.levels, { width: testbed.width, height: testbed.height });
for (const d of testbed.doors || []) FP.setDoorKey(d.x, d.y, d.key);
FP.setSpawn(testbed.spawn.x, testbed.spawn.y);
MUT.mutateInit();
MUT.MUTATE.cooldownSec = 0;       // hammer it

const KEYS = new Set(['master']);
const CHAPEL = rc(48, 5);
const spawn = FP.spawn();

function walkReachable(from, to) {
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    if (c.x === to.x && c.y === to.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !FP.canStep(c.x, c.y, nx, ny, { keys: KEYS }).ok) continue;
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  return false;
}

// Snapshot every ROOM cell, every STAIR cell, and every wall that touches a
// room. None of them may change: the building rearranges its veins, never its
// organs, and it may not knock a new hole into a room.
const isRoomZone = (z) => z !== ZONE.none && z !== ZONE.stair;
const p = FP.floorplan();
const touchesRoom = (x, y) => [[1,0],[-1,0],[0,1],[0,-1],[0,0]]
  .some(([dx, dy]) => { const c = FP.cellAt(x + dx, y + dy); return c && isRoomZone(c.zone); });
const roomsBefore = [];
for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
  const c = FP.cellAt(x, y);
  if ((c && (isRoomZone(c.zone) || (c.flags & F.STAIR))) || touchesRoom(x, y)) {
    roomsBefore.push([x, y, FP.isSolid(x, y)]);
  }
}

// ── 500 forced mutations, player standing in the dark, far away ─────────────
const view = { px: spawn.x, py: spawn.y, facing: [0, -1], light: false };
const anchors = [CHAPEL, spawn];
let applied = 0, brokeConnectivity = 0;

for (let i = 0; i < 500; i++) {
  const change = MUT.tryMutate(1e9 + i * 10000, view, anchors);
  if (!change) continue;
  applied++;
  if (!walkReachable(spawn, CHAPEL)) { brokeConnectivity++; break; }
  if (!walkReachable(CHAPEL, spawn)) { brokeConnectivity++; break; }
}
ck('the building actually changed', applied > 10, `${applied} mutations applied`);
ck('CONNECTIVITY: spawn ↔ chapel survives every change', brokeConnectivity === 0,
   `${brokeConnectivity} breaks in ${applied} mutations`);

// ── rooms never move ────────────────────────────────────────────────────────
let roomChanged = 0;
for (const [x, y, wasSolid] of roomsBefore) if (FP.isSolid(x, y) !== wasSolid) roomChanged++;
ck('ROOMS NEVER MOVE: no room, stair, or room-wall cell changed', roomChanged === 0, `${roomChanged} changed`);

// ── never mutate what has been heard ────────────────────────────────────────
MUT.mutateInit();
FP.compile(testbed.levels, { width: testbed.width, height: testbed.height });
MUT.mutateInit();
MUT.MUTATE.cooldownSec = 0;

// Be loud along a corridor, then hammer mutations from far away in the dark.
const noisy = [];
const noiseA = rc(14, 7, { center: false });
const noiseB = rc(22, 7, { center: false });
for (let x = noiseA.x; x <= noiseB.x; x++) { MUT.markHeard(x, noiseA.y, 1); noisy.push([x, noiseA.y]); }
const before = new Map(noisy.map(([x, y]) => [`${x},${y}`, FP.isSolid(x, y)]));

const farView = { px: CHAPEL.x, py: CHAPEL.y, facing: [1, 0], light: false };
for (let i = 0; i < 400; i++) MUT.tryMutate(1e9 + i * 10000, farView, anchors);

let heardChanged = 0;
for (const [x, y] of noisy) if (FP.isSolid(x, y) !== before.get(`${x},${y}`)) heardChanged++;
ck('NEVER MUTATE WHAT WAS HEARD: noisy cells are pinned', heardChanged === 0, `${heardChanged} changed`);
const heardProbe = rc(18, 7);
ck('...and the noise really was recorded', MUT.heardAt(heardProbe.x, heardProbe.y) > 0.5,
   `heard=${MUT.heardAt(heardProbe.x, heardProbe.y).toFixed(2)}`);

// ── never mutate what is observed ───────────────────────────────────────────
FP.compile(testbed.levels, { width: testbed.width, height: testbed.height });
MUT.mutateInit();
MUT.MUTATE.cooldownSec = 0;

// Stand in the corridor, light ON, staring east. Nothing ahead of you may move.
const watcherPoint = rc(16, 7);
const watcher = { px: watcherPoint.x, py: watcherPoint.y, facing: [1, 0], light: true };
const ahead = [];
const aheadA = rc(18, 6, { center: false });
const aheadB = rc(34, 8, { center: false });
for (let x = aheadA.x; x <= aheadB.x; x++) for (let y = aheadA.y; y <= aheadB.y; y++) ahead.push([x, y, FP.isSolid(x, y)]);
for (let i = 0; i < 400; i++) MUT.tryMutate(1e9 + i * 10000, watcher, anchors);

let watchedChanged = 0;
for (const [x, y, was] of ahead) if (FP.isSolid(x, y) !== was) watchedChanged++;
ck('NEVER OBSERVED: nothing changes in your lit view cone', watchedChanged === 0, `${watchedChanged} changed`);

// but behind you, in the dark, it does
const st = MUT.mutateStats();
ck('...while behind you, it does', st.applied > 0, `${st.applied} applied out of view`);

// ── in the dark, only the near field is safe ────────────────────────────────
FP.compile(testbed.levels, { width: testbed.width, height: testbed.height });
MUT.mutateInit();
MUT.MUTATE.cooldownSec = 0;
const blind = { px: watcherPoint.x, py: watcherPoint.y, facing: [1, 0], light: false };
const near = [];
const nearA = rc(14, 6, { center: false });
const nearB = rc(18, 8, { center: false });
for (let x = nearA.x; x <= nearB.x; x++) for (let y = nearA.y; y <= nearB.y; y++) near.push([x, y, FP.isSolid(x, y)]);
for (let i = 0; i < 400; i++) MUT.tryMutate(1e9 + i * 10000, blind, anchors);
let nearChanged = 0;
for (const [x, y, was] of near) if (FP.isSolid(x, y) !== was) nearChanged++;
ck('with the light off, arm\'s reach is still safe', nearChanged === 0, `${nearChanged} changed`);

console.log(pass ? '\n✅ MUTATION PASSED' : '\n❌ FAILURES');
process.exit(pass ? 0 : 1);
