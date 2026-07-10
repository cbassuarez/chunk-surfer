// Floorplan compiler + collision. Pure Node, no browser, no dev server.
//
//   node tools/chunk_surfer/tests/floorplan.mjs
//
// This asserts the things that are expensive to get wrong:
//   · heights survive the round trip into the texture the shader samples
//   · rooms are never mutable (the building's organs do not move)
//   · a stair's risers are climbable by a body, not just by a camera
//   · a bricked door refuses you, and a locked one refuses you differently
//   · the building is actually connected, walking, from spawn to the chapel

import { testbed } from '../../../public/labs/chunk-surfer/src/data/floorplan/testbed.js';
import * as FP from '../../../public/labs/chunk-surfer/src/world/floorplan.js';
import { F, ZONE } from '../../../public/labs/chunk-surfer/src/data/floorplan/legend.js';

let pass = true;
const ck = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };

const p = FP.compile(testbed.levels, { width: testbed.width, height: testbed.height });
for (const d of testbed.doors || []) FP.setDoorKey(d.x, d.y, d.key);
ck('compiles', p.loaded && p.w === 56 && p.h === 30, `${p.w}x${p.h}`);

const b = FP.cellAt(5, 5);
ck('studio B3 is low and dead (but not a cupboard)', b && Math.abs(b.ceil - 3.2) < 0.01 && b.zone === ZONE.studio);

const c = FP.cellAt(48, 5);
ck('chapel floor is four metres up', c && Math.abs(c.floor - 4.0) < 0.01, `floor=${c && c.floor}`);
ck('chapel nave is eleven metres tall', c && Math.abs(c.ceil - 15.0) < 0.01, `ceil=${c && c.ceil}`);

// Every riser on the stair must be one a person takes without thinking.
let worst = 0, prev = null;
for (let x = 30; x <= 40; x++) {
  const s = FP.cellAt(x, 4);
  if (!s) { ck('stair is continuous', false, `gap at ${x}`); break; }
  if (prev !== null) worst = Math.max(worst, Math.abs(s.floor - prev));
  prev = s.floor;
}
ck('every riser is climbable', worst <= FP.STEP_UP + 1e-6, `worst riser = ${worst.toFixed(3)}m (max ${FP.STEP_UP})`);
ck('the stair arrives at the landing height', Math.abs(prev - 4.0) < 0.01, `top=${prev}`);

ck('wall is solid', FP.isSolid(0, 0));
ck('outside the map is solid', FP.isSolid(-1, 5) && FP.isSolid(999, 999));
ck('corridor is open', !FP.isSolid(20, 6));

const brick = FP.canStep(26, 10, 26, 11);
ck('a bricked door refuses passage', !brick.ok && brick.why === 'bricked', JSON.stringify(brick));

const locked = FP.canStep(11, 6, 12, 6, { keys: new Set() });
ck('a locked door refuses you without the key', !locked.ok && locked.why === 'locked');
const unlocked = FP.canStep(11, 6, 12, 6, { keys: new Set(['master']) });
ck('and opens with it', unlocked.ok);

let roomMutable = 0;
for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
  const cc = FP.cellAt(x, y);
  if (cc && (cc.zone === ZONE.studio || cc.zone === ZONE.chapel) && (cc.flags & F.MUTABLE)) roomMutable++;
}
ck('no room cell is mutable — rooms never move', roomMutable === 0, `${roomMutable} violations`);

let drift = 0;
for (let i = 0; i < p.w * p.h; i++) {
  if (p.solid[i]) continue;
  if (Math.abs(FP.decodeH(p.rgba[i * 4]) - p.floor[i]) > 0.07) drift++;
  if (Math.abs(FP.decodeH(p.rgba[i * 4 + 1]) - p.ceil[i]) > 0.07) drift++;
}
ck('the texture the shader samples round-trips the heights', drift === 0, `${drift} cells drifted`);

// Walk it. A body, not a camera: canStep at every move, keys in hand.
function reachable(from, to, keys = new Set(['master'])) {
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur.x === to.x && cur.y === to.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy, k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      if (!FP.canStep(cur.x, cur.y, nx, ny, { keys }).ok) continue;
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  return false;
}
ck('you can walk from the studio to the chapel', reachable(testbed.spawn, { x: 48, y: 5 }));
ck('...and back', reachable({ x: 48, y: 5 }, testbed.spawn));
ck('the bricked door seals the south branch', !reachable({ x: 26, y: 10 }, { x: 26, y: 12 }));

// `--map` prints what is reachable from the spawn. This is the single most
// useful thing in the file: an authored building goes quietly impassable the
// moment two level rectangles overlap badly, and no assertion tells you WHERE.
if (process.argv.includes('--map')) {
  const seen = new Set([`${testbed.spawn.x},${testbed.spawn.y}`]);
  const q = [testbed.spawn];
  const keys = new Set(['master']);
  while (q.length) {
    const cur = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !FP.canStep(cur.x, cur.y, nx, ny, { keys }).ok) continue;
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  console.log(`\nreachable: ${seen.size} cells   (o = reachable, . = open but stranded, # = rock)\n`);
  for (let y = 0; y < p.h; y++) {
    let row = '';
    for (let x = 0; x < p.w; x++) row += seen.has(`${x},${y}`) ? 'o' : (FP.isSolid(x, y) ? '#' : '.');
    if (row.replace(/#/g, '').length) console.log(row);
  }
}

console.log(pass ? '\n✅ FLOORPLAN PASSED' : '\n❌ FAILURES');
process.exit(pass ? 0 : 1);
