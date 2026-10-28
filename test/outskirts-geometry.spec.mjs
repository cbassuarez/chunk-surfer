import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OUTSKIRT_BUS_ENCOUNTER, OUTSKIRT_CORRIDOR, OUTSKIRT_PASSES, OUTSKIRT_STRETCH_COUNT,
  OUTSKIRT_STRETCH_METRES, OUTSKIRT_STRETCH_START, outskirtsArrivalLayout, outskirtsPassLayout,
} from '../src/data/source-outskirts-arrival.js';
import { outskirtsCollisionBoxes, outskirtsPointBlocked } from '../src/game/outskirts-geometry.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import { OUTSKIRTS_BUS_PASSAGE, busPassageLocal } from '../src/data/outskirts-bus-passage.js';

const layout = outskirtsArrivalLayout();
const passStart = (k) => OUTSKIRT_STRETCH_START + k * OUTSKIRT_STRETCH_METRES;
const onPass = (k) => layout.filter((p) => p.stretch === k);
function blocked(pieces, x, along) {
  if (Math.abs(x) > OUTSKIRT_CORRIDOR.halfWidth - 0.25) return true;
  return pieces.some((p) => {
    const dx = x - p.across, dz = -(along - p.along), c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    return outskirtsPointBlocked(outskirtsCollisionBoxes(p, PROP_BOUNDS[p.mesh]), dx * c - dz * s, dx * s + dz * c);
  });
}

// A small route search checks the spatial contract rather than simply asserting
// that the authored bus has a 'blocked' name. It permits entering the actual
// doorway and walking inside the bus; closed outer panels still have to refuse.
function route(pieces, k, closeGap = false) {
  // Start before the whole court: the canonical van now stands on the road
  // axis at18.4m, so the old18m fixture started inside its real cargo body.
  const grid = 0.25, xMin = -11, xMax = 11, zMin = 0, zMax = 34;
  const nx = Math.round((xMax - xMin) / grid) + 1, nz = Math.round((zMax - zMin) / grid) + 1;
  const at = (i, j) => ({ x: xMin + i * grid, along: passStart(k) + zMin + j * grid });
  const start = Math.round((0 - xMin) / grid), queue = [[start, 0]], seen = new Set([start]), parent = new Map();
  let found = null;
  for (let q = 0; q < queue.length; q += 1) {
    const [i, j] = queue[q], key = j * nx + i;
    if (j === nz - 1) { found = key; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj, next = jj * nx + ii;
      if (ii < 0 || ii >= nx || jj < 0 || jj >= nz || seen.has(next)) continue;
      const p = at(ii, jj);
      if (blocked(pieces, p.x, p.along)) continue;
      if (closeGap) {
        if (k === OUTSKIRT_BUS_ENCOUNTER.pass) {
          const local = busPassageLocal({ across: p.x, along: p.along - passStart(k) });
          if (Math.abs(local.x) < .8 && Math.abs(local.z) < .4) continue;
        } else if (p.x >= 4.35 && p.x <= 6.55 && Math.abs(p.along - (passStart(k) + 24.5)) < 0.4) continue;
      }
      seen.add(next); parent.set(next, key); queue.push([ii, jj]);
    }
  }
  if (found == null) return null;
  const path = [];
  for (let key = found; key != null; key = parent.get(key)) path.push(at(key % nx, Math.floor(key / nx)));
  return path;
}

test('the learned road keeps stable coordinates outside authored rearrangements and keeps the phone contracts', () => {
  assert.equal(OUTSKIRT_PASSES.length, 29);
  for (const k of [0, 1, 2, 5, 6, 8, 9, 11, 12, 13]) {
    const pieces = onPass(k), first = onPass(0);
    for (const key of ['booth', 'shelter', 'van', 'phone-box', 'lamp-0']) {
      const p = pieces.find((v) => v.key === key), b = first.find((v) => v.key === key);
      assert.ok(p && b, `${key} vanished before it could be learned on ${k}`);
      assert.equal(p.across, b.across);
      assert.ok(Math.abs((p.along - passStart(k)) - (b.along - passStart(0))) < 1e-9);
      assert.equal(p.yaw, b.yaw);
    }
  }
  assert.equal(OUTSKIRT_PASSES[3].break, 'mirrored');
  assert.equal(onPass(3).find(p => p.key === 'booth').across, -onPass(0).find(p => p.key === 'booth').across);
  assert.equal(OUTSKIRT_PASSES[4].break, 'turned');
  assert.equal(OUTSKIRT_PASSES[13].break, null);
  assert.ok(onPass(13).some((p) => p.payphone && p.across === 8.6));
  assert.ok(onPass(21).some((p) => p.payphone));
  const last = onPass(OUTSKIRT_STRETCH_COUNT - 1);
  assert.equal(last.length, 4);
  assert.ok(last.every((p) => p.lamp));
});

