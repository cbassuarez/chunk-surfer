import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { PROP_MESH } from '../src/data/conservatory-props.js';
import * as PROPS from '../src/game/props.js';
import { NOISE } from '../src/config.js';
import { ZONE } from '../src/data/floorplan/legend.js';

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
  edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});
PROPS.propsInit(FP);

// The composition main.js does in sprungFloorAt, reproduced here so the ladder
// is asserted rather than described.
const surface = (sprung, soft) => (soft > 0 ? sprung * (1 - soft * (1 - NOISE.carpet)) : sprung);

const TEXTILES = [
  'atrium-waiting-rug', 'b2-drugget-run', 'hall-stage-drugget', 'main-stair-runner',
  'academic-corridor-runner', 'chapel-nave-runner', 'store-rolled-rug',
];

test('the ladder is the right way up, and a covered sprung floor is never an amnesty', () => {
  const bare = surface(1, 0);
  const maple = surface(NOISE.sprung, 0);
  const sheeted = surface(NOISE.sprung, 0.7);
  const wool = surface(1, 1);

  assert.ok(maple > bare, 'sprung maple is still the loudest thing in the building');
  assert.ok(wool < bare, 'and wool is the only thing quieter than boards');
  assert.ok(sheeted < maple, 'drugget over the maple helps');
  assert.ok(sheeted > wool, 'but never as much as carpet on a solid floor');

  // THE LINE THE WHOLE MECHANIC EXISTS FOR. Sheeting the dance wing must leave
  // it ORDINARY — around a bare floor — not quiet. If this ever drops well under
  // 1 the worst room in the game has been handed an amnesty.
  assert.ok(sheeted > 0.9 && sheeted < 1.25,
    `the sheeted dance wing is merely ordinary (${sheeted.toFixed(3)})`);

  // And nothing is ever silent: a footfall on the softest thing here still costs.
  assert.ok(wool >= 0.4, 'the quietest surface still makes a sound');
});

test('every textile is actually in the building', () => {
  // propsInit filters `!isSolid(rx,ry)`, silently. A runner is seven metres of
  // prop and its origin cell being open is not the same as its footprint being
  // open, so this is the test that catches a rug authored half into a wall.
  for (const id of TEXTILES) {
    assert.ok(PROPS.propById(id), `${id} survives propsInit`);
  }
});

test('a runner is soft along its whole length, not only at its origin cell', () => {
  // The bug this exists to catch: testing rx/ry instead of the footprint makes a
  // seven-metre chapel runner soft on one cell and bare on the other thirteen.
  const runner = PROPS.propById('chapel-nave-runner');
  const bounds = PROP_MESH.textile_chapel_runner;
  const along = Math.round((bounds.d / 2 - 0.4) * 2);

  let soft = 0;
  let hard = 0;
  for (let step = -along; step <= along; step += 1) {
    const value = PROPS.softFloorPropAt(runner.rx, runner.ry + step);
    if (value > 0) soft += 1; else hard += 1;
  }
  assert.ok(soft > along, `the runner is soft down its length (${soft} soft, ${hard} not)`);

  // And it ends. A textile that never stops is a bug in the footprint test.
  assert.equal(PROPS.softFloorPropAt(runner.rx, runner.ry + 40), 0, 'and it runs out');
  assert.equal(PROPS.softFloorPropAt(runner.rx + 40, runner.ry), 0, 'in both directions');
});

test('the dance wing is the placement the mechanic exists for', () => {
  const drugget = PROPS.propById('b2-drugget-run');
  assert.equal(drugget.zone, ZONE.danceStudio, 'the drugget is on the sprung floor');

  // On it and off it, in the room the game calls the worst place to be found.
  const on = PROPS.softFloorPropAt(drugget.rx, drugget.ry);
  assert.ok(on > 0, 'standing on it is soft');
  assert.ok(surface(NOISE.sprung, on) < surface(NOISE.sprung, 0),
    'and quieter than the maple either side of it');
});

test('the rolled rug in the store is stock, not floor', () => {
  const rolled = PROPS.propById('store-rolled-rug');
  assert.equal(rolled.zone, ZONE.store);
  assert.equal(PROPS.softFloorPropAt(rolled.rx, rolled.ry), 0,
    'a rug stood on end is not something you walk on');
  assert.equal(PROP_MESH.textile_rolled.softFloor, undefined, 'and it declares no softFloor');
});

test('softFloor lives on the mesh, and only textiles have it', () => {
  const soft = Object.entries(PROP_MESH).filter(([, mesh]) => Number(mesh.softFloor) > 0);
  assert.ok(soft.length >= 5, 'the textiles declare it');
  for (const [name, mesh] of soft) {
    assert.ok(/rug|textile/.test(name), `${name} is a textile`);
    assert.ok(mesh.softFloor > 0 && mesh.softFloor <= 1, `${name}: softFloor is 0..1`);
    assert.equal(mesh.blocks, false, `${name} does not block: you walk on it`);
  }
});

test('the textile pack is CC0, credited, and inside its budget', () => {
  const manifest = JSON.parse(readFileSync(new URL('../tools/chunk_surfer/textile-sources.json', import.meta.url), 'utf8'));
  for (const [id, surfaceEntry] of Object.entries(manifest.surfaces)) {
    assert.equal(surfaceEntry.license, 'CC0-1.0', `${id} is CC0`);
    assert.match(surfaceEntry.url, /^https:\/\/polyhaven\.com\/a\//, `${id} names its source`);
    for (const [mapId, map] of Object.entries(surfaceEntry.maps)) {
      assert.match(map.sha256, /^[0-9a-f]{64}$/, `${id}/${mapId} is pinned by hash`);
    }
  }

  // The pack is optional at runtime (r3d catches a missing one and keeps the
  // procedural rug), so this only asserts it when it has been built.
  let credits = null;
  try { credits = JSON.parse(readFileSync(new URL('../public/assets/conservatory-textiles.credits.json', import.meta.url), 'utf8')); }
  catch { return; }
  assert.ok(credits.pack.bytes <= manifest.limits.bytes, `pack is inside its byte budget (${credits.pack.bytes})`);
  assert.ok(credits.pack.triangles <= manifest.limits.triangles, `and its triangle budget (${credits.pack.triangles})`);
  assert.match(credits.pack.license, /CC0-1\.0/, 'and the pack records the surface licence');

  // Every mesh the placements name has to exist in the pack, or the rug renders
  // as whatever the procedural fallback happens to be — which for six of these
  // is nothing at all.
  const built = new Set(credits.meshes.map((entry) => entry.name));
  for (const id of TEXTILES) {
    const mesh = PROPS.propById(id).mesh;
    assert.ok(built.has(mesh), `${mesh} is in the built pack`);
  }
});
