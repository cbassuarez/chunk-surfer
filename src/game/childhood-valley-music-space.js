import { HOME_BEDROOM } from '../data/childhood-bedroom.js';
import { HOME_APPROACH_POLES, HOME_APPROACH_TREES, HOME_DRAIN } from '../data/childhood-grounds.js';
import { HOME_VALLEY_BOUNDS } from '../data/childhood-valley.js';
import { HOME_MAUL_BLOCK, HOME_MOUNTAIN_BOUNDS } from '../data/childhood-valley-trail.js';
import { homeSnowHeight, stationRealmPocket } from '../data/realm-pockets.js';
import { stationRealmFloor } from './station-realms.js';

const pocket = stationRealmPocket(5);
const [entryPole, fieldPole] = HOME_APPROACH_POLES;
const [laneTree] = HOME_APPROACH_TREES;
const { window, anchors } = HOME_BEDROOM;
const emitter = (object, x, y, z, reach, reflections) => Object.freeze({
  object, position: Object.freeze([x, y, z]), reach, reflections,
});

// Coordinates are the same metres as the walking pocket. Each origin sits on
// or inside the named construction. It remains in place as the listener turns.
export const HOME_VALLEY_MUSIC_EMITTERS = Object.freeze({
  threshold: emitter(entryPole.id, entryPole.x + .24, 1.52, entryPole.z - .06, 14, .02),
  lane: emitter(laneTree.id, laneTree.x + .23, 1.24, laneTree.z - .08, 12, 0),
  stop: emitter('PostAuto shelter', -28.14, 1.36, 21.58, 14, .07),
  approach: emitter('lane drain', HOME_DRAIN.x - .23, HOME_DRAIN.y + .08, HOME_DRAIN.z, 14, .03),
  commons: emitter('commons store', -17.2, 1.38, 56.68, 17, .09),
  east: emitter('wash house', 25.89, 1.21, 50.92, 17, .08),
  home: emitter('bedroom pane', anchors.lamp.x, anchors.lamp.y + .18, window.z + .68, 15, .09),
  hamlet: emitter('north yard', 19.12, homeSnowHeight(19.12, 93.94) + 1.38, 93.94, 17, .03),
  fork: emitter('hay store uphill apron', -40.31, 8.07, 76.62, 16, .05),
  timber: emitter('woodcutters shelter', HOME_MAUL_BLOCK.x - .65, HOME_MAUL_BLOCK.y + .86, HOME_MAUL_BLOCK.z - .67, 13, .10),
  lookout: emitter('survey marker', -79.86, homeSnowHeight(-79.86, 132.55) + 1.26, 132.55, 14, .01),
  spring: emitter('springhead stone basin', -50.59, homeSnowHeight(-50.59, 114.47) + .77, 114.47, 14, .05),
});
export const HOME_VALLEY_MUSIC_CELLS = Object.freeze(Object.keys(HOME_VALLEY_MUSIC_EMITTERS));

