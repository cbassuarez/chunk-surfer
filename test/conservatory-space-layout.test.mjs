import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

const rt = (x, y) => FP.toRuntimePoint({ x, y });
const key = ({ x, y }) => `${x},${y}`;
const KEYRING = new Set(['master', 'chapel']);

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
});
for (const door of conservatory.doors || []) FP.setDoorKey(door.x, door.y, door.key, { open: true });
FP.setSpawn(conservatory.spawn.x, conservatory.spawn.y);

PROPS.loadPropState({});
const placed = PROPS.propsInit(FP);
const byId = Object.fromEntries(placed.map((prop) => [prop.id, prop]));

function reachable(from, to, keys = KEYRING) {
  const seen = new Set([key(from)]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur.x === to.x && cur.y === to.y) return true;
    const portal = FP.connectorDestination(cur.x, cur.y);
    if (portal && !seen.has(key(portal)) && PROPS.propCanOccupy(portal.x, portal.y)) {
      seen.add(key(portal));
      q.push(portal);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tx = cur.x + dx;
      const ty = cur.y + dy;
      const step = FP.canStep(cur.x, cur.y, tx, ty, { keys });
      if (!step.ok) continue;
      const next = step.redirect || { x: tx, y: ty };
      const k = key(next);
      if (seen.has(k) || !PROPS.propCanOccupy(next.x, next.y)) continue;
      seen.add(k);
      q.push(next);
    }
  }
  return false;
}

for (const name of [
  'box_office_desk',
  'program_stack',
  'cash_terminal',
  'queue_stanchion',
  'plant_pipe_straight',
  'plant_pipe_bank',
  'plant_pipe_elbow',
  'plant_pipe_valve',
]) {
  assert.ok(PROP_MESH[name], `missing prop mesh contract for ${name}`);
}

assert.equal(placed.length, CONSERVATORY_PROPS.length, 'every dressed prop center remains in open floorplan space');

const boxOfficeProps = placed.filter((prop) => prop.id.startsWith('box-office-'));
assert.ok(boxOfficeProps.length >= 10, 'box office should read as a stocked ticket office');
assert.ok(byId['box-office-key-cabinet']?.action === 'chapel-key-cabinet', 'key cabinet interaction stays canonical');
assert.ok(byId['box-office-ledger']?.action === 'rekey-ledger', 'rekey ledger interaction stays canonical');
assert.ok(reachable(rt(88, 20), rt(94, 22)), 'box-office staff route stays walkable around counter and desk');
assert.ok(PROPS.pathToProp(rt(88, 20).x, rt(88, 20).y, 'box-office-key-cabinet', KEYRING), 'key cabinet remains reachable');

assert.ok(reachable(rt(97, 25), rt(117, 10)), 'hall door to stage route remains clear');
assert.ok(reachable(rt(97, 25), rt(100, 21)), 'hall door to lower galleria stair landing remains clear');
assert.ok(reachable(rt(102, 15), rt(1, 67)), 'orchestra to lower balcony route remains clear');
assert.ok(reachable(rt(1, 67), rt(28, 114)), 'lower balcony to upper balcony route remains clear');

const startBlockOnStairs = placed.filter((prop) => prop.id.startsWith('pool-start-'))
  .some((prop) => Math.abs(prop.x - 84) < 0.75);
assert.equal(startBlockOnStairs, false, 'starting blocks must not occupy the basin stair run');
assert.ok(reachable(rt(84, 27), rt(84, 37)), 'natatorium lobby to basin stair remains walkable');
assert.ok(reachable(rt(84, 27), rt(72, 45)), 'natatorium west deck perimeter remains walkable');
assert.ok(reachable(rt(84, 27), rt(94, 34)), 'natatorium east deck and lane storage remain walkable');

const pipeProps = placed.filter((prop) => prop.id.startsWith('plant-pipe-'));
assert.ok(pipeProps.length >= 6, 'plant room receives a visible pipe system');
assert.ok(pipeProps.every((prop) => {
  const behindX = prop.rx - Math.round(Math.sin(prop.yaw || 0));
  const behindY = prop.ry - Math.round(Math.cos(prop.yaw || 0));
  return !prop.blocks && prop.mount === 'wall' && prop.zone === 8 && FP.isSolid(behindX, behindY);
}), 'plant pipes are nonblocking wall fixtures inside the plant zone');
assert.ok(reachable(rt(25, 12), rt(35, 10)), 'studio to plant-room service path remains clear');
assert.ok(reachable(rt(25, 12), rt(40, 14)), 'plant-room pipe dressing does not block circulation');

console.log('conservatory space layout tests ok');
