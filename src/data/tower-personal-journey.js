// Local metres, with yaw zero looking along -z. Shared support and threshold
// definitions keep rendering, collision and the saved circuit in agreement.
const freeze = (value) => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const slab = (id, minX, maxX, minZ, maxZ) => ({ id, minX, maxX, minZ, maxZ });
const pathSupports = (name, points, width = 8) => points.slice(1).map(([x, z], index) => {
  const [px, pz] = points[index], half = width / 2;
  return slab(`${name}-${index}`, Math.min(x, px) - half, Math.max(x, px) + half,
    Math.min(z, pz) - half, Math.max(z, pz) + half);
});
const threshold = (id, x, z, normalZ, toStage, toDoorId, extra = {}) => ({
  id, identity: id === 'entrance' || id === 'road-exit' ? 'invitation-door' : 'service-door',
  center: { x, z }, normal: { x: 0, z: normalZ }, halfWidth: 1.35,
  arrival: { x, z: z - normalZ * 1.25, yaw: normalZ > 0 ? 0 : Math.PI, pitch: 0 },
  toStage, toDoorId, ...extra,
});
const hallSupports = [slab('hall', -11, 11, -11, 21)];
const hallRoute = [[0, 17], [0, -4], [5, -4], [5, -9.5]];
const tapeRoute = [[0, 17], [0, -25], [-24, -25], [-24, -65], [22, -65],
  [22, -112], [-18, -112], [-18, -150], [18, -150], [18, -190]];
const tapeLoop = [[-24, -65], [-40, -65], [-40, -96], [22, -96]];
const broadcastRoute = [[0, 17], [0, -28], [30, -28], [30, -82], [-14, -82], [-14, -170]];
const worlds = {
  'school-hall': {
    id: 'school-hall', world: 'hall', spawn: { x: 0, z: 17, yaw: 0, pitch: 0 },
    supports: hallSupports, route: hallRoute,
    doors: [threshold('entrance', 0, 19.5, 1, 'school-hall', 'onward', { loop: true }),
      threshold('onward', 5, -9.5, -1, 'tape-field', 'back')],
    landmarks: { boy: { x: -.9, z: 1.8 }, looseLead: { x: 0, z: 1.8 } },
  },
  'tape-field': {
    id: 'tape-field', world: 'tape', spawn: { x: 0, z: 18.25, yaw: 0, pitch: 0 },
    supports: [...pathSupports('tape-path', [[0, 21], ...tapeRoute]), ...pathSupports('tape-loop', tapeLoop)],
    route: tapeRoute, loops: [tapeLoop],
    doors: [threshold('back', 0, 19.5, 1, 'school-hall', 'onward'),
      threshold('onward', 18, -190, -1, 'dead-broadcast', 'back')],
    landmarks: { largeReel: { x: -29, z: -54 }, hangingTape: { x: 17, z: -104 } },
  },
  'dead-broadcast': {
    id: 'dead-broadcast', world: 'broadcast', spawn: { x: 0, z: 18.25, yaw: 0, pitch: 0 },
    supports: [...pathSupports('broadcast-path', [[0, 21], ...broadcastRoute]),
      slab('mast-apron', -24, -4, -157, -132), slab('relay-overlook', 26, 46, -91, -73)],
    route: broadcastRoute,
    doors: [threshold('back', 0, 19.5, 1, 'tape-field', 'onward'),
      threshold('onward', -14, -170, -1, 'ash-room', 'back')],
    landmarks: { mast: { x: -20, z: -145 }, relay: { x: 39, z: -82 } },
  },
  'ash-room': {
    id: 'ash-room', world: 'ash', spawn: { x: 0, z: 18.25, yaw: 0, pitch: 0 },
    supports: [slab('ellery-entry', -19, 12, -24, 21), slab('lead-passage', 1, 9, -41, -20),
      slab('workroom', -4, 12, -59, -39), slab('back-aisle', -4, 4, -76, -55)],
    route: [[0, 17], [-14, 17], [-14, -20], [5, -20], [5, -48], [0, -56], [0, -72]],
    doors: [threshold('back', 0, 19.5, 1, 'dead-broadcast', 'onward'),
      threshold('onward', 0, -72, -1, 'return-hall', 'onward', { requiresRecording: true })],
    landmarks: { recordist: { x: 5, z: -52 } },
  },
  'return-hall': {
    id: 'return-hall', world: 'hall', spawn: { x: 5, z: -8.25, yaw: Math.PI, pitch: 0 },
    supports: hallSupports, route: [...hallRoute].reverse(),
    doors: [threshold('road-exit', 0, 19.5, 1, null, null, { exit: true }),
      threshold('onward', 5, -9.5, -1, 'ash-room', 'onward')],
    landmarks: { boy: { x: -.9, z: 1.8 }, looseLead: { x: 0, z: 1.8 } },
  },
};

export const TOWER_PERSONAL_STAGE_IDS = freeze(Object.keys(worlds));
export const TOWER_PERSONAL_WORLD_IDS = freeze(TOWER_PERSONAL_STAGE_IDS.slice(0, 4));
export const TOWER_PERSONAL_JOURNEY = freeze({
  version: 2, worlds, spawn: worlds['school-hall'].spawn,
  // Compatibility aliases describe the original hall, never all worlds at once.
  supports: hallSupports, boy: { x: -.9, z: 1.8 }, recordist: { x: 5, z: -52 },
  hallDoor: { x: 5, z: -9.5 }, workroomDoor: { x: 5, z: -40 }, returnDoor: { x: 0, z: 19.5 },
  listenRadius: 5.4, listenSeconds: 9, recordingSeconds: 14,
  handoverRadius: 3.2, handoverSeconds: 4, collapseSeconds: 6,
  doorArrivalSetback: 1.25, doorRearmDistance: .6,
});

export function towerPersonalWorld(stage = 'school-hall') {
  return worlds[stage] || worlds['school-hall'];
}

export function towerPersonalSupportAt(x, z, radius = .22, stage = 'school-hall') {
  return towerPersonalWorld(stage).supports.find((support) => x >= support.minX + radius
    && x <= support.maxX - radius && z >= support.minZ + radius && z <= support.maxZ - radius) || null;
}

export function towerPersonalPlacement(bells) {
  return { across: Math.max(180, Number(bells?.halfWidth || 58) + 130),
    along: Number(bells?.doors?.from ?? bells?.from ?? -4000) - 38 };
}

// Retained for diagnostics only. Quiet Threshold never presents an objective.
export function towerPersonalObjective(journey) {
  if (!journey.active) return journey.completed ? 'Carry the recording to the ring.' : 'Snow under a service door.';
  if (journey.handoverSeconds >= TOWER_PERSONAL_JOURNEY.handoverSeconds) return 'The lit door still opens onto the road.';
  if (journey.stage === 'return-hall') return 'The same hall. Someone has reached the boy first.';
  if (journey.stage === 'ash-room') return journey.recordingHeard ? 'The lead passes through the service door.' : 'A contractor is still working. Raise the DA1000 to listen.';
  return 'The loose lead continues through the service door.';
}
