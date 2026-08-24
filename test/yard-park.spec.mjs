// The park in the south-west yard, and the head in its fountain.
//
// That quarter of the yard was fifty metres of wet tarmac with nothing on it.
// What is there now has to be four things at once, and this file is one section
// per thing:
//
//   REAL GROUND      — grass and a basin you can actually walk on, not a picture
//                      of a park painted onto tarmac.
//   REAL WATER       — a second body of standing water, which the game could not
//                      previously have, with its own depth and its own clarity.
//   A ROUND TRIP     — head out of the fountain, up three floors, back onto a
//                      bust that has been missing its eyes since before tonight.
//   A DOOR THAT OPENS— the only key in the game that exists and was never issued.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { MATERIAL, ZONE } from '../src/data/floorplan/legend.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import { YARD_PARK, YARD_PARK_PROPS } from '../src/data/yard-park.js';
import { computeWaterBodies, nearestWaterBody, waterBlocksAt, waterBodyAt } from '../src/game/water-bodies.js';
import { exteriorRainMaterialMixAt } from '../src/data/exterior-district.js';
import {
  MARBLE_HEAD_BUST,
  carryingMarbleHead,
  collectMarbleHead,
  declineMarbleHead,
  marbleHeadDeclined,
  marbleHeadSettled,
  marbleHeadFits,
  marbleHeadInWater,
  marbleHeadReturned,
  normalizeMarbleHead,
  resetMarbleHead,
  returnMarbleHead,
} from '../src/game/marble-head.js';

const plan = FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors, edgePortals: conservatory.edgePortals,
  doors: conservatory.doors,
});
FP.setSpawn(conservatory.spawn.x, conservatory.spawn.y);

// The yard island is parked at logical (50, 200) with a physical origin of
// (0, 0), so physical metres in the yard are logical metres minus that.
const yard = (x, z) => FP.toRuntimePoint({ x: x + 50, y: z + 200 });
const at = (x, z) => { const p = yard(x, z); return { x: Math.round(p.x), y: Math.round(p.y) }; };
const steps = (from, to) => FP.canStep(yard(...from).x, yard(...from).y, yard(...to).x, yard(...to).y, { keys: new Set(['master']) });

// ── real ground ─────────────────────────────────────────────────────────────

test('the park is ground, not a picture of one', () => {
  // Grass did not exist as a floorplan material before this. Without it the
  // lawn falls through surfaceSlot's general case and a park is drawn as ash
  // floorboards — and, worse, it sounds like tarmac underfoot.
  const lawn = at(5, 40);
  assert.equal(FP.materialAt(lawn.x, lawn.y), MATERIAL.wetGrass);
  assert.equal(FP.zoneAt(lawn.x, lawn.y), ZONE.dock, 'the yard lights it, and the yard has weather over it');

  // The paths are the same ordinary tarmac as the yard they were cut into.
  const path = at(10, 30);
  assert.equal(FP.materialAt(path.x, path.y), MATERIAL.wetTarmac);

  // The basin is wetTile, which is the address a water body is looked up by.
  const basin = at(10, 36);
  assert.equal(FP.materialAt(basin.x, basin.y), MATERIAL.wetTile);
  assert.ok(FP.floorAt(basin.x, basin.y) < FP.floorAt(lawn.x, lawn.y) - .2, 'and it is sunk');
});

test('you can walk in, and you can step down into the fountain', () => {
  // The step into the basin has to stay under canStep's 0.45m limit in both
  // directions: the thing in the water has to be reachable without inventing a
  // way to lean over a rim, and you have to be able to get back out.
  for (const [label, from, to] of [
    ['tarmac into the park', [10, 21], [10, 22]],
    ['along the spine', [10, 26], [10, 27]],
    ['path onto the lawn', [9, 30], [8, 30]],
    ['path down into the basin', [10, 34], [10, 35]],
    ['back out of the basin', [10, 38], [10, 39]],
  ]) {
    assert.equal(steps(from, to).ok, true, `${label} is blocked: ${steps(from, to).why}`);
  }
});

test('the park did not sever the yard it was cut into', () => {
  // Flood-filling from the van: the park must be reachable, and nothing that
  // was reachable before may have been walled off by a hedge.
  const start = FP.toRuntimePoint(conservatory.spawn);
  const seen = new Set();
  const queue = [[Math.round(start.x), Math.round(start.y)]];
  seen.add(queue[0].join(','));
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (seen.has(key)) continue;
      if (!FP.canStep(x, y, x + dx, y + dy, { keys: new Set(['master']) }).ok) continue;
      seen.add(key); queue.push([x + dx, y + dy]);
    }
  }
  const reached = (x, z) => { const c = at(x, z); return seen.has(`${c.x},${c.y}`); };
  assert.ok(reached(10, 22), 'the park entrance');
  assert.ok(reached(5, 40), 'the far lawn');
  assert.ok(reached(10, 36), 'the fountain itself');
});

