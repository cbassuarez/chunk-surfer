// Local metres, +z into the world. These volumes own both the visible pocket
// and its body collision; the distant procedural world is never extra ground.
import { HOME_BEDROOM } from './childhood-bedroom.js';
import { HOME_HOUSE } from './childhood-house.js';
import { HOME_APPROACH_WALLS, HOME_APPROACH_POLES, HOME_APPROACH_TREES, homeApproachRise } from './childhood-grounds.js';
import { HOME_VALLEY_BOUNDS, HOME_VALLEY_SITES, homeValleyRise } from './childhood-valley.js';
import { HOME_COMMONS_STEP_SUPPORTS } from './childhood-valley-works.js';
import { HOME_VALLEY_LIFE_SITES } from './childhood-valley-life.js';
import { HOME_MOUNTAIN_BOUNDS, HOME_MOUNTAIN_SITES, HOME_VALLEY_TREES, homeMountainRise } from './childhood-valley-trail.js';
const box = (id, x0, x1, z0, z1, top = 0, thickness = .4, material = 0) => Object.freeze({
  id, center: Object.freeze([(x0 + x1) / 2, top - thickness / 2, (z0 + z1) / 2]),
  half: Object.freeze([(x1 - x0) / 2, thickness / 2, (z1 - z0) / 2]), material,
});
const solid = (id, x0, x1, z0, z1, height, material = 1) => box(id, x0, x1, z0, z1, height, height, material);
const snowbank = (id, x0, x1, z0, z1, top, crestPhase) => Object.freeze({
  ...box(id, x0, x1, z0, z1, top, top + 3.35, 'snow'),
  renderShape: 'snowbank', topRadius: .48, crestPhase,
});
const entranceSolids = Object.freeze([
  solid('return-jamb-left', -.905, -.735, -.10, .14, 2.4, 'stone'),
  solid('return-jamb-right', .735, .905, -.10, .14, 2.4, 'stone'),
  box('return-head', -.91, .91, -.10, .14, 2.545, .17, 'stone'),
]);
const pocket = (world, variant, steps, supports, solids, extra = {}) => Object.freeze({
  world, variant, version: 1, stepBudget: steps, strideLength: .68, eyeHeight: 1.62,
  spawn: Object.freeze({ x: 0, z: 1 }),
  // Crossing this opening, rather than merely walking near the entrance, returns.
  entrance: Object.freeze({ z: 0, halfWidth: .515 }),
  supports: Object.freeze(supports), solids: Object.freeze([...solids, ...entranceSolids]), ...extra,
});

const valley = HOME_VALLEY_BOUNDS;
const mountain = HOME_MOUNTAIN_BOUNDS;
const timberDeck = HOME_MOUNTAIN_SITES.find(site=>site.id==='timber-rest').pieces.find(piece=>piece.id==='timber-rest-floor');

