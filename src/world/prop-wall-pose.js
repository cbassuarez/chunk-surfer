// Wall contact defines a room-facing +Z normal. Meshes can explicitly name a
// different local front without changing that convention for other fixtures.
import { snapToWall } from './wall-contact.js';

const FRONTS = Object.freeze({
  '+z': { axis: 2, sign: 1, yaw: 0 },
  '-z': { axis: 2, sign: -1, yaw: Math.PI },
  '+x': { axis: 0, sign: 1, yaw: Math.PI / 2 },
  '-x': { axis: 0, sign: -1, yaw: -Math.PI / 2 },
});

export function propWallPose(prop, bounds, contact) {
  const frontAxis = prop.frontAxis ?? '+z';
  const front = FRONTS[frontAxis];
  if (!front) throw new RangeError(`prop ${prop.id || prop.mesh}: invalid frontAxis ${frontAxis}`);
  // P3's axis scales multiply its uniform scale; they do not replace it.
  const scale = ((front.axis === 0 ? prop.scaleX : prop.scaleZ) ?? 1) * (prop.scale || 1);
  // The rear is opposite the declared front. A -Z plate's rear is max Z,
  // whereas the usual +Z wall fixture's rear is min Z. Do not use total depth.
  const backExtent = bounds
    ? Math.max(0, front.sign > 0 ? -bounds.min[front.axis] : bounds.max[front.axis]) * Math.abs(scale)
    : 0;
  const pose = snapToWall(contact, { halfDepth: backExtent });
  let yaw = pose.yaw + front.yaw + (scale < 0 ? Math.PI : 0);
  while (yaw > Math.PI) yaw -= Math.PI * 2;
  while (yaw < -Math.PI) yaw += Math.PI * 2;
  return { ...pose, yaw, frontAxis, backExtent };
}