test('final-filtered physical changes survive and the late self-recognition has a place', () => {
  for (const pass of OUTSKIRT_PASSES) {
    const pieces = onPass(pass.k);
    if (pass.break === 'blocked') {
      assert.ok(pieces.some((p) => p.key === 'bus'));
      assert.equal(pieces.filter((p) => /^funnel-/.test(p.key)).length, 2);
    }
    if (pass.break === 'unfinished') assert.ok(pieces.some((p) => p.unfinished), `empty unfinished pass ${pass.k}`);
    if (pass.break === 'swapped') assert.ok(pieces.some((p) => p.key === 'booth') && pieces.some((p) => p.key === 'van'));
    if (pass.break === 'stutter') assert.ok(pieces.some((p) => p.key.endsWith('-stutter')));
    if (pass.break === 'no-road') assert.ok(!pieces.some((p) => p.key === 'road'));
  }
  for (const k of [15, 16, 17]) assert.ok(onPass(k).some((p) => p.inspect === 'ledger'));
  for (const key of ['van', 'van-headphones', 'van-handset', 'van-cord']) assert.ok(onPass(25).some((p) => p.key === key));
  assert.ok(!onPass(26).some((p) => p.key.startsWith('van')));
});

test('the early bus requires its front entrance, aisle and rear exit without blocking progression', () => {
  const k = OUTSKIRT_BUS_ENCOUNTER.pass, pieces = onPass(k), start = passStart(k);
  assert.ok(pieces.some((p) => p.key === OUTSKIRT_BUS_ENCOUNTER.womanKey && p.encounter === 'bus-close'));
  const bus = pieces.find(p => p.key === 'bus');
  assert.equal(bus.mesh, OUTSKIRTS_BUS_PASSAGE.mesh);
  assert.equal(bus.busPassage, true);
  assert.ok(bus.collision.length, 'the separate passage model has no explicit physical panels');
  assert.ok(blocked(pieces, 0, start + 23.275), 'straight through the bus side is allowed');
  assert.ok(blocked(pieces, 5.45, start + 24.5), 'the obsolete exterior nose gap bypasses the aisle');
  assert.ok(!blocked(pieces, -3.15, start + 23.25), 'the front doorway has no physical opening');
  const path = route(pieces, k);
  assert.ok(path, 'the encounter dead-ends');
  const local = path.reverse().map(p => busPassageLocal({ across: p.x, along: p.along - start }));
  const entry = local.findIndex(p => p.x > -1.1 && p.x < -.4 && p.z > -3.7 && p.z < -2.6);
  const aisle = local.findIndex((p, i) => i > entry && Math.abs(p.x) <= .31 && Math.abs(p.z) < .5);
  const exit = local.findIndex((p, i) => i > aisle && p.x > .4 && p.x < 1.1 && p.z > 3.3 && p.z < 4.4);
  assert.ok(entry >= 0 && aisle > entry && exit > aisle, 'a route misses the interior crossing');
  assert.equal(route(pieces, k, true), null, 'blocking the aisle still leaves an alternate route');
  for (const kk of [0, 1, 6, 8, 18, 19]) assert.ok(route(onPass(kk), kk), `pass ${kk} has no forward route`);
});

test('later blocked bus variants retain their measured exterior nose gap', () => {
  for (const k of [18, 19]) {
    const pieces = onPass(k), start = passStart(k);
    assert.equal(pieces.find(p => p.key === 'bus').mesh, 'outskirts_bus');
    assert.ok(!blocked(pieces, 5.45, start + 24.5), `pass ${k}: legacy nose gap is shut`);
    assert.ok(blocked(pieces, 4.8, start + 24.5), `pass ${k}: nose collision loses body radius`);
    assert.ok(blocked(pieces, 6.1, start + 24.5), `pass ${k}: rail collision loses body radius`);
    const path = route(pieces, k);
    assert.ok(path);
    const crossing = path.filter(p => Math.abs(p.along - (start + 24.5)) < .13);
    assert.ok(crossing.length && crossing.every(p => p.x > 4.85 && p.x < 6.05));
    assert.equal(route(pieces, k, true), null, `pass ${k}: blocking the nose gap leaves a bypass`);
  }
});

test('shell openings and unfinished frames agree with physical affordances', () => {
  const shelter = outskirtsCollisionBoxes({ mesh: 'outskirts_shelter' });
  assert.ok(!outskirtsPointBlocked(shelter, 1.2, 0), 'open shelter front is a solid box');
  assert.ok(!outskirtsPointBlocked(shelter, 0.45, 0), 'standing before the bench is blocked');
  assert.ok(outskirtsPointBlocked(shelter, -1.22, 0));
  const bus = outskirtsCollisionBoxes({ mesh: 'outskirts_bus' });
  assert.ok(!outskirtsPointBlocked(bus, -1.225, -3.15), 'bus entrance is blocked');
  assert.ok(outskirtsPointBlocked(bus, -1.225, 0), 'closed bus side is passable');
  const frame = outskirtsCollisionBoxes({ mesh: 'outskirts_shelter', unfinished: true }, { min: [-1.3, 0, -2.3], max: [1.3, 2.6, 2.3] });
  assert.ok(!outskirtsPointBlocked(frame, 0, 0));
  assert.ok(outskirtsPointBlocked(frame, 1.3, 2.3));
});

