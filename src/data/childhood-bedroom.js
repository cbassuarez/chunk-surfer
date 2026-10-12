// Metres in the whiteout pocket. The player stays outside the glazed plane.
// The room's front interior face sits one wall thickness behind that plane.
export const HOME_COMFORT_LOOP_SECONDS = 12.8;
export const homeComfortPhase = (time = 0) => {
  const seconds = Number(time);
  if (!Number.isFinite(seconds)) return 0;
  return ((seconds % HOME_COMFORT_LOOP_SECONDS) + HOME_COMFORT_LOOP_SECONDS) % HOME_COMFORT_LOOP_SECONDS;
};

const point = (x, y, z) => Object.freeze({ x, y, z });
export const HOME_BEDROOM = Object.freeze({
  origin: point(0, 0, 70.28),
  width: 3.6, depth: 4.25, height: 2.55, wallDepth: .28,
  window: Object.freeze({ x: -.18, z: 70, bottom: .78, top: 2.20, halfWidth: .89 }),
  chimney: Object.freeze({ x0: 1.50, x1: 1.80, z0: 1.05, z1: 2.25 }),
  bed: Object.freeze({ x0: -1.70, x1: -.73, z0: 2.20, z1: 4.25 }),
  desk: Object.freeze({ x0: -.45, x1: .80, z0: 3.63, z1: 4.25 }),
  door: Object.freeze({ wallX: 1.8, z0: 3.35, z1: 4.17, height: 2.04 }),
  dresser: Object.freeze({ x0: 1.23, x1: 1.79, z0: 2.39, z1: 3.19, height: .91 }),
  anchors: Object.freeze({
    window: point(-.18, 1.49, 70),
    clock: point(-.12, 2.02, 74.49),
    radiator: point(-1.62, .56, 71.59),
    curtain: point(-1.21, 1.50, 70.51),
    lamp: point(-.52, 1.35, 74.19),
  }),
});