const inside = ({ x0, x1, z0, z1 }, x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
const validPose = pose => Number.isFinite(pose?.x) && Number.isFinite(pose?.z);
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function cellAt(x, z) {
  if (!inside(HOME_VALLEY_BOUNDS, x, z) && !inside(HOME_MOUNTAIN_BOUNDS, x, z)) return null;
  if (x < -39 && z >= 87) {
    if (z >= 122 && x <= -67.5) return 'lookout';
    if (z >= 103 && x + .8 * (z - 108) > -54) return 'spring';
    if (z >= 97 && x <= -52) return 'timber';
    return 'fork';
  }
  if (x <= -23 && z >= 72 && x + .4 * (z - 79) < -22) return 'fork';
  if (z >= 81 || (z >= 71 && x >= 17)) return 'hamlet';
  if (z >= 59 && x >= -11 && x < 17) return 'home';
  if (x >= 11 && z >= 33) return 'east';
  if (x <= -13 && z >= 30) return 'commons';
  if (z >= 31) return 'approach';
  if (x <= -12 && z >= 12) return 'stop';
  return z >= 8 ? 'lane' : 'threshold';
}

// Keep the incumbent near a shared boundary. This applies to either route
// direction and uses the player's position, independent of gaze and activity.
const boundaryOffsets = Object.freeze([
  [-1.4, 0], [1.4, 0], [0, -1.4], [0, 1.4],
  [-.99, -.99], [.99, -.99], [-.99, .99], [.99, .99],
]);
export function homeValleyMusicCell(pose, previousCell) {
  if (!validPose(pose)) return null;
  const { x, z } = pose;
  const candidate = cellAt(x, z);
  if (!candidate || candidate === previousCell || !Object.hasOwn(HOME_VALLEY_MUSIC_EMITTERS, previousCell)) return candidate;
  return boundaryOffsets.some(([dx, dz]) => cellAt(x + dx, z + dz) === previousCell) ? previousCell : candidate;
}

function obstructionDb(box) {
  const { id, material } = box;
  if (id === 'closed-house-body') return 19;
  if (id.endsWith('-closed-envelope')) return 15;
  if (id === 'cheese-store-wall') return 12;
  if (id.startsWith('forest-trunk-') || /pole|tree|post/.test(id)) return 3.5;
  if (/sheet|towel|apron$/.test(id) && material === 61) return 1.5;
  if (material === 'snow') return 8;
  if (material === 51 || material === 70 || /stop-(back|north-windbreak)/.test(id)) return 9;
  return 11;
}

const obstructions = pocket.solids.map(box => ({
  id: box.id,
  low: box.center.map((coordinate, axis) => coordinate - box.half[axis]),
  high: box.center.map((coordinate, axis) => coordinate + box.half[axis]),
  loss: obstructionDb(box),
}));

// Thickness along the actual sound ray through a blocking volume. A grazing
// hit carries less attenuation than a wall crossed head on.
function intersection(box, start, delta) {
  let near = .007, far = .998;
  for (let axis = 0; axis < 3; axis += 1) {
    const direction = delta[axis], origin = start[axis];
    if (Math.abs(direction) < .00001) {
      if (origin < box.low[axis] || origin > box.high[axis]) return 0;
      continue;
    }
    const a = (box.low[axis] - origin) / direction;
    const b = (box.high[axis] - origin) / direction;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (far <= near) return 0;
  }
  return far - near;
}

function entersClosedPane(start, delta) {
  if (start[2] >= window.z || delta[2] <= 0) return false;
  const t = (window.z - start[2]) / delta[2];
  if (t >= 1) return false;
  const x = start[0] + delta[0] * t;
  const y = start[1] + delta[1] * t;
  return Math.abs(x - window.x) < window.halfWidth && y > window.bottom && y < window.top;
}

function rayOcclusion(cell, start, delta, distance) {
  let wall = 0, secondary = 0, burial = 0;
  for (const box of obstructions) {
    const depth = intersection(box, start, delta) * distance;
    if (depth <= .018) continue;
    const fullLoss = box.id === 'closed-house-body' && cell === 'home' && entersClosedPane(start, delta)
      ? 5.5 : box.loss;
    const loss = fullLoss * Math.min(1, depth / .18);
    if (loss > wall) { secondary = wall; wall = loss; }
    else secondary = Math.max(secondary, loss);
  }
  // The procedural drift and hill support are the visible terrain too. Test
  // more of the ray when the origin is far away, bounded to 26 height queries.
  const steps = Math.max(5, Math.min(27, Math.ceil(distance / 1.4)));
  for (let index = 1; index < steps; index += 1) {
    const t = index / steps;
    const x = start[0] + delta[0] * t, z = start[2] + delta[2] * t;
    burial = Math.max(burial, homeSnowHeight(x, z) - (start[1] + delta[1] * t));
  }
  const groundLoss = clamp((burial - .06) * 17, 0, 22);
  return Math.min(37, wall + .25 * secondary + groundLoss);
}

export function homeValleyMusicSpace(cell, pose) {
  if (!validPose(pose) || !Object.hasOwn(HOME_VALLEY_MUSIC_EMITTERS, cell)) return null;
  const { x, z, yaw } = pose;
  const floor = Number.isFinite(pose.floorY) ? pose.floorY : stationRealmFloor(pocket.variant, x, z);
  if (floor == null) return null;
  const source = HOME_VALLEY_MUSIC_EMITTERS[cell];
  const start = [x, floor + finite(pose.eyeHeight, pocket.eyeHeight), z];
  const delta = source.position.map((coordinate, axis) => coordinate - start[axis]);
  const distance = Math.hypot(...delta);
  const bearing = Math.atan2(delta[0], delta[2]) - finite(yaw, 0);
  const rear = Math.max(0, -Math.cos(bearing));
  const loss = rayOcclusion(cell, start, delta, distance);
  const direct = 1 / (1 + (distance / source.reach) ** 1.65);
  return {
    object: source.object,
    position: source.position,
    distance,
    occlusionDb: loss,
    gain: direct * 10 ** (-loss / 20) * (1 - .10 * rear),
    lowpassHz: clamp((10500 - Math.min(3800, distance * 85)) * 10 ** (-loss / 23) * (1 - .22 * rear), 270, 10500),
    wet: clamp(.13 + source.reflections + distance * .007 + loss * .009, .13, .65),
    pan: Math.sin(bearing) * .88,
  };
}
