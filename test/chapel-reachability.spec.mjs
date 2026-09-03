import assert from 'node:assert/strict';

import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';

// THE CHAPEL AND ITS ROOMS, WALKED.
//
// The organ loft, the ringing room and the bell chamber are reached from the
// chapel by a chain of eight level seams. They were all one authored cell wide,
// opening onto landings three cells wide, so the way up was a single unmarked
// cell against a blank nave wall — reachable on paper and, in a first-person
// body, found by accident.
//
// This walks the building the way canStep does and reports a number, so a dead
// seam, a misplaced level or a door that starts shut with no key is a failing
// test rather than a playthrough.

const CHAPEL_ROOMS = [
  'chapel_nave',
  'tower_access_lower', 'tower_ringing_room', 'tower_access_upper',
  'tower_bell_chamber', 'tower_escape_upper', 'tower_organ_loft', 'tower_escape_lower',
];

function compile() {
  FP.compile(conservatory.levels, {
    width: conservatory.width, height: conservatory.height,
    widenCorridors: conservatory.widenCorridors,
    connectors: conservatory.connectors || [],
    edgePortals: conservatory.edgePortals || [],
    doors: conservatory.doors || [],
  });
  FP.setSpawn(conservatory.spawn.x, conservatory.spawn.y);
}

// Keyless doors are ones the recordist simply opens; keyed ones need the key.
function walk(keyList) {
  compile();
  FP.forEachDoor((portal) => { if (!portal.keyId) FP.setDoorOpen(portal.id, true); });
  for (const key of keyList) FP.forEachDoor((p) => { if (p.keyId === key) FP.setDoorOpen(p.id, true); });
  const keys = new Set(keyList);
  const from = FP.spawn();
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  while (queue.length && seen.size < 800000) {
    const at = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const step = FP.canStep(at.x, at.y, at.x + dx, at.y + dy, { keys });
      if (!step?.ok) continue;
      const to = step.redirect
        ? { x: Math.floor(step.redirect.x), y: Math.floor(step.redirect.y) }
        : { x: at.x + dx, y: at.y + dy };
      const id = `${to.x},${to.y}`;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(to);
    }
  }
  return seen;
}

function coverage(seen, levelId) {
  const level = conservatory.levels.find((l) => l.id === levelId);
  assert.ok(level, `${levelId} is not in the plan`);
  let open = 0, reached = 0;
  for (let ry = 0; ry < level.rows.length; ry += 1) {
    for (let rx = 0; rx < (level.rows[ry] || '').length; rx += 1) {
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const x = (level.origin.x + rx) * 2 + ox;
        const y = (level.origin.y + ry) * 2 + oy;
        if (FP.isSolid(x, y)) continue;
        open += 1;
        if (seen.has(`${x},${y}`)) reached += 1;
      }
    }
  }
  return open ? reached / open : 0;
}

// ── THE ROOMS ARE WALKABLE TO, WITH THE KEYS THE NIGHT PROVIDES ─────────────
{
  const seen = walk(['master', 'chapel', 'tower-live', 'tower-cleared', 'services-core']);
  for (const room of CHAPEL_ROOMS) {
    const pct = coverage(seen, room);
    assert.ok(pct > 0.9, `${room} is ${Math.round(pct * 100)}% reachable — the chapel has lost a room`);
  }
}

// And the chapel itself is behind its own key rather than open to anyone.
{
  const withoutChapelKey = walk(['master']);
  assert.ok(coverage(withoutChapelKey, 'tower_ringing_room') < 0.05,
    'the chapel rooms are reachable without the chapel key');
}

// ── THE SEAMS ARE WIDER THAN ONE CELL ───────────────────────────────────────
//
// The regression that would have caught the original complaint. Each seam opens
// onto a landing three cells wide; a one-cell seam is a threshold you find by
// accident.
{
  compile();
  const towerSeams = (conservatory.connectors || []).filter((c) =>
    (c.to?.y >= 150 && c.to?.y <= 165) || (c.from?.y >= 150 && c.from?.y <= 165));
  assert.equal(towerSeams.length, 8, 'the chapel stair chain is not eight seams any more');
  for (const seam of towerSeams) {
    assert.ok(seam.span, `a chapel stair seam is one cell wide again: ${JSON.stringify(seam.from)}`);
  }
}

// ── AND THE WALL BEHIND THE FIRST SEAM STAYS SOLID ──────────────────────────
//
// Found by measuring, and deeply counter-intuitive: the redirect fires as the
// player steps INTO the last open cell of the nave. Open the wall behind it so
// the stair "reads better" and the player walks past instead, registerConnector
// re-picks its candidate pair, and the chain collapses — tower_access_lower to
// 3% and every room above it to 0%. The stair is signed with props on this
// wall. It is never carved into it.
{
  compile();
  for (const y of [122, 124, 126]) {              // authored y61..63, runtime
    assert.equal(FP.isSolid(198, y), true,
      `the nave east wall is open at (198,${y}) — this collapses the whole chapel stair chain`);
  }
}

console.log('chapel-reachability.spec.mjs ok');