// ── real water ──────────────────────────────────────────────────────────────

test('the fountain is a second body of water, and it is not the swimming bath', () => {
  // Water used to be one hard-coded rectangle: a single uWaterBounds, bounds
  // found by scanning for one zone-and-material pair, and an activation rule
  // that asked which endings you had seen. Two bodies with genuinely different
  // depth and clarity is the whole point of generalising it.
  const bodies = computeWaterBodies(FP);
  const ids = bodies.map((body) => body.id).sort();
  assert.deepEqual(ids, ['natatorium', 'park-fountain']);

  const bath = bodies.find((body) => body.id === 'natatorium');
  const fountain = bodies.find((body) => body.id === 'park-fountain');
  assert.ok(fountain.murk < bath.murk, 'you can see into the fountain — there is something in it');
  assert.ok(fountain.levelM > bath.levelM, 'and it is deeper than what failed to drain out of the bath');
  assert.equal(fountain.blocks, false, 'you step down into it');
  assert.equal(bath.blocks, true, 'the bath is a place you look into');

  const basin = at(10, 36);
  assert.equal(waterBodyAt(bodies, basin.x, basin.y, null)?.id, 'park-fountain');
  assert.equal(waterBlocksAt(bodies, basin.x, basin.y, null), false);
});

test('the natatorium keeps its own activation, and the fountain does not borrow it', () => {
  const bodies = computeWaterBodies(FP);
  const bath = bodies.find((body) => body.id === 'natatorium');
  const fountain = bodies.find((body) => body.id === 'park-fountain');
  // The bath is gated on the night's history. The fountain is gated on it having
  // been raining, which it has been all night.
  assert.equal(bath.active({ environment: { natatoriumWater: 'drained' } }), false);
  assert.equal(bath.active({ environment: { natatoriumWater: 'murky' } }), true);
  assert.equal(fountain.active(null), true);

  // One uWaterBounds, resolved nearest — the two are never in shot together.
  const fromTheVan = at(7, 7);
  assert.equal(nearestWaterBody(bodies, fromTheVan.x, fromTheVan.y, null)?.id, 'park-fountain');
});

test('rain on a lawn under four trees is not rain on fifty metres of tarmac', () => {
  const inPark = exteriorRainMaterialMixAt(10, 36);
  const onTarmac = exteriorRainMaterialMixAt(30, 60);
  assert.ok(inPark.foliage > onTarmac.foliage * 2, 'the park reads foliage');
  assert.ok(inPark.steel < onTarmac.steel, 'and the yard drops away under it');
});

// ── what stands on it ───────────────────────────────────────────────────────

test('the park is furnished out of the catalogue that was already there', () => {
  // Only the fountain and the head use park-specific gameplay meshes. The hero
  // vegetation variants belong to the shared world catalogue.
  const novel = ['park_fountain', 'park_marble_eyes'];
  const used = [...new Set(YARD_PARK_PROPS.map((prop) => prop.mesh))];
  for (const mesh of used) {
    assert.ok(PROP_MESH[mesh], `${mesh} has a footprint contract`);
    if (!novel.includes(mesh)) {
      assert.ok(!mesh.startsWith('park_'), `${mesh} should be reused, not authored for the park`);
    }
  }
  // Exactly one way in, so it reads as a place you enter rather than a texture
  // you walk over.
  const hedges = YARD_PARK_PROPS.filter((prop) => ['yard_hedge_run','yard_hedge_dense','yard_hedge_corner'].includes(prop.mesh));
  assert.ok(hedges.length >= 3, 'the west and south edges are closed');
  assert.ok(hedges.every((prop) => prop.blocks === true), 'and the hedge is a hedge, not a decal');
});

// ── the round trip ──────────────────────────────────────────────────────────

test('the eyes are in the water, and the water is where it is authored', () => {
  const eyes = CONSERVATORY_PROPS.find((prop) => prop.id === YARD_PARK.headId);
  assert.ok(eyes, 'the eyes are placed');
  // NO `action`, deliberately. Picking them up used to be a keypress; it is a
  // decision now, and the decision lives in main.js's interactParkEyes behind a
  // torch gate. An action here would put the old one-press take back.
  assert.equal(eyes.action, undefined, 'taking them is a beat, not a verb on a prop');
  // And they are labelled as what they look like, not as what they are.
  assert.match(eyes.label, /coin/i, 'they read as pennies until the torch is on them');
  const cell = at(eyes.x - 50, eyes.y - 200);
  assert.equal(FP.materialAt(cell.x, cell.y), MATERIAL.wetTile, 'and they are lying in the basin, not beside it');
});

