import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

const MESHES = [
  'demolition_scaffold_run',
  'demolition_excavator',
  'demolition_heras_fence',
  'demolition_light_tower',
  'demolition_generator',
];
const Y = (x, y) => FP.toRuntimePoint({ x: 50 + x, y: 200 + y });
const cellKey = ({ x, y }) => `${Math.floor(x)},${Math.floor(y)}`;

FP.compile(conservatory.levels, conservatory);
FP.setSpawn(conservatory.spawn.x, conservatory.spawn.y);
for (const door of FP.doorState()) {
  if (!door.keyId || door.keyId === 'master') FP.setDoorOpen(door.id, true);
}
const placed = PROPS.propsInit(FP);
const byId = new Map(placed.map((prop) => [prop.id, prop]));
const construction = placed.filter((prop) => prop.id.includes('construction') || prop.id === 'demolition-excavator-between-buildings');

for (const mesh of MESHES) assert.ok(PROP_MESH[mesh]?.blocks, `${mesh} has an honest blocking footprint`);
assert.equal(construction.length, 15, 'the two exterior buildings receive a complete demolition pass');
assert.equal(construction.filter((prop) => prop.id.startsWith('conservatoire-construction-')).length, 6);
assert.equal(construction.filter((prop) => prop.id.startsWith('cathedral-construction-')).length, 8);
assert.ok(byId.has('demolition-excavator-between-buildings'));
assert.ok(construction.every((prop) => prop.structural && prop.interactive === false && prop.blocks),
  'demolition equipment is physical structure, not another interaction list');

const stats = JSON.parse(readFileSync(new URL('../public/assets/conservatory-props.stats.json', import.meta.url), 'utf8'));
for (const mesh of MESHES) {
  assert.ok(stats.meshes[mesh]?.triangles >= 140, `${mesh} regressed to a block proxy`);
  assert.ok(stats.bounds[mesh], `${mesh} has generated bounds`);
}
assert.ok(stats.meshes.demolition_scaffold_run.triangles >= 1000, 'three scaffold lifts retain their standards, braces, decks and ladder');
assert.ok(stats.meshes.demolition_excavator.triangles >= 800, 'the excavator retains tracks, cab, boom and bucket');

// The barriers visibly stop either side of both cathedral exits. These are the
// actual exterior landings, not generous room-centre proxies.
for (const point of [Y(16, 54), Y(16, 53), Y(25, 73), Y(27, 73)]) {
  assert.equal(PROPS.propCanOccupy(point.x, point.y), true, `cathedral exit remains clear at ${cellKey(point)}`);
}

function reachable(start, target, keys = new Set(['master'])) {
  const queue = [start];
  const seen = new Set([cellKey(start)]);
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    if (cellKey(current) === cellKey(target)) return true;
    const portal = FP.connectorDestination(current.x, current.y);
    if (portal && !seen.has(cellKey(portal)) && PROPS.propCanOccupy(portal.x, portal.y)) {
      seen.add(cellKey(portal)); queue.push(portal);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const step = FP.canStep(current.x, current.y, current.x + dx, current.y + dy, { keys });
      if (!step.ok) continue;
      const next = step.redirect || { x: current.x + dx, y: current.y + dy };
      const key = cellKey(next);
      if (seen.has(key) || !PROPS.propCanOccupy(next.x, next.y)) continue;
      seen.add(key); queue.push(next);
    }
  }
  return false;
}

assert.ok(reachable(FP.spawn(), FP.toRuntimePoint(conservatory.greyDoorApproach)),
  'construction plant leaves the van-to-grey-door job route open');
assert.ok(reachable(Y(16, 54), Y(25, 73), new Set()),
  'the exterior circuit between cathedral exits remains open around the equipment');

console.log('demolition dressing contracts passed');
