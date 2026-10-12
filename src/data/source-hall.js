// HELD BREATH. The hall is an ordinary piece of the building whose repeated
// relationships fail, before Source proper changes what a building can be.
//
// All placement coordinates in this module are METRES: x across the hall,
// y elevation, z negative into it. They can be passed directly to sourceMatrix.
// Progress, clocks and camera state never participate in an object's address.

export const SOURCE_HALL = Object.freeze({
  lengthMetres: 112,
  widthMetres: 6,
  ceilingMetres: 4.5,
  targetSeconds: 50,
  cellMetres: 0.5,
  centralClearHalfWidth: 0.9,
  stillPatchRadius: 1.1,
  maxPracticalLights: 4,
});

export const SOURCE_HALL_REGIMES = Object.freeze([
  Object.freeze({ id: 'dry', from: 0, to: 22, stage: 0 }),
  Object.freeze({ id: 'form', from: 22, to: 48, stage: 1 }),
  Object.freeze({ id: 'rain', from: 48, to: 78, stage: 2 }),
  Object.freeze({ id: 'bracket', from: 78, to: 100, stage: 3 }),
  Object.freeze({ id: 'stillness', from: 100, to: 112, stage: 4 }),
]);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, finite(value)));
const positive = (value, fallback) => finite(value) > 0 ? finite(value) : fallback;

export function sourceHallRegime(distanceMetres = 0) {
  const depth = clamp(distanceMetres, 0, SOURCE_HALL.lengthMetres);
  return SOURCE_HALL_REGIMES.find((regime) => depth < regime.to) || SOURCE_HALL_REGIMES.at(-1);
}

// This stage belongs to a physical address, not to how far the reader has been.
export function sourceHallDocumentStage(distanceMetres = 0) {
  return sourceHallRegime(distanceMetres).stage;
}

export function sourceHallCellIntervalMs(cellMetres = SOURCE_HALL.cellMetres) {
  return SOURCE_HALL.targetSeconds * 1000
    * positive(cellMetres, SOURCE_HALL.cellMetres) / SOURCE_HALL.lengthMetres;
}

export function sourceHallPaceMultiplier(baseMoveMs, cellMetres = SOURCE_HALL.cellMetres) {
  return sourceHallCellIntervalMs(cellMetres) / positive(baseMoveMs, 45);
}

