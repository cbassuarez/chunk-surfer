import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  SOURCE_LAST_RECEPTION as S, sourceReceptionContains, sourceReceptionOwns, sourceReceptionRoomAt,
  sourceReceptionSupportAt, sourceReceptionCollisionAt, sourceReceptionTraceWalk, sourceLastReceptionSegmentClear,
  sourceReceptionGeometry, sourceReceptionSolids, sourceReceptionPropPlacements,
  sourceReceptionLineOfSight,
} from '../src/data/source-last-reception.js';
import { sourceDivideSupportAt } from '../src/data/source-braided-divide.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const nodes = Object.fromEntries(S.navNodes.map(node => [node.id, node]));

test('the optional room fits the existing bank without altering the lift, court or upper ramp', () => {
  assert.equal(S.floor, 9);
  for (const x of [S.bounds.minX + .5, S.bounds.maxX - .5]) for (const z of [S.bounds.minZ + .5, S.bounds.maxZ - .5]) {
    close(sourceDivideSupportAt(x, z, { feet: S.floor }).floor, S.floor);
    assert.equal(sourceReceptionContains(x, z), true);
  }
  for (const [x, z] of [[-12, -465], [7, -386], [-50, -470], [0, -450], [-89, -450]]) {
    assert.equal(sourceReceptionOwns(x, z), false);
    assert.equal(sourceReceptionCollisionAt(x, z), null);
    assert.equal(sourceReceptionSupportAt(x, z), null);
  }
  assert.equal(sourceReceptionRoomAt(-64, -459).id, 'return');
  assert.equal(sourceReceptionRoomAt(-52, -459).id, 'service');
  assert.equal(sourceReceptionRoomAt(-80, -457, { feet: 11.8 }).id, 'gallery');
  assert.equal(sourceReceptionRoomAt(-80, -457, { feet: 11.8 }).floor, 9, 'raymarch floor never fills the space beneath the gallery');
});

test('both broad exits and every circulation edge stay open in both directions', () => {
  for (const [a, b] of S.navEdges) for (const [from, to] of [[a, b], [b, a]]) {
    assert.equal(sourceLastReceptionSegmentClear(nodes[from], nodes[to], .27), true, `${from} → ${to}`);
  }
  for (const entrance of S.entrances) {
    for (const offset of [-.6, 0, .6]) {
      const from = { x: entrance.x - 2, z: entrance.z + offset, y: 9 };
      const to = { x: entrance.x + 2, z: entrance.z + offset, y: 9 };
      assert.equal(sourceLastReceptionSegmentClear(from, to), true, `${entrance.id} offset ${offset}`);
    }
  }
  const adjacency = new Map(S.navNodes.map(node => [node.id, []]));
  for (const [a, b] of S.navEdges) { adjacency.get(a).push(b); adjacency.get(b).push(a); }
  const reached = new Set(['mainOutside']), queue = ['mainOutside'];
  while (queue.length) for (const next of adjacency.get(queue.shift())) if (!reached.has(next)) { reached.add(next); queue.push(next); }
  assert.equal(reached.size, S.navNodes.length, 'all rooms and the second exit are freely reachable before the reveal');
});

test('the gallery uses the visible staircase and never grants floating shortcuts', () => {
  const up = sourceReceptionTraceWalk(S.anchors.stairFoot, S.anchors.galleryTop, { radius: .27, validateHeight: true });
  assert.equal(up.ok, true); close(up.floor, 11.8);
  const down = sourceReceptionTraceWalk(S.anchors.galleryTop, S.anchors.stairFoot, { radius: .27, validateHeight: true });
  assert.equal(down.ok, true); close(down.floor, 9.2);
  assert.equal(sourceLastReceptionSegmentClear(S.anchors.gallery, S.anchors.westLoop), false, 'no straight drop through the gallery slab');
  assert.equal(sourceLastReceptionSegmentClear(S.anchors.window, S.anchors.gallery), false, 'ground-floor actors cannot float onto the gallery');
  assert.equal(sourceReceptionSupportAt(-80, -457, { feet: 9 }).floor, 9);
  close(sourceReceptionSupportAt(-80, -457, { feet: 11.8 }).floor, 11.8);
  assert.equal(sourceReceptionCollisionAt(-80, -457, { feet: 9, height: 1.8 }), null, 'walking volume beneath the deck stays clear');
  assert.equal(sourceReceptionCollisionAt(-80, -457, { feet: 10.5, height: 1.8 })?.id, 'gallery-deck');
});

