import assert from 'node:assert/strict';
import { createPresenceNavigation } from '../src/game/presence-navigation.js';

function randomFor(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const w = 64, h = 64;
const walls = new Set();
for (let y = 4; y < 60; y += 1) if (y !== 31) walls.add(`32,${y}`);
const props = new Set(['26,31', '38,31']);
const solid = (x, y) => x < 0 || y < 0 || x >= w || y >= h || walls.has(`${Math.floor(x)},${Math.floor(y)}`);
const occupied = (x, y) => !props.has(`${Math.floor(x)},${Math.floor(y)}`);
const navigation = createPresenceNavigation({
  isSolid: solid,
  canOccupy: occupied,
  canStep: (_ax, _ay, bx, by) => ({ ok: !solid(bx, by) && occupied(bx, by) }),
  planSize: () => ({ w, h }),
});

const route = navigation.findPath({ x: 20, y: 20 }, { x: 44, y: 20 });
assert.ok(route?.length, 'reachable points on opposite sides of a wall get a route');
assert.ok(route.some((point) => point.x === 32 && point.y === 31), 'route uses the inhabitable opening');
assert.equal(route.some((point) => solid(point.x, point.y) || !occupied(point.x, point.y)), false, 'route never enters walls or prop collision');

let mover = { x: 20, y: 20 };
for (let i = 0; i < 200 && Math.hypot(mover.x - 44, mover.y - 20) > .2; i += 1) {
  mover = navigation.resolveMove(mover, { x: 44, y: 20 }, .45);
  assert.equal(navigation.isWalkable(mover), true, 'every resolved movement sample remains inhabitable');
}
assert.ok(Math.hypot(mover.x - 44, mover.y - 20) < .2, 'resolved movement reaches the routed destination');

const sectors = new Set();
for (let seed = 1; seed <= 80; seed += 1) {
  const spawn = navigation.sampleSpawn({
    player: { x: 20, y: 31 }, forward: { x: 1, y: 0 },
    minDistance: 8, maxDistance: 18, random: randomFor(seed),
  });
  assert.ok(spawn, `seed ${seed} gets a reachable manifestation`);
  assert.equal(navigation.isWalkable(spawn), true);
  assert.ok(navigation.findPath(spawn, { x: 20, y: 31 })?.length > 1);
  sectors.add(spawn.sector);
}
assert.deepEqual([...sectors].sort(), ['front', 'rear', 'side'], 'manifestations can appear in front, beside, or behind');

console.log('presence building navigation specs passed');
