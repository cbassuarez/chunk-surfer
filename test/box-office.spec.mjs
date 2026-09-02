import assert from 'node:assert/strict';

import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { KEY_CABINET_RING, keyCabinetSelection, keyCabinetKeyIdentified } from '../src/game/key-cabinet.js';

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
  edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});

const prop = (id) => CONSERVATORY_PROPS.find((entry) => entry.id === id);
const cellOf = (id) => {
  const p = prop(id);
  assert.ok(p, `${id} is not placed`);
  return { x: Math.round(p.x / 0.5), y: Math.round(p.y / 0.5) };
};

// ── THE FRONTAGE IS A FACADE ────────────────────────────────────────────────
//
// The public side of the box office used to have a two-metre hole in it. The
// plan carried an open 'F' at the ticket window on the reasoning that the fitted
// counter was the barrier — but a prop is dressing and the plan is the
// collision, so runtime row 21 was a clear walk-in from the atrium, past the
// queue stanchions and through where the grille is meant to be.
{
  for (let y = 18; y <= 21; y += 1) {
    for (let x = 182; x <= 183; x += 1) {
      assert.equal(FP.isSolid(x, y), true,
        `the box office frontage is open at (${x},${y}) — the public can walk through the ticket window`);
    }
  }
  // And it is a wall rather than a doorway: a door here would be a way in that
  // the sheets do not describe and the counter's own text contradicts.
  for (let y = 18; y <= 21; y += 1) {
    assert.equal(FP.doorAt(182, y) || null, null, `a door has appeared in the frontage at (182,${y})`);
  }
}

// ── AND THE ROOM IS STILL A ROOM ────────────────────────────────────────────
//
// The other half, and the reason this is one spec rather than two: sealing a
// frontage is trivial and stranding the puzzle behind it is the obvious way to
// get it wrong. Staff come in by the master-key leaf on the south wall, which is
// exactly what bag-sheets.js tells the player.
{
  const start = { x: 170, y: 19 };            // the atrium, outside the counter
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length && seen.size < 300000) {
    const at = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = at.x + dx, ny = at.y + dy, key = `${nx},${ny}`;
      if (seen.has(key) || nx < 0 || ny < 0 || nx > 2000 || ny > 2000) continue;
      // Doors are passable for reachability: whether one is locked is run state,
      // not geometry, and this asks whether the room can be got to at all.
      if (FP.isSolid(nx, ny) && !FP.doorAt(nx, ny)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  const reachable = ({ x, y }) => seen.has(`${x},${y}`);

  for (const id of ['box-office-key-cabinet', 'box-office-ledger', 'box-office-desk']) {
    assert.ok(reachable(cellOf(id)), `${id} is sealed inside the box office`);
  }
  assert.ok(seen.has('188,26') || seen.has('189,26'), 'the staff door is not reachable');
  // The public side of the counter is the atrium and must stay open.
  assert.ok(reachable({ x: 179, y: 19 }), 'the queue cannot reach the counter');
}

// ── THE PUZZLE IS SOLVABLE INSIDE THE GAME WINDOW ───────────────────────────
//
// The clue surfaces are display only. Everything needed to choose correctly is
// readable in the room, so a browser build, withheld consent, disabled effects
// or reduced motion cost the player atmosphere and never the answer.
{
  assert.equal(keyCabinetSelection('C-17'), 'take', 'C-17 is the chapel key');
  assert.equal(keyCabinetSelection('CH-04'), 'drop');
  assert.equal(keyCabinetSelection('FOH-M'), 'drop');

  const ledger = prop('box-office-ledger');
  assert.match(ledger.inspect.first, /C-17/, 'the ledger no longer names the key in the room');

  // Every ring carries a readable tag. Without these the cabinet is a one-in-three
  // guess and there is nothing for the clue windows to be a second view OF.
  for (const [tag, ring] of Object.entries(KEY_CABINET_RING)) {
    const placed = prop(ring.id);
    assert.ok(placed, `${ring.id} is not placed`);
    assert.ok(placed.inspect?.first, `${ring.id} has no tag to read`);
    assert.ok(
      placed.inspect.first.includes(tag),
      `${ring.id} does not show its own tag (${tag}) — the comparison cannot be made in the room`,
    );
  }

  assert.equal(keyCabinetKeyIdentified({ ledger: true }), true, 'reading the ledger is enough');
  assert.equal(keyCabinetKeyIdentified({}), false, 'and knowing nothing is not');
}

console.log('box-office.spec.mjs ok');