test('footprints and carried/decorative objects never turn into invisible floor walls', () => {
  const footprints = onPass(17).filter((p) => p.mesh === 'wet_footprint');
  assert.equal(footprints.length, 83);
  for (const p of footprints) assert.deepEqual(outskirtsCollisionBoxes(p, PROP_BOUNDS[p.mesh]), []);
  for (const mesh of ['loose_note', 'soft_bag', 'draped_coat', 'ending_headphones', 'city_phone_box_cord', 'outskirts_lodge_hatch']) {
    assert.deepEqual(outskirtsCollisionBoxes({ mesh }, { min: [-0.5, 0, -0.5], max: [0.5, 2, 0.5] }), []);
  }
  const start = passStart(17);
  const pieces=onPass(17),without=pieces.filter(p=>!['wet_footprint','loose_note'].includes(p.mesh));
  for (let j = 0; j < 68; j += 1) assert.equal(blocked(pieces,0,start+.5*j),blocked(without,0,start+.5*j),`paper/footprint changes collision at ${j/2}m`);
  assert.ok(route(pieces,17),'ordinary walking cannot pass the real van and shelter');
});


test('loose pages and van equipment sit on their actual support surfaces', () => {
  const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} != ${b}`);
  const local = (p, parent) => {
    const dx = p.across - parent.across, dz = -(p.along - parent.along);
    return [dx * Math.cos(parent.yaw) - dz * Math.sin(parent.yaw), dx * Math.sin(parent.yaw) + dz * Math.cos(parent.yaw)];
  };
  for (const k of [1, 3, 10, 12]) {
    const pieces = onPass(k), parent = pieces.find((p) => p.key === 'booth'), page = pieces.find((p) => p.key === 'page-ledger');
    assert.ok(page && parent);
    const [x, z] = local(page, parent);
    near(x, -0.68, 'ledger page x'); near(z, -1.40, 'ledger page z'); near(page.y, 1.51, 'ledger page height');
    assert.deepEqual(page.interact, [0, -0.40]); assert.equal(page.closeReach, 1.6);
  }
  const pieces = outskirtsPassLayout(25, { break: null }), parent = pieces.find((p) => p.id === 'van');
  for (const [key, bottom] of [['van-bag', 1.10], ['van-radio', 1.10], ['van-headphones', 1.10], ['van-case', 0.67]]) {
    const p = pieces.find((v) => v.id === key); assert.ok(p, key);
    near(p.y + PROP_BOUNDS[p.mesh].min[1], bottom, `${key} bottom`);
  }
  for (const page of pieces.filter((p) => p.id === 'page-dash' || p.id.startsWith('van-dash-page-'))) {
    const [, z] = local(page, parent);
    assert.ok(z >= -3.100000001 && z <= -3.074999999, `${page.id} is not on the cab dashboard`);
    assert.ok(page.y >= 1.36 - 1e-9 && page.y <= 1.384 + 1e-9);
  }
  const page = pieces.find((p) => p.id === 'page-dash');
  assert.deepEqual(page.interact, [0, -0.75]);
  assert.ok(local(page, parent)[1] + page.interact[1] < PROP_BOUNDS.yard_van.min[2], 'read anchor must be outside the front glass');
});

test('a turned van carries every owned attachment and its inspection orientation', () => {
  const before = outskirtsPassLayout(25, { break: null }), after = outskirtsPassLayout(25, { break: 'turned' });
  const van = before.find((p) => p.id === 'van'), transformed = after.find((p) => p.id === 'van');
  assert.equal(transformed.yaw, van.yaw+Math.PI);
  const owned = before.filter((p) => p.attachedTo === 'van');
  assert.ok(owned.some((p) => p.id === 'van-lamp') && owned.some((p) => p.id === 'page-dash') && owned.some((p) => p.id === 'van-headphones'));
  for (const p of owned) {
    const q = after.find((v) => v.id === p.id); assert.ok(q, p.id);
    assert.ok(Math.abs(q.across - (2 * van.across - p.across)) < 1e-9, `${p.id} across`);
    assert.ok(Math.abs(q.along - (2 * van.along - p.along)) < 1e-9, `${p.id} along`);
    assert.ok(Math.abs(q.yaw - p.yaw - Math.PI) < 1e-9, `${p.id} yaw`);
    assert.equal(q.y, p.y); assert.deepEqual(q.interact, p.interact);
  }
});
