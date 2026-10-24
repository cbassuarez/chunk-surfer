// The same right-hand-drive cabin authored for the Source driving scene.
// All positions are in metres, with the cabin 1.6m ahead of the body origin.
export const OPENING_VEHICLE = Object.freeze({
  asset: 'assets/source-vehicle-interior.glb',
  sourceSha256: '59155ba454894283e68ecde1d976996b326221a98930d164a77dd8ab7aab8316',
  cabinMount: Object.freeze([0, 0, -.45]),
  wheels: Object.freeze({ front: -1.3, rear: 1.535, track: 1.66, radius: .33 }),
  bodyBox: Object.freeze({ min: Object.freeze([-.985,0,-2.272]), max: Object.freeze([.985,2.024,2.546]) }),
  eye: Object.freeze([.48, 1.65, .20]),
  exitEye: Object.freeze([1.8,1.62,-.1]),
  doorHinge: Object.freeze([.945,.64,-.62]),
  exitSeconds: 1.85,
});
const clamp = n => Math.max(0, Math.min(1, Number(n) || 0));
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
const rotation = (yaw = 0, pitch = 0, roll = 0) => {
  const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  return [c*cr-s*sp*sr,cp*sr,s*cr+c*sp*sr,0,-c*sr-s*sp*cr,cp*cr,-s*sr+c*sp*cr,0,-s*cp,-sp,c*cp,0,0,0,0,1];
};
export function openingVehiclePoint(anchor, local, cabin = true) {
  const [x, y, rawZ] = local, z = rawZ + (cabin ? OPENING_VEHICLE.cabinMount[2] : 0);
  const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
  return { x: anchor.x + c*x-s*z, y: anchor.y+y, z: anchor.z+s*x+c*z };
}
export function openingVehicleInstances(anchor, { doorOpen = 0 } = {}) {
  if (!anchor) return [];
  const instances = [];
  function part(mesh, at = [0, 0, 0], pitch = 0, roll = 0, cabin = true, id = mesh, extraYaw = 0) {
    const point = openingVehiclePoint(anchor, at, cabin), matrix = rotation(anchor.yaw + extraYaw, pitch, roll);
    matrix[12] = point.x; matrix[13] = point.y; matrix[14] = point.z;
    instances.push({ id: `opening:${id}`, mesh:`opening_${mesh}`, matrix, ...point, structural: true, zone: anchor.zone, cullRadius: 4 });
  }
  part('drive_cabin'); part('drive_radio');
  part('drive_wheel', [.48, 1.20, -.39], -.36);
  part('drive_speed_needle', [.575,1.207,-.626], 0, .72*Math.PI);
  part('drive_radio_needle', [-.0422, 1.11344, -.396]);
  part('drive_wiper', [-.52, 1.30, -1.17], .435, -1.42, true, 'wiper-left');
  part('drive_wiper', [.45, 1.30, -1.17], .435, 1.42, true, 'wiper-right');
  part('drive_vehicle_body', [0, 0, 0], 0, 0, false);
  instances[instances.length - 1].cabinVolume = OPENING_VEHICLE.bodyBox;
  const wheels = OPENING_VEHICLE.wheels;
  for (const side of [-1, 1]) for (const axle of [wheels.front, wheels.rear])
    part('drive_tyre', [side*wheels.track/2, wheels.radius, axle], 0, 0, false, `tyre-${side}-${axle}`);
  // The detached geometry keeps its original cabin coordinates. Rotate around
  // the real forward edge rather than around the vehicle centre.
  const angle = -clamp(doorOpen)*1.18, hinge = OPENING_VEHICLE.doorHinge;
  const pivot = openingVehiclePoint(anchor, hinge), matrix = rotation(anchor.yaw + angle);
  matrix[12] = pivot.x-matrix[0]*hinge[0]-matrix[8]*hinge[2];
  matrix[13] = anchor.y;
  matrix[14] = pivot.z-matrix[2]*hinge[0]-matrix[10]*hinge[2];
  instances.push({ id: 'opening:driver-door', mesh: 'opening_drive_cabin_door_r', matrix,
    x: pivot.x, y: anchor.y, z: pivot.z, structural: true, zone: anchor.zone, cullRadius: 2 });
  return instances;
}
export function openingVehicleExitFrame(anchor, elapsed = 0, { reducedMotion = false, startYaw = anchor?.yaw || 0 } = {}) {
  const t = clamp(elapsed / OPENING_VEHICLE.exitSeconds), doorOpen = smooth(t/.32), step = smooth((t-.28)/.55);
  const eye = OPENING_VEHICLE.eye.map((n, i) => n+(OPENING_VEHICLE.exitEye[i]-n)*step);
  eye[1] += reducedMotion ? 0 : Math.sin(step*Math.PI)*.24;
  const targetYaw = anchor.yaw + Math.PI*.80, turn = Math.atan2(Math.sin(targetYaw-startYaw), Math.cos(targetYaw-startYaw));
  return { progress: t, doorOpen, eye: openingVehiclePoint(anchor, eye),
    yaw: startYaw+turn*smooth((t-.12)/.76), pitch: -.04-(reducedMotion?0:Math.sin(step*Math.PI)*.11),
    fade: smooth((t-.84)/.16), done: t >= 1 };
}
export function openingVehiclePending(save = {}, { debugSpawn = false, skipTutorial = false } = {}) {
  return !debugSpawn && !skipTutorial && save.flags?.['opening.vehicle.pending'] === true
    && !save.flags?.['opening.vehicle.exited'] && !save.flags?.['prologueDone'];
}
