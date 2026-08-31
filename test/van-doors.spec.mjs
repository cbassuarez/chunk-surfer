import assert from 'node:assert/strict';

import { VAN_DOOR, vanDoorFreeEdge, vanDoorLeafPoses, vanDoorOpenFraction } from '../src/game/van-doors.js';

// ── THE SWING ────────────────────────────────────────────────────────────────
//
// The doors were baked into the van mesh at a fixed hundred-degree swing, so the
// player was asked to walk away from an open vehicle in the rain with the
// interior light on. They shut now, and the shutting is the thing that has to be
// watched rather than asserted — but the two ends of it, and the fact that there
// is a middle at all, belong here.
assert.equal(vanDoorOpenFraction(0), 1, 'nothing has happened yet');
assert.equal(vanDoorOpenFraction(-50), 1, 'a clock that has not started reads as open');
assert.equal(vanDoorOpenFraction(VAN_DOOR.closeMs), 0, 'it lands exactly shut');
assert.equal(vanDoorOpenFraction(VAN_DOOR.closeMs * 4), 0, 'and stays shut');
{
  // Monotonic, and genuinely in between: a swing that snapped from 1 to 0 would
  // pass both ends above and be exactly the bug this replaced.
  let previous = 1, sampled = 0;
  for (let ms = 0; ms <= VAN_DOOR.closeMs; ms += 50) {
    const open = vanDoorOpenFraction(ms);
    assert.ok(open <= previous + 1e-9, `the swing goes back on itself at ${ms}ms`);
    if (open > 0.02 && open < 0.98) sampled += 1;
    previous = open;
  }
  assert.ok(sampled >= 20, `the swing has ${sampled} intermediate frames and needs to be watchable`);
  assert.ok(vanDoorOpenFraction(VAN_DOOR.closeMs / 2) > 0.4 && vanDoorOpenFraction(VAN_DOOR.closeMs / 2) < 0.6,
    'halfway through the swing the doors are halfway shut');
}

// ── THE POSE ─────────────────────────────────────────────────────────────────
//
// Measured through the free edge of each leaf, because that is the only part of
// the pose anybody can see is wrong.
const at = (open, yaw = 0) => vanDoorLeafPoses({ x: 0, y: 0, z: 0, yaw, open }).map(vanDoorFreeEdge);

{
  const [left, right] = at(0);
  // Shut, the two edges meet on the centreline. A leaf length that does not
  // match its hinge offset leaves a gap down the back of the van, or overlaps.
  assert.ok(Math.hypot(left.x - right.x, left.z - right.z) < 1e-9, 'the shut leaves do not meet');
  assert.ok(Math.abs(left.x) < 1e-9, 'they meet off the centreline');
  assert.ok(Math.abs(left.z - VAN_DOOR.z) < 1e-9, 'the shut leaves are not in the plane of the aperture');
}
{
  const [left, right] = at(1);
  // Open, they are swung back level with the van's sides and well behind the
  // body end — the pose the opening is staged on, and the one the gate reads as
  // somebody unloading.
  assert.ok(left.x < -VAN_DOOR.hinge && right.x > VAN_DOOR.hinge, 'the open leaves are not swung outboard');
  assert.ok(Math.abs(left.x + right.x) < 1e-9, 'the open pose is not symmetric');
  assert.ok(left.z > VAN_DOOR.z + 0.8, 'the open leaves do not stand clear of the aperture');
  assert.ok(left.z < VAN_DOOR.z + VAN_DOOR.hinge + 0.01, 'a leaf cannot reach further back than its own length');
}
{
  // The leaves never swing INTO the load space, at any point in the travel.
  for (let f = 0; f <= 1.0001; f += 0.05) {
    for (const edge of at(f)) {
      assert.ok(edge.z >= VAN_DOOR.z - 1e-9, `a leaf swings into the van at open=${f.toFixed(2)}`);
    }
  }
}
{
  // The van is parked nose-in and its doors face west, so the whole pose has to
  // ride the prop's yaw. Turning the van a right angle turns the leaves with it.
  const [left] = at(0, Math.PI / 2);
  assert.ok(Math.abs(left.x + VAN_DOOR.z) < 1e-9 && Math.abs(left.z) < 1e-9,
    'the leaves do not follow the van when it is turned');
}
{
  // The meshes are per side because the right leaf shuts by turning back across
  // the middle, which puts its outer skin on the other face.
  const [left, right] = vanDoorLeafPoses({ open: 1 });
  assert.equal(left.mesh, 'yard_van_door_l');
  assert.equal(right.mesh, 'yard_van_door_r');
}

console.log('van door tests ok');
