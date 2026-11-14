// THE CRASH, AS TYRES ON WATER. The last left-hander before the break carries
// standing water, deepest on the seaward side where the crossfall drains it.
// Nothing takes the controls: every input still goes through the van's own
// tyre model (vehicle-dynamics.js), and the water decides what an input can do.
//
//   - At speed a water film lifts the tyres, fronts first (they plough it; the
//     rears run in the cleared track), so the wheel turns and the van keeps
//     going straight: off the outside of a left-hander is over the break.
//   - Braking spends the little grip left on the film and locks the wheels.
//     Throttle spins the rears and steps them out. Steering lock still applied
//     when the tyres touch down again snaps the van round.
//   - The deeper water drags the seaward tyres harder, so the van yaws toward it.
//   - Across the break the water lies over a slick wash that drains to the sea.
//     Its grip is below the crossfall at any speed, so a van crawling round the
//     inside still slides out. The crash is certain; the input only decides how.
//
// Seb, 2026-11-14: "the something that you are doing just determines how
// fucked you are, not if you make it through the crash or not."

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };

export const DRIVE_HYDROPLANE = Object.freeze({
  // Road distances on the cliff road: the water gathers on the climb into the
  // last left-hander and lies across the break (DRIVE_TEASER_BREAK 291-309).
  from: 270, full: 284, to: 314,
  // Millimetres of standing water from the landward edge to the seaward edge.
  landward: 2.5, seaward: 10,
  // Wet asphalt under the film, before any of it lifts.
  wetGrip: .46,
  // A 5 mm film starts lifting a tyre at this speed (m/s), and has lifted it
  // fully this many m/s later. Deeper water lifts it sooner (onset ∝ 1/√depth).
  onset: 8.5, complete: 6,
  // How much of the lift each axle feels: the rears run in the fronts' track.
  frontShare: 1, rearShare: .6,
  // The most grip a fully lifted tyre keeps.
  liftedGrip: .07,
  // A tyre's water drag: ½·ρ·Cd·(tread width·depth), in N per (m/s)².
  waterDensity: 1000, dragCoefficient: .9, treadWidth: .205,
  // The slick wash across the break: grip at any speed, and the seaward
  // crossfall (tan of the angle) that grip cannot match. It lies where the
  // drop comes right up to the road (298-309); before that a berm rises
  // between the road and the edge and would stop a slow van.
  wash: Object.freeze({ from: 294, to: 311, grip: .1, crossfall: .19, ramp: 4 }),
});

const H = DRIVE_HYDROPLANE;

// Standing water at a point on the road, in millimetres, across the road's
// own width (the cliff road is single-track here, ±1.67 m).
export function hydroplaneDepth(distance, offset, halfWidth = 1.67) {
  if (!(distance > H.from) || distance > H.to) return 0;
  const along = smooth((distance - H.from) / (H.full - H.from)) * (1 - smooth((distance - (H.to - 4)) / 4));
  const across = smooth((offset + halfWidth) / (2 * halfWidth));
  return along * (H.landward + (H.seaward - H.landward) * across);
}

// How far the film has lifted a tyre at this speed and depth (0 to 1).
export function hydroplaneLift(speed, depthMm) {
  if (!(depthMm > .2)) return 0;
  const onset = H.onset * Math.sqrt(5 / depthMm);
  return smooth((Math.abs(speed) - onset) / H.complete);
}

// The wash's share at this distance: 0 off it, 1 fully on it.
export function hydroplaneWash(distance) {
  const w = H.wash;
  return smooth((distance - w.from) / w.ramp) * (1 - smooth((distance - (w.to - w.ramp)) / w.ramp));
}

// One road sample under one tyre (or the van's centre), with the water's
// effect on grip and drag, and the wash's crossfall. A sample off the water
// comes back unchanged; one off the edge comes back with no grip.
export function hydroplaneSurface(road, { speed = 0, axle = 'rear' } = {}) {
  if (!road) return road;
  // A wheel hanging over the drop has nothing under it to grip.
  if (road.unsupported) return { ...road, grip: 0 };
  const depth = hydroplaneDepth(road.distance, road.offset ?? 0, road.halfWidth || 1.67), wash = hydroplaneWash(road.distance);
  if (!(depth > 0) && !(wash > 0)) return road;
  const lift = hydroplaneLift(speed, depth) * (axle === 'front' ? H.frontShare : H.rearShare);
  let grip = Math.min(road.grip ?? .68, H.wetGrip + (1 - smooth(depth / 2)) * ((road.grip ?? .68) - H.wetGrip));
  grip = grip * (1 - lift) + H.liftedGrip * lift;
  grip = grip * (1 - wash) + Math.min(grip, H.wash.grip) * wash;
  const drag = .5 * H.waterDensity * H.dragCoefficient * H.treadWidth * depth / 1000;
  return { ...road, grip, drag, crossfall: H.wash.crossfall * wash, waterDepth: depth, aquaplane: lift, kind: road.kind === 'asphalt' && depth > 1 ? 'water' : road.kind };
}

// A road sampler for one physics step of this van. A sample ahead of the van's
// centre is under a front tyre; anything else is a rear tyre or the centre.
export function hydroplaneSampler(base, vehicle) {
  const speed = vehicle.speed, fx = Math.sin(vehicle.heading), fz = -Math.cos(vehicle.heading), x0 = vehicle.x, z0 = vehicle.z;
  return (x, z) => hydroplaneSurface(base(x, z), { speed, axle: (x - x0) * fx + (z - z0) * fz > .2 ? 'front' : 'rear' });
}

// How bad the departure is, from the van's state as it leaves the edge: its
// kinetic energy, translational and about its own vertical axis, against a
// van going straight off at 15 m/s.
export function departureSeverity({ speed = 0, lateralSpeed = 0, yawRate = 0 } = {}, { mass = 2350, yawInertia = 3700 } = {}) {
  const translational = .5 * mass * (speed * speed + lateralSpeed * lateralSpeed);
  const rotational = .5 * yawInertia * yawRate * yawRate;
  return (translational + rotational) / (.5 * mass * 15 * 15);
}
