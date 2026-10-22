// Metres in the physical yard. Collision, visible treads, placement and the
// logical seam all consume this profile; no mesh-local approximation of it.
const freeze = Object.freeze;
export const LOADING_BAY_ACCESS = freeze({
  yardOrigin: freeze({ x: 50, z: 200 }),
  meshOrigin: freeze({ x: 47.5, z: 7.5 }),
  drop: -.85,
  run: freeze({ x0: 46, x1: 50, steps: 4 }),
  bays: freeze([
    freeze({ id: 'north', z0: 4, z1: 6 }),
    freeze({ id: 'goods', z0: 9, z1: 12 }),
  ]),
});

export function loadingBayStairFloorAt(x, z) {
  const { bays, run, drop } = LOADING_BAY_ACCESS;
  if (x < run.x0 || x >= run.x1 || !bays.some(bay => z >= bay.z0 && z < bay.z1)) return null;
  return drop * (1 - (Math.floor(x) - run.x0 + 1) / (run.steps + 1));
}

export const LOADING_BAY_ACCESS_PORTALS = freeze(LOADING_BAY_ACCESS.bays.map(bay => freeze({
  id: `loading-bay-${bay.id}-steps`, width: bay.z1 - bay.z0,
  from: { at: { x: LOADING_BAY_ACCESS.run.x1, y: bay.z0 }, along: { x: 0, y: 1 }, exit: { x: -1, y: 0 } },
  to: { at: { x: LOADING_BAY_ACCESS.yardOrigin.x + LOADING_BAY_ACCESS.run.x1 - .5,
    y: LOADING_BAY_ACCESS.yardOrigin.z + bay.z0 }, along: { x: 0, y: 1 }, exit: { x: 1, y: 0 } },
})));
