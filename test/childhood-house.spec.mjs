import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_BEDROOM } from '../src/data/childhood-bedroom.js';
import { HOME_HOUSE } from '../src/data/childhood-house.js';

const contains = (bounds, [x, y, z]) => x > bounds.x0 && x < bounds.x1
  && y > bounds.y0 && y < bounds.y1 && z > bounds.z0 && z < bounds.z1;

test('the whole house retains the bedroom window and a buried lower storey', () => {
  const h = HOME_HOUSE, room = HOME_BEDROOM;
  assert.equal(h.z0, room.window.z);
  assert.equal(h.clearPane.x, room.window.x);
  assert.equal(h.clearPane.halfWidth, room.window.halfWidth);
  assert.equal(h.clearPane.bottom, room.window.bottom);
  assert.equal(h.clearPane.top, room.window.top);
  assert.ok(h.bottom <= room.origin.y - 2.6);
  assert.ok(h.eaves > room.origin.y + room.height);
  assert.ok(h.x0 < room.origin.x - room.width / 2);
  assert.ok(h.x1 > room.origin.x + room.width / 2 + 2);
  assert.ok(h.z1 > room.origin.z + room.depth + 2);
});

test('the glazed cut connects to the preserved bedroom volume without a wall between', () => {
  const h = HOME_HOUSE, room = HOME_BEDROOM, pane = h.clearPane, air = h.bedroomVoid;
  assert.ok(pane.z0 < h.z0 && pane.z1 > air.z0);
  assert.ok(air.z0 < room.origin.z);
  assert.ok(air.z1 > room.origin.z + room.depth);
  assert.ok(air.y0 < room.origin.y && air.y1 > room.origin.y + room.height);
  const junctionZ = (air.z0 + pane.z1) / 2;
  for (const x of [pane.x - pane.halfWidth + .001, pane.x, pane.x + pane.halfWidth - .001]) {
    for (const y of [pane.bottom + .001, pane.top - .001]) {
      assert.ok(contains(air, [x, y, junctionZ]), 'the clear pane ends in new solid house geometry');
    }
  }
  for (const furniture of [room.bed, room.desk, room.dresser]) {
    for (const x of [furniture.x0, furniture.x1]) {
      for (const z of [furniture.z0, furniture.z1]) {
        assert.ok(contains(air, [x + room.origin.x, room.origin.y + .5, z + room.origin.z]),
          'the house envelope covers accepted bedroom furniture');
      }
    }
  }
});

test('the chimney rises from the accepted breast through a two-plane roof', () => {
  const h = HOME_HOUSE, room = HOME_BEDROOM;
  assert.ok(h.chimney.x >= room.chimney.x0 && h.chimney.x <= room.chimney.x1);
  assert.ok(h.chimney.z >= room.origin.z + room.chimney.z0
    && h.chimney.z <= room.origin.z + room.chimney.z1);
  const halfDepth = (h.z1 - h.z0) / 2, slope = (h.ridge - h.eaves) / halfDepth;
  const roofAtStack = h.ridge - slope * Math.abs(h.chimney.z - h.roof.ridgeZ);
  assert.ok(h.chimney.top > roofAtStack + .4);
  assert.ok(Math.abs(h.roof.ridgeZ - (h.z0 + h.z1) / 2) < 1e-10);
  assert.ok(h.roof.overhang >= .15 && h.roof.thickness > .05);
});

test('secondary openings lie on real exterior faces and keep the accepted room closed', () => {
  const h = HOME_HOUSE;
  for (const opening of [...h.secondaryWindows, h.lowerDoor]) {
    const axis = ['left', 'right'].includes(opening.face) ? 'x' : 'z';
    const edge = { left: h.x0, right: h.x1, front: h.z0, back: h.z1 }[opening.face];
    assert.equal(opening[axis], edge);
    assert.ok(!contains(h.bedroomVoid, [opening.x, opening.y, opening.z]));
    assert.ok(opening.y - opening.halfHeight >= h.bottom - 1e-10);
    assert.ok(opening.y + opening.halfHeight < h.eaves);
  }
  assert.ok(h.lowerDoor.y + h.lowerDoor.halfHeight < 0);
  assert.ok(h.snowScours.every((scour) => scour.depth > 0 && -scour.depth > h.bottom + 1),
    'even the deepest hollow must leave a metre of the lower storey buried');
  assert.throws(() => { h.secondaryWindows[0].x = 0; }, TypeError);
  assert.throws(() => { h.bedroomVoid.z0 = h.z1; }, TypeError);
});
