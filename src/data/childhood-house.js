// Metres in the whiteout. The upstairs room keeps its ordinary dimensions,
// although the level snow walk reaches its window and hides most of a storey.
import { HOME_BEDROOM } from './childhood-bedroom.js';

const freeze = (value) => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const HOME_HOUSE = freeze({
  x0: -2.2, x1: 5.4, z0: 70, z1: 77.4,
  bottom: -2.8, eaves: 2.72, ridge: 4.55,
  roof: { overhang: .24, thickness: .12, ridgeZ: 73.7 },
  // This void contains the accepted bedroom's own shell as well as its air.
  // The exterior mass must never paint over those walls, furniture or joinery.
  bedroomVoid: {
    x0: HOME_BEDROOM.origin.x - HOME_BEDROOM.width / 2 - .11,
    x1: HOME_BEDROOM.origin.x + HOME_BEDROOM.width / 2 + .11,
    y0: HOME_BEDROOM.origin.y - .10,
    y1: HOME_BEDROOM.origin.y + HOME_BEDROOM.height + .12,
    z0: HOME_BEDROOM.origin.z - .001,
    z1: HOME_BEDROOM.origin.z + HOME_BEDROOM.depth + .16,
  },
  // Cut from the outer face into the bedroom void. The bedroom owns the deep
  // reveal and frames; the exterior adds only the projecting stone sill.
  clearPane: { ...HOME_BEDROOM.window, z0: 69.88, z1: 70.56 },
  chimney: { x: 1.65, z: 71.93, halfX: .28, halfZ: .34, top: 4.48 },
  secondaryWindows: [
    { id: 'upper-front', face: 'front', x: 3.45, y: 1.48, z: 70, halfWidth: .58, halfHeight: .66 },
    { id: 'upper-left', face: 'left', x: -2.2, y: 1.43, z: 75.52, halfWidth: .48, halfHeight: .62 },
    { id: 'upper-right', face: 'right', x: 5.4, y: 1.44, z: 72.18, halfWidth: .52, halfHeight: .64 },
    { id: 'lower-left', face: 'left', x: -2.2, y: -1.38, z: 72.0, halfWidth: .57, halfHeight: .66 },
    { id: 'upper-back', face: 'back', x: .68, y: 1.47, z: 77.4, halfWidth: .54, halfHeight: .63 },
  ],
  lowerDoor: { face: 'right', x: 5.4, y: -1.775, z: 73.45, halfWidth: .43, halfHeight: 1.025 },
  snowScours: [
    { id: 'left-corner', x: -3.2, z: 71.35, radiusX: 2.8, radiusZ: 3.65, depth: 1.45 },
    { id: 'right-side', x: 6.4, z: 73.10, radiusX: 2.9, radiusZ: 4.45, depth: 1.35 },
  ],
});