test('leaving them is a decision, not a deferral', () => {
  resetMarbleHead();
  assert.equal(marbleHeadInWater(), true);
  assert.equal(declineMarbleHead(), true);
  assert.equal(marbleHeadInWater(), false, 'the silt goes back over them');
  assert.equal(marbleHeadSettled(), true, 'so the prop leaves the basin either way');
  assert.equal(marbleHeadDeclined(), true);
  // Terminal. Nothing promotes a refusal back into a pickup, and the bust stays
  // blind for the night — which is what makes the choice worth making.
  assert.equal(collectMarbleHead(), false, 'they cannot be taken after being left');
  assert.equal(carryingMarbleHead(), false);
  assert.equal(returnMarbleHead(MARBLE_HEAD_BUST), false, 'and the bust never gets them');
  assert.equal(marbleHeadReturned(), false);
  resetMarbleHead();
});

test('the head goes back to exactly one bust', () => {
  resetMarbleHead();
  assert.equal(marbleHeadInWater(), true);
  assert.equal(collectMarbleHead(), true);
  assert.equal(carryingMarbleHead(), true);
  assert.equal(collectMarbleHead(), false, 'it cannot be taken twice');

  // Two gallery busts are a plinth and the bottom third of a face. Only one of
  // them is this break.
  assert.equal(marbleHeadFits('academic-bust-fragment-6'), false);
  assert.equal(returnMarbleHead('academic-bust-fragment-6'), false, 'the wrong face refuses it');
  assert.equal(marbleHeadFits(MARBLE_HEAD_BUST), true);
  assert.equal(returnMarbleHead(MARBLE_HEAD_BUST), true);
  assert.equal(marbleHeadReturned(), true);
  assert.equal(returnMarbleHead(MARBLE_HEAD_BUST), false, 'and only once');
  resetMarbleHead();
});

test('a returned head survives a reload, and a junk save does not', () => {
  assert.equal(normalizeMarbleHead(null).phase, 'in-the-water');
  assert.equal(normalizeMarbleHead({ phase: 'nonsense' }).phase, 'in-the-water');
  const returned = normalizeMarbleHead({ phase: 'returned' });
  assert.equal(returned.phase, 'returned');
  assert.equal(returned.toldWhereTheKeyIs, true, 'a bust that has spoken does not forget');
});

// ── the door that opens ─────────────────────────────────────────────────────

test('the plant key is the reward, and nothing hands it over before the bust talks', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  // The gate is knowing where to look, not a lock. The key sits under the felt
  // of the head that sits off-square and has since before tonight.
  assert.match(source, /function takeServicesKey/);
  assert.match(source, /HEAD\.marbleHeadReturned\(\)/);
  assert.match(source, /playerKeys\.add\('services-core'\)/);
  // And it survives a reload the same way the chapel key does.
  assert.match(source, /includes\('services_core_key'\)\)playerKeys\.add\('services-core'\)/);
});

test('the sealed spur doors refuse the standard ring and turn for the plant key', () => {
  const door = (x, y, keys) => FP.interactDoor(...Object.values(FP.toRuntimePoint({ x, y })), 0, keys);
  const master = new Set(['master']);
  const withKey = new Set(['master', 'services-core']);
  for (const [label, x, y] of [['spur-substation', 25.5, 36.5], ['spur-tank', 29.5, 37.5]]) {
    const refused = door(x, y, master);
    assert.equal(refused.ok, false, `${label} refuses the standard ring`);
    assert.equal(refused.keyId, 'services-core');
    const opened = door(x, y, withKey);
    assert.equal(opened.ok, true, `${label} turns for the plant key`);
  }
});

test('the substation is the room that was actually sealed, and it is dressed', () => {
  // Both spur doors carry the same lock, but only one of them hides anything.
  // `spur-tank` is a second door into the plant annex, which the wide annex
  // opening already reaches and which holds the heating header the oversized
  // Stillson has to get to — so nothing may be placed on that side.
  const substation = FP.toRuntimePoint({ x: 22, y: 35.5 });
  const rx = Math.round(substation.x);
  const ry = Math.round(substation.y);
  assert.equal(FP.isSolid(rx, ry), false, 'the substation is real floor');
  assert.equal(FP.zoneAt(rx, ry), ZONE.plant);

  const dressing = CONSERVATORY_PROPS.filter((prop) => prop.id.startsWith('spur-'));
  assert.ok(dressing.length >= 3, 'the room is dressed rather than left an empty box');
  assert.ok(dressing.every((prop) => prop.id.startsWith('spur-substation-')),
    'and nothing is placed on the tank side, where the heating header route runs');
  assert.ok(dressing.some((prop) => prop.inspect), 'at least one thing in there is worth reading');
});
