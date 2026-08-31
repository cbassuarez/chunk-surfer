// The van's two rear leaves, as geometry.
//
// They used to be baked into the van mesh at a fixed hundred-degree swing. That
// is the pose the opening is staged on — it is what makes the silhouette read
// as "somebody is unloading" from the gate — and it is the wrong thing for the
// body to own, because the player is asked to shut the van before walking away
// from it and a door baked into a vehicle cannot shut.
//
// Everything here is pure. main.js owns when the swing starts, what it sounds
// like and what happens to the interior lamp; this owns where the leaves are.

// `swing` is the angle between shut and the staged open pose. `hinge` is the
// van-local x of each hinge and also the length of a leaf, so the two shut
// leaves meet exactly on the centreline. `z` puts the hinge line just proud of
// the body end (2.45), and `base` is where the bottom of a leaf sits — just
// above the load floor, the same as the leaves it replaced.
export const VAN_DOOR = Object.freeze({
  swing: 1.70,
  closeMs: 1500,
  hinge: 0.90,
  z: 2.47,
  base: 0.64,
});

// 1 is wide open, 0 is shut.
//
// Smooth at both ends: the swing is a push, not a throw, and a leaf that
// arrives at full speed reads as a glitch in a renderer with no motion blur.
export function vanDoorOpenFraction(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 1;
  const t = Math.min(1, elapsedMs / VAN_DOOR.closeMs);
  return 1 - t * t * (3 - 2 * t);
}

// The two leaves, in world metres, ready to be handed to the prop renderer.
//
// The prop matrix takes local +x to (cos yaw, 0, sin yaw) and local +z to
// (-sin yaw, 0, cos yaw), so a leaf's world pose is the van's pose composed with
// the leaf's own angle: the hinge point rotated into the world, and the two yaws
// added. Shut is 0 for the left leaf and PI for the right, because the right one
// closes by turning back across the middle — which is also why its mesh carries
// its outer skin on the other side.
export function vanDoorLeafPoses({ x = 0, y = 0, z = 0, yaw = 0, open = 1 } = {}) {
  const c = Math.cos(yaw), n = Math.sin(yaw);
  const f = Math.max(0, Math.min(1, Number(open) || 0));
  return [['l', -1, 0, 1], ['r', 1, Math.PI, -1]].map(([side, sx, shut, turn]) => {
    const hx = sx * VAN_DOOR.hinge, hz = VAN_DOOR.z;
    return Object.freeze({
      side,
      mesh: `yard_van_door_${side}`,
      x: x + c * hx - n * hz,
      y: y + VAN_DOOR.base,
      z: z + n * hx + c * hz,
      yaw: yaw + shut + turn * f * VAN_DOOR.swing,
    });
  });
}

// Where a leaf's free edge is, which is the only thing worth asserting about the
// pose: shut, the two edges meet; open, they are back against the van's sides.
export function vanDoorFreeEdge(pose) {
  return Object.freeze({
    x: pose.x + Math.cos(pose.yaw) * VAN_DOOR.hinge,
    z: pose.z + Math.sin(pose.yaw) * VAN_DOOR.hinge,
  });
}