test('resident homes and release are clear; visible walls and furniture stop movement', () => {
  for (const [id, x, y, z] of [
    ['host', -51.4, 9, -449.4], ['guest-a', -65.3, 9, -447.7], ['guest-b', -62, 9, -451.8],
    ['window', -79, 9, -450], ['warning', -61, 9, -457], ['gallery', -80, 11.8, -457],
    ['release', S.anchors.release.x, 9, S.anchors.release.z],
  ]) assert.equal(sourceReceptionCollisionAt(x, z, { feet: y, radius: .27 }), null, id);
  assert.equal(sourceReceptionCollisionAt(-47, -456)?.kind, 'reception-solid');
  assert.equal(sourceReceptionCollisionAt(-83, -453)?.kind, 'reception-solid');
  assert.equal(sourceReceptionCollisionAt(-69.5, -449.8)?.id, 'reception-foyer-sofa');
  assert.equal(sourceReceptionCollisionAt(-64, -460)?.id, 'reception-return-chair');
  assert.equal(S.navNodes.some(node => node.id === 'capture'), false, 'the imprint chair is not a navigation destination');
});

test('conversation sight respects real return-room walls and ordinary open doorways', () => {
  assert.equal(sourceReceptionLineOfSight({ x: -63, y: 9, z: -450 }, { x: -61, y: 9, z: -457 }), false);
  assert.equal(sourceReceptionLineOfSight({ x: -67, y: 9, z: -452 }, { x: -67, y: 9, z: -457 }), true);
  assert.equal(sourceReceptionLineOfSight(S.anchors.serviceRoom, S.anchors.serviceDoor), true);
  assert.equal(sourceReceptionLineOfSight(S.anchors.serviceDoor, S.anchors.serviceOutside), true);
  assert.equal(sourceReceptionLineOfSight({ x: -70, y: 9, z: -450 }, { x: -67, y: 9, z: -450 }), true, 'low sofa does not become a full-height invisible screen');
});

test('native foyer recognition anchors remain at their original scale and real pack identities', () => {
  const placements = sourceReceptionPropPlacements();
  assert.equal(new Set(placements.map(p => p.id)).size, placements.length);
  const sofa = placements.find(p => p.mesh === 'sofa_01');
  assert.equal(sofa.scale, 1.55, 'same authored foyer instance scale');
  assert.equal(placements.filter(p => p.mesh === 'arm_chair_01' && p.y === 9).length, 2);
  assert.equal(placements.find(p => p.mesh === 'ticket_counter').scale, .75, 'same ticket grille as the overworld');
  const assetNames = new Set();
  for (const file of ['conservatory-props.glb', 'conservatory-acquisitions.glb']) {
    const bytes = readFileSync(new URL(`../public/assets/${file}`, import.meta.url));
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8').trim());
    for (const mesh of json.meshes || []) assetNames.add(mesh.name);
  }
  for (const p of placements) {
    assert.ok(assetNames.has(p.mesh), `actual GLB identity ${p.mesh}`);
    assert.ok([p.x, p.y, p.z, p.yaw, p.scale].every(Number.isFinite), p.id);
  }
});

test('rendered geometry contains every physical piece with finite closed and correctly wound hulls', () => {
  const pieces = sourceReceptionGeometry(), solids = sourceReceptionSolids();
  assert.ok(pieces.length <= 8, 'material batching keeps the new room inexpensive to submit');
  assert.deepEqual(pieces.flatMap(p => p.pieces).sort(), solids.map(s => s.id).sort());
  for (const piece of pieces) {
    assert.ok(piece.p.every(Number.isFinite)); assert.equal(piece.i.length % 3, 0);
    const edges = new Map(); let up = 0, down = 0;
    for (let i = 0; i < piece.i.length; i += 3) {
      const triangle = piece.i.slice(i, i + 3);
      const [a, b, c] = triangle.map(index => piece.p.slice(index * 3, index * 3 + 3));
      const u = b.map((v, k) => v - a[k]), v = c.map((n, k) => n - a[k]);
      const normal = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
      assert.ok(Math.hypot(...normal) > 1e-7, piece.id);
      if (normal[1] > .000001) up++; if (normal[1] < -.000001) down++;
      for (let edge = 0; edge < 3; edge++) {
        const key = [triangle[edge], triangle[(edge + 1) % 3]].sort((a, b) => a - b).join(',');
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    assert.ok(up && down, piece.id);
    assert.ok([...edges.values()].every(count => count === 2), `closed ${piece.id}`);
  }
  for (const solid of solids.filter(s => s.support)) {
    const x = (solid.minX + solid.maxX) / 2, z = (solid.minZ + solid.maxZ) / 2;
    close(sourceReceptionSupportAt(x, z, { feet: solid.maxY }).floor, solid.maxY);
  }
});
