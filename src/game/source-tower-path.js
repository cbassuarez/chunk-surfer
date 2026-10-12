// A path the bust reveals, in landscape-local cells. The visual ribbon and
// collision permission sample the same polyline; accepting never moves a body.
import { SOURCE_HORIZON, SOURCE_BELLS } from '../data/source-level.js';

export const SOURCE_TOWER_PATH_HALF_WIDTH = 6;
export function sourceTowerPath(bustLateral = -9) {
  return [
    // Begin on the near side: the first visible leg must go around the solid
    // pedestal, not ask the player to walk through it to find the road.
    { x: bustLateral + 7, y: SOURCE_HORIZON.from - 158 },
    { x: -76, y: SOURCE_HORIZON.from - 190 },
    { x: -76, y: SOURCE_HORIZON.from - 430 },
    { x: 0, y: SOURCE_BELLS.from - 4 },
  ];
}
export function sourceTowerPathDistance(x, y, points = sourceTowerPath()) {
  let distance = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
    distance = Math.min(distance, Math.hypot(x-a.x-dx*t, y-a.y-dy*t));
  }
  return distance;
}
