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
import { conservatory } from '../../../public/labs/chunk-surfer/src/data/floorplan/conservatory.js';
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

// ── THE REAL BUILDING ───────────────────────────────────────────────────────
// The conservatory is content, and content rots. Every room the player is paid
// to record must be walkable, from the loading dock, carrying only the keyring
// the client actually gave them. Both of the doors we deliberately shut — the
// bricked one onto the concert hall, the locked one onto the chapel — must have
// another way round, or the game is unfinishable and nothing else here will say so.
console.log('\n── the conservatory ──');
const cp = FP.compile(conservatory.levels, { width: conservatory.width, height: conservatory.height });
for (const d of conservatory.doors || []) FP.setDoorKey(d.x, d.y, d.key);
FP.setSpawn(conservatory.spawn.x, conservatory.spawn.y);

const KEYRING = new Set(['master']);      // what the client gave you. Note what is absent.
const PROBES = {
  studio:     [15, 12], plant:  [35, 10], lift:  [42, 9],
  dock:       [65, 9],  foyer:  [83, 10], hall:  [102, 15],
  natatorium: [85, 30], pool:   [85, 38],
  practice:   [65, 65], chapel: [90, 66],
};

const walked = new Set([`${conservatory.spawn.x},${conservatory.spawn.y}`]);
{
  const q = [conservatory.spawn];
  while (q.length) {
    const cur = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy, k = `${nx},${ny}`;
      if (walked.has(k) || !FP.canStep(cur.x, cur.y, nx, ny, { keys: KEYRING }).ok) continue;
      walked.add(k); q.push({ x: nx, y: ny });
    }
  }
}

ck('the spawn is not inside rock', !!FP.cellAt(conservatory.spawn.x, conservatory.spawn.y));
const stranded = Object.entries(PROBES).filter(([, [x, y]]) => !walked.has(`${x},${y}`)).map(([n]) => n);
ck('every room is reachable from the dock, on the standard keyring',
   stranded.length === 0, stranded.length ? `stranded: ${stranded.join(', ')}` : `${walked.size} cells`);

// The two deliberate refusals. Each must still refuse, and the room behind it
// must still be reachable another way — proved by the walk above.
const brickedHall = FP.canStep(92, 10, 92, 11, { keys: KEYRING });
ck('the concert hall door is still bricked up', !brickedHall.ok && brickedHall.why === 'bricked', JSON.stringify(brickedHall));
const lockedChapel = FP.canStep(87, 54, 87, 55, { keys: KEYRING });
ck('the chapel is still locked against your keyring', !lockedChapel.ok && lockedChapel.why === 'locked', JSON.stringify(lockedChapel));

// The levels are really at their heights, not flattened onto base 0.
const lv = (n, [x, y], want) => {
  const c = FP.cellAt(x, y);
  ck(`${n} floor is ${want}m`, c && Math.abs(c.floor - want) < 0.01, `floor=${c ? c.floor.toFixed(2) : 'SOLID'}`);
};
lv('the sub-basement', PROBES.studio, -4.0);
lv('the ground', PROBES.foyer, 0);
lv('the upper', PROBES.chapel, 4.0);
lv('the drained pool', PROBES.pool, -1.6);

// Every step a body may actually take is one a body takes without thinking. A
// stair with too few cells is a ladder, and only a number ever says so.
let worstRiser = 0, worstPair = '';
for (const k of walked) {
  const [x, y] = k.split(',').map(Number);
  const here = FP.cellAt(x, y); if (!here) continue;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = FP.cellAt(x + dx, y + dy);
    if (!n || !FP.canStep(x, y, x + dx, y + dy, { keys: KEYRING }).ok) continue;
    const d = Math.abs(n.floor - here.floor);
    if (d > worstRiser) { worstRiser = d; worstPair = `${x},${y} → ${x + dx},${y + dy}`; }
  }
}
ck('no riser anywhere in the building is a ladder', worstRiser <= FP.STEP_UP + 1e-6,
   `worst = ${worstRiser.toFixed(3)}m (max ${FP.STEP_UP})  at ${worstPair}`);

// The recordist cannot jump and cannot fall. A 1.6m coping is therefore not an
// edge you stumble over — it is a thing you climb down, deliberately, by the
// steps. Which gives the drained pool exactly one way in and one way out.
const overTheEdge = FP.canStep(83, 31, 83, 32, { keys: KEYRING });
ck('you cannot walk off the edge of the drained pool', !overTheEdge.ok && overTheEdge.why === 'too high', JSON.stringify(overTheEdge));
ck('the pool steps are the way down', FP.canStep(84, 31, 84, 32, { keys: KEYRING }).ok);
ck('...and the only way down', [80, 81, 82, 83, 87, 88, 89, 90]
  .every((x) => !FP.canStep(x, 31, x, 32, { keys: KEYRING }).ok));

let lowRoom = 0;
for (const k of walked) {
  const [x, y] = k.split(',').map(Number);
  const c = FP.cellAt(x, y);
  if (c && c.ceil - c.floor < FP.HEADROOM - 1e-6) lowRoom++;
}
ck('you can stand up everywhere you can walk', lowRoom === 0, `${lowRoom} cells below ${FP.HEADROOM}m`);

let croomMutable = 0;
for (let i = 0; i < cp.w * cp.h; i++) {
  if (cp.solid[i]) continue;
  const z = cp.zone[i];
  if (z !== ZONE.none && z !== ZONE.stair && (cp.flags[i] & F.MUTABLE)) croomMutable++;
}
ck('no room in the conservatory is mutable', croomMutable === 0, `${croomMutable} violations`);

// `--map` prints what is reachable from the spawn. This is the single most
// useful thing in the file: an authored building goes quietly impassable the
// moment two level rectangles overlap badly, and no assertion tells you WHERE.
//   node tools/chunk_surfer/tests/floorplan.mjs --map [--plan=testbed]
if (process.argv.includes('--map')) {
  const which = process.argv.includes('--plan=testbed') ? testbed : conservatory;
  const pp = FP.compile(which.levels, { width: which.width, height: which.height });
  for (const d of which.doors || []) FP.setDoorKey(d.x, d.y, d.key);
  const seen = new Set([`${which.spawn.x},${which.spawn.y}`]);
  const q = [which.spawn];
  while (q.length) {
    const cur = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !FP.canStep(cur.x, cur.y, nx, ny, { keys: KEYRING }).ok) continue;
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  console.log(`\nreachable: ${seen.size} cells   (o = reachable, . = open but stranded, # = rock)\n`);
  for (let y = 0; y < pp.h; y++) {
    let row = '';
    for (let x = 0; x < pp.w; x++) row += seen.has(`${x},${y}`) ? 'o' : (FP.isSolid(x, y) ? '#' : '.');
    if (row.replace(/#/g, '').length) console.log(row);
  }
}

console.log(pass ? '\n✅ FLOORPLAN PASSED' : '\n❌ FAILURES');
process.exit(pass ? 0 : 1);