function hash32(value) {
  let x = value | 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

const random = (seed, index, salt) => hash32((seed | 0) ^ Math.imul(index + 1, 1597334677) ^ salt) / 4294967295;

export function sourceHallStillPage(seed = 4417, slot = null) {
  const address = slot == null ? (seed >>> 0) % 12 : ((Math.floor(finite(slot)) % 12) + 12) % 12;
  const depthMetres = [108, 104, 100][Math.floor(address / 4)];
  return {
    id: 'source-page', slot: address,
    x: -2.25 + (address % 4) * 1.5,
    y: 0.026, z: -depthMetres, depthMetres,
    documentStage: 4,
  };
}

export function sourceHallInStillPatch(x, z, { seed = 4417, slot = null, margin = 0 } = {}) {
  const page = sourceHallStillPage(seed, slot);
  return Math.hypot(finite(x) - page.x, finite(z) - page.z)
    <= SOURCE_HALL.stillPatchRadius + Math.max(0, finite(margin));
}

export const SOURCE_HALL_SHEET_COUNT = 960;

export function sourceHallSheet(seed = 4417, index = 0, { slot = null } = {}) {
  const i = Math.floor(finite(index, -1));
  if (i < 0 || i >= SOURCE_HALL_SHEET_COUNT) return null;
  if (i === 0) return {
    id: 'source-sheet-0', index: 0, mesh: 'loose_note',
    x: 0, y: 0.018, z: -12, depthMetres: 12,
    pitch: 0, yaw: 0.06, roll: 0,
    scaleX: 1.05, scaleY: 1.05, scaleZ: 1.05,
    surface: 'floor', readable: true, documentStage: 0,
  };
  const a = random(seed, i, 101), b = random(seed, i, 211), c = random(seed, i, 307);
  // The first twelve metres belong to one unmistakable form. Repetition begins
  // at 22m. The last sheets may occupy the visual continuation, but not acquire
  // an interaction there; this does not extend the physical floor.
  const depthMetres = 22 + a * 102;
  const family = i % 5;
  const floor = family >= 3;
  let x = (b - 0.5) * 5.16;
  let y = 0.018, pitch = 0, yaw = c * Math.PI * 2, roll = (a - 0.5) * 0.16;
  let surface = 'floor';
  if (family < 2) {
    x = family === 0 ? -2.94 : 2.94;
    y = 0.35 + b * 3.6;
    pitch = Math.PI / 2;
    yaw = family === 0 ? Math.PI / 2 : -Math.PI / 2;
    roll = (c - 0.5) * 0.45;
    surface = 'wall';
  } else if (family === 2) {
    y = SOURCE_HALL.ceilingMetres - 0.08;
    pitch = Math.PI;
    roll = 0;
    surface = 'ceiling';
  }
  // Include the whole loose_note footprint (.21m at 1.05 scale), not only its
  // centre. Rejected IDs stay rejected; advancing never relocates a sheet.
  if (floor && sourceHallInStillPatch(x, -depthMetres, { seed, slot, margin: 0.28 })) return null;
  return {
    id: `source-sheet-${i}`, index: i, mesh: 'loose_note',
    x, y, z: -depthMetres, depthMetres, pitch, yaw, roll,
    scaleX: 1.05, scaleY: 1.05, scaleZ: 1.05,
    surface, readable: floor && depthMetres <= SOURCE_HALL.lengthMetres,
    documentStage: sourceHallDocumentStage(depthMetres),
  };
}

// Twelve-metre service bays remain physically identical. What disappears is a
// relation: first a number's door, then a pool's fitting, then even the number.
// No side door is a route or an interaction. The concrete wall remains intact.
export const SOURCE_HALL_BAYS = Object.freeze(Array.from({ length: 9 }, (_, index) => {
  const depthMetres = 10 + index * 12;
  return Object.freeze({
    id: `source-hall-bay-${index}`, index, depthMetres,
    door: index < 2,
    number: index < 6,
    fitting: index < 4,
    lightPool: index < 8,
  });
}));

const placement = (id, mesh, x, y, z, extra = {}) => ({
  id, mesh, x, y, z, scaleX: 1, scaleY: 1, scaleZ: 1,
  pitch: 0, yaw: 0, roll: 0,
  structural: true, solid: false, ...extra,
});

// The existing set_beam is exactly a centred one-metre cube. Use its narrow
// offcuts for a repeated painted-looking '17', rather than a new text atlas or
// an unreadable blank door_stencil. Its complete bounds remain against the wall.
function bayNumber(bay) {
  const origin = { x: -2.925, y: 1.65, z: -bay.depthMetres - 0.84 };
  const strokes = [
    { z: -0.12, y: 0, width: 0.025, height: 0.24 },
    { z: 0.105, y: 0.108, width: 0.19, height: 0.025 },
    { z: 0.185, y: 0, width: 0.025, height: 0.24 },
  ];
  return strokes.map((stroke, index) => placement(`${bay.id}:number-${index}`, 'set_beam',
    origin.x, origin.y + stroke.y, origin.z + stroke.z,
    { scaleX: 0.018, scaleY: stroke.height, scaleZ: stroke.width, semantic: 'hall-bay-number', bayId: bay.id }));
}

export function sourceHallPropPlacements() {
  const out = [];
  for (const bay of SOURCE_HALL_BAYS) {
    const z = -bay.depthMetres;
    // plant_pipe_straight is 2.36m along local X; its lowest point is .03m
    // above its origin. This sits wholly above 4.1m, leaving all headroom free.
    out.push(placement(`${bay.id}:header`, 'plant_pipe_straight', 0, 4.08, z,
      { scaleX: 2.50, scaleY: 0.65, scaleZ: 0.65, semantic: 'hall-service-bay', bayId: bay.id }));
    // A small drain is always present at the left margin, so a missing leaf is
    // a missing relationship inside one recognisable bay, not new geometry.
    out.push(placement(`${bay.id}:drain`, 'drain_grille', -2.61, -0.004, z,
      { scaleX: 0.44, scaleY: 0.20, scaleZ: 1, yaw: Math.PI / 2, semantic: 'hall-service-bay', bayId: bay.id }));
    if (bay.door) {
      // Service leaf is hinge-origin x=0..1m. At yaw=-PI/2 its width runs
      // along +Z; offset the hinge by half a metre to centre it on the frame.
      out.push(placement(`${bay.id}:door-frame`, 'door_frame_single_steel', -2.955, 0, z,
        { yaw: -Math.PI / 2, semantic: 'hall-sealed-service-door', bayId: bay.id }));
      out.push(placement(`${bay.id}:door-leaf`, 'door_leaf_service', -2.935, 0, z - 0.5,
        { yaw: -Math.PI / 2, semantic: 'hall-sealed-service-door', bayId: bay.id }));
    }
    if (bay.number) out.push(...bayNumber(bay));
    if (bay.fitting) out.push(placement(`${bay.id}:fitting`, 'tower_bulkhead', 2.975, 2.50, z,
      { yaw: -Math.PI / 2, semantic: 'hall-practical-fitting', bayId: bay.id, emissive: [0.50, 0.58, 0.50, 0.10] }));
  }
  // A full-width drain and narrow masonry joints make the stopping plane
  // readable without putting a door or opaque wall over the impossible view.
  out.push(placement('source-hall:terminal-drain', 'drain_grille', 0, -0.004, -112,
    { scaleX: 5, scaleY: 0.20, scaleZ: 0.70, semantic: 'hall-terminal-seam' }));
  for (const side of [-1, 1]) out.push(placement(`source-hall:terminal-joint-${side}`, 'set_beam', side * 2.975, 2.25, -112,
    { scaleX: 0.025, scaleY: 4.5, scaleZ: 0.07, semantic: 'hall-terminal-seam' }));
  out.push(placement('source-hall:terminal-head', 'set_beam', 0, 4.475, -112,
    { scaleX: 6, scaleY: 0.025, scaleZ: 0.07, semantic: 'hall-terminal-seam' }));
  return out;
}

export function sourceHallLightPlacements(playerDepthMetres = 0, { maxLights = SOURCE_HALL.maxPracticalLights } = {}) {
  const depth = clamp(playerDepthMetres, 0, SOURCE_HALL.lengthMetres);
  const limit = Math.floor(clamp(maxLights, 0, SOURCE_HALL.maxPracticalLights));
  return SOURCE_HALL_BAYS.filter((bay) => bay.lightPool)
    .map((bay) => ({ bay, distance: Math.abs(depth - bay.depthMetres) }))
    .filter(({ distance }) => distance < 16)
    .sort((a, b) => a.distance - b.distance || a.bay.index - b.bay.index)
    .slice(0, limit)
    .map(({ bay }) => ({
      id: `${bay.id}:light`, bayId: bay.id,
      kind: 'fitting', x: 2.68, y: 2.68, z: -bay.depthMetres,
      color: [0.74, 0.81, 0.75], intensity: bay.index < 2 ? 0.82 : 0.67,
      radius: 15, penetration: 0.04, castsShadow: true, shadowYaw: -Math.PI / 2,
      sourceHallLight: true,
    }));
}