export const REALM_POCKETS = Object.freeze([
  pocket('burning', 0, 36, [
    box('basalt-entry', -4, 3, -1, 8), box('basalt-bend', 0, 7, 7, 16),
    box('basalt-vantage', 3, 10, 15, 26),
  ], [solid('fallen-pylon', -2.2, -1, 4, 7, 1.3), solid('fracture-lip', 5.8, 7, 9, 12, .65)],
  { reveal: Object.freeze({ x: 5, z: 18 }) }),
  pocket('flood', 1, 38, [
    box('causeway', -2.5, 2.5, -1, 10), box('landing', -2.5, 6, 9, 14),
    box('drowned-steps', 4, 8, 13, 23, -.15),
  ], [solid('broken-pier', -2.4, -1.5, 6, 8, 1.2), solid('drowned-column', 6.8, 7.5, 17, 18, .8)],
  { reveal: Object.freeze({ x: 6, z: 20 }) }),
  pocket('inverted', 2, 36, [
    box('hanging-ledge', -3, 3, -1, 9), box('ledge-hook', 0, 7, 8, 15),
    box('sky-balcony', 4, 9, 14, 25),
  ], [solid('uprooted-pier', -2.5, -1.5, 5, 7, 2.2), solid('hook-fragment', 5.5, 6.8, 10, 12, .8)],
  { reveal: Object.freeze({ x: 6, z: 19 }) }),
  pocket('two-moons', 3, 40, [
    box('buried-road', -5, 5, -1, 12), box('dune-crest', -5, 5, 11, 18, .15),
    box('windless-hollow', -7, 7, 17, 30),
  ], [solid('lamp-one', -3, -2.7, 5, 5.4, 4), solid('lamp-two', 2.8, 3.2, 13, 13.4, 4.7),
    solid('buried-mass', -6.5, -4.5, 20, 25, 1.5)],
  { reveal: Object.freeze({ x: 0, z: 21 }) }),
  pocket('glass-storm', 4, 42, [
    box('obsidian-channel', -3, 3, -1, 10), box('glass-basin', -4, 9, 9, 19),
    box('reflection-passage', 6, 12, 18, 28),
  ], [solid('low-fin', -1.8, -.7, 7, 13, 2.2), solid('glass-bank', 6.5, 8.7, 11, 15, 3.5),
    solid('glass-tooth', 10.5, 11.6, 23, 25, 2.4)],
  { reveal: Object.freeze({ x: 8.5, z: 20 }) }),
  pocket('whiteout', 5, 36, [Object.freeze({ ...box('snow-route', valley.x0, valley.x1, valley.z0, valley.z1, valley.top, valley.top - valley.bottom, 'snow'),
    heightfield: 'home-snow' }),
    Object.freeze({ ...box('mountain-trail', mountain.x0, mountain.x1, mountain.z0, mountain.z1, mountain.top, mountain.top - mountain.bottom, 'snow'),
      heightfield: 'home-snow' }),
    Object.freeze({...box(timberDeck.id,timberDeck.x0,timberDeck.x1,timberDeck.z0,timberDeck.z1,
      timberDeck.y1,timberDeck.y1-timberDeck.y0,'yard-wood'),collisionOnly:true}),
    ...HOME_COMMONS_STEP_SUPPORTS.map(({id,x0,x1,y0,y1,z0,z1})=>Object.freeze({
      ...box(id,x0,x1,z0,z1,y1,y1-y0,'yard-stone'),collisionOnly:true,
    }))], [
    ...HOME_APPROACH_WALLS.map(({ id, x0, x1, z0, z1, base, top, material }) =>
      box(id, x0, x1, z0, z1, top, top - base, material)),
    ...HOME_APPROACH_POLES.map(({ id, x, z, base, top, radius }) => Object.freeze({
      ...box(id, x - radius, x + radius, z - radius, z + radius, top, top - base, 'yard-wood'),
      collisionOnly: true,
    })),
    ...HOME_APPROACH_TREES.map(({ id, x, z, base, height, radius }) => Object.freeze({
      ...box(id, x - radius, x + radius, z - radius, z + radius, base + height, height, 'yard-wood'),
      collisionOnly: true,
    })),
    // The whole closed house stops the body, while both front corners remain
    // reachable. Its rendered walls and aperture belong to the exterior model.
    box('closed-house-body', HOME_HOUSE.x0, HOME_HOUSE.x1, HOME_HOUSE.z0, HOME_HOUSE.z1,
      HOME_HOUSE.eaves, HOME_HOUSE.eaves - HOME_HOUSE.bottom, 'plaster'),
    // The old banks are local drifts. Their ends now open to the rest of the site.
    snowbank('snow-bank-left', -10.8, -7.95, 68, 77.8, 1.38, .7),
    snowbank('snow-bank-right', 8.95, 11.8, 69, 77.8, 1.27, 2.2),
    snowbank('snow-bank-rear', -6.5, 6.7, 80.9, 83.6, 1.45, 4.8),
    ...HOME_VALLEY_TREES.map(({ x, z, y, height, radius }, index) => Object.freeze({
      ...box('forest-trunk-'+index, x-radius, x+radius, z-radius, z+radius, y+height*.83, height*.83+.14, 'yard-wood'),
      collisionOnly: true, radius,
    })),
    ...[...HOME_VALLEY_SITES, ...HOME_VALLEY_LIFE_SITES, ...HOME_MOUNTAIN_SITES].flatMap(site => site.pieces.filter(piece => piece.blocking !== false)
      .map(({ id, x0, x1, y0, y1, z0, z1, material }) => Object.freeze({
        ...box(id, x0, x1, z0, z1, y1, y1 - y0, material), collisionOnly: true,
      }))),
  ], { home: Object.freeze({ wallZ: HOME_HOUSE.z0, foldFrom: 58, foldTo: 66.7,
    window: HOME_BEDROOM.window,
    viewingRadius: 3.3 }), reveal: Object.freeze({ x: 0, z: 20 }) }),
]);

export const stationRealmPocket = (variant) => REALM_POCKETS[Number(variant)] || null;

// Compact, continuously sloped scour hollows leave the central upstairs
// approach exactly level. The same authored kernels are emitted in GLSL;
// no flat support box is allowed to fill the hollows back in.
export function homeSnowHeight(x, z) {
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) return 0;
  let height = 0;
  for (const scour of HOME_HOUSE.snowScours) {
    const dx = (x - scour.x) / scour.radiusX, dz = (z - scour.z) / scour.radiusZ;
    const strength = Math.max(0, 1 - dx * dx - dz * dz);
    height = Math.min(height, -scour.depth * strength * strength);
  }
  return height + homeApproachRise(x, z) + homeValleyRise(x, z) + homeMountainRise(x, z) || 0;
}

export const realmSupportHeight = (support, x, z) => support.heightfield === 'home-snow'
  ? homeSnowHeight(x, z) : support.center[1] + support.half[1];
