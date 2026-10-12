// Source retains objects from Ellery, including their material, practical and
// electrical history. These are authored associations with real assets, not a
// colour map over the field. A reused/fragmented mesh is explicitly distinct
// from the Scene Dock's relocated instance.
import { CELL, ZONE } from './floorplan/legend.js';
import { CONSERVATORY_PROPS } from './conservatory-props.js';
import { CONSERVATORY_LIGHTS, resolveLocalLights } from './conservatory-lights.js';

const propsById = new Map(CONSERVATORY_PROPS.map((prop) => [prop.id, prop]));
const lightsById = new Map(CONSERVATORY_LIGHTS.map((light) => [light.id, light]));

export const SOURCE_ROOM_ORIGINS = Object.freeze({
  service: Object.freeze({ id: 'scene-dock', spaceId: 'get-in', label: 'Scene Dock', zone: ZONE.getIn }),
  practice: Object.freeze({ id: 'practice-ensemble', spaceId: 'practice', label: 'Practice rooms', zone: ZONE.practice }),
  hall: Object.freeze({ id: 'concert-hall', spaceId: 'hall', label: 'Concert hall', zone: ZONE.hall }),
  academic: Object.freeze({ id: 'academic-bust-gallery', spaceId: 'academic', label: 'Academic gallery', zone: ZONE.academic }),
  chapel: Object.freeze({ id: 'chapel', spaceId: 'chapel', label: 'Chapel', zone: ZONE.chapel }),
  tower: Object.freeze({ id: 'chapel-tower', spaceId: 'bell-tower', label: 'Chapel tower', zone: ZONE.bellTower }),
});

// The original placement IDs are deliberate provenance. The Source copies
// remain fantastically rescaled; they do not claim to be the original instance.
const ASSET_ORIGINS = Object.freeze({
  music_stand: ['practice', 'practice-stand-1'],
  cello: ['practice', 'practice-ensemble-cello'],
  violin: ['practice', 'practice-ensemble-violin'],
  open_instrument_case: ['practice', 'practice-case-1'],
  upright_piano: ['practice', 'practice-piano-1'],
  grand_piano: ['hall', 'hall-grand-1'],
  marimba: ['hall', 'hall-marimba-1'],
  timpani: ['hall', 'hall-timpani-1'],
  mallet_pair: ['practice', 'practice-ensemble-mallets'],
  academic_filing_bank: ['academic', 'academic-store-files-1'],
  academic_bust_plinth: ['academic', 'academic-bust-plinth-1'],
  marble_bust_01: ['academic', 'academic-bust-1'],
  academic_bust_fragment: ['academic', 'academic-bust-fragment-3'],
  source_bust_broken_torso: ['academic', 'academic-bust-1'],
  source_bust_broken_head: ['academic', 'academic-bust-1'],
  source_bust_face_shard: ['academic', 'academic-bust-1'],
  source_bust_marble_chips: ['academic', 'academic-bust-1'],
  chapel_vault: ['chapel', 'chapel-vault'],
  altar_table: ['chapel', 'chapel-altar'],
  lectern: ['chapel', 'chapel-lectern'],
  hymn_board: ['chapel', 'chapel-hymn-board'],
  pew: ['chapel', 'chapel-pew-l-0'],
  chapel_inner_screen: ['chapel', 'chapel-inner-screen'],
  organ_console: ['chapel', 'chapel-organ-console'],
  organ_pipes: ['chapel', 'chapel-organ-pipes'],
  portrait_frame: ['chapel', 'chapel-portrait-pollaiuolo'],
  hall_structure: ['hall', 'hall-structure'],
  hall_seating: ['hall', 'hall-seating'],
  tower_organ_case: ['tower', 'tower-organ-case'],
  tower_frame: ['tower', 'tower-bell-frame'],
});

function memory(originKey, sourcePropId, relation, role = 'survivor') {
  const origin = SOURCE_ROOM_ORIGINS[originKey];
  const source = propsById.get(sourcePropId);
  if (!origin || !source) throw new Error(`Unknown Source room provenance: ${originKey}/${sourcePropId}`);
  return Object.freeze({
    originId: origin.id, spaceId: origin.spaceId, label: origin.label,
    zone: origin.zone, sourcePropId, sourceMesh: source.mesh,
    relation, role, accession: source.provenance || null,
  });
}

export function sourceRoomMemoryForProp(prop, { structureKind = '' } = {}) {
  if (prop.sourceDoorId) return null;
  if (String(prop.id).startsWith('source-landing:')) {
    // Source-authored additions are not retroactively invented original props.
    return propsById.has(prop.sourcePropId)
      ? memory('service', prop.sourcePropId, 'relocated-instance') : null;
  }
  if (!String(prop.id).startsWith('source-hero-')
      && !String(prop.id).startsWith('source-seeded-giant-')
      && !String(prop.id).startsWith('source-leak-')
      && !String(prop.id).startsWith('source-cathedral-')
      && !String(prop.id).startsWith('divide-')) return null;
  let association = ASSET_ORIGINS[prop.mesh];
  if (prop.mesh === 'music_stand' && structureKind === 'percussion-shelf') association = ['hall', 'hall-stand-0'];
  if (!association && /^tower_(bell|wheel)_/.test(prop.mesh)) {
    const original = CONSERVATORY_PROPS.find((candidate) => candidate.mesh === prop.mesh);
    if (original) association = ['tower', original.id];
  }
  if (!association) return null;
  return memory(association[0], association[1], prop.mesh.startsWith('source_bust_') ? 'derived-fragment' : 'asset-reuse');
}

// A practical is physically fastened to a particular surviving object. Offsets
// are in that mesh's own authored coordinates and follow its scale and pose.
// The fitting itself keeps its original scale, material and electrical supply.
// Chapel lanterns are historically unpowered: their glass survives, no emitter
// is invented in place of the real chapel's external sky aperture.
export const SOURCE_ROOM_FIXTURE_BINDINGS = Object.freeze([
  Object.freeze({ anchorId: 'divide-west-stand-0', fixtureId: 'light-practice-north-casing', lightId: 'practice-emergency-north', group: 'upper', origin: 'practice', offset: [0, .42, -.045] }),
  // The left rim is at local x=-.81. Mount the original outward-facing casing
  // on that flank so its finite light reaches the walkable side of the piano.
  Object.freeze({ anchorId: 'divide-east-piano-0', fixtureId: 'light-hall-lounge-casing', lightId: 'hall-lounge-live', group: 'hall', origin: 'hall', offset: [-.80, .72, -.48] }),
  Object.freeze({ anchorId: 'divide-percussion-0', fixtureId: 'light-hall-lounge-casing', lightId: 'hall-lounge-live', group: 'hall', origin: 'hall', offset: [0, .48, -.28] }),
  Object.freeze({ anchorId: 'divide-bust-torso-0', fixtureId: 'academic-light-emergency-west', lightId: 'academic-emergency-west', group: 'academic', origin: 'academic', offset: [0, .28, -.30] }),
  Object.freeze({ anchorId: 'divide-final-vault-0', fixtureId: 'acq-chapel-lantern-nave', lightId: null, group: 'upper', origin: 'chapel', offset: [0, 3.1, 0] }),
]);

export function sourceRoomFixtureInstances(survivors, makeMatrix) {
  const byId = new Map(survivors.map((prop) => [prop.id, prop]));
  const out = [];
  for (const binding of SOURCE_ROOM_FIXTURE_BINDINGS) {
    const anchor = byId.get(binding.anchorId);
    if (!anchor?.roomMemory) continue;
    const original = propsById.get(binding.fixtureId);
    const light = lightsById.get(binding.lightId);
    if (!original || (binding.lightId && !light)) throw new Error(`Unknown Source room fixture: ${binding.fixtureId}`);
    const matrix = anchor.matrix;
    const [dx, dy, dz] = binding.offset;
    const x = matrix[12] + matrix[0] * dx + matrix[4] * dy + matrix[8] * dz;
    const y = matrix[13] + matrix[1] * dx + matrix[5] * dy + matrix[9] * dz;
    const z = matrix[14] + matrix[2] * dx + matrix[6] * dy + matrix[10] * dz;
    const yaw = Math.atan2(-matrix[2], matrix[0]) + (original.yaw || 0);
    const id = `${anchor.id}:room-fixture`;
    out.push({
      id, mesh: original.mesh,
      matrix: makeMatrix({ x, y, z, yaw, scaleX: original.scale || 1, scaleY: original.scale || 1, scaleZ: original.scale || 1 }),
      zone: SOURCE_ROOM_ORIGINS[binding.origin].zone, structural: true,
      lightCircuit: original.lightCircuit, lightMaintained: original.lightMaintained,
      lightColor: original.lightColor,
      sourcePropId: original.id, sourceMemoryFixture: true,
      roomMemory: Object.freeze({
        ...memory(binding.origin, original.id, 'fixture-reconstruction', 'fixture'),
        anchorId: anchor.id, originalLightId: binding.lightId,
        group: binding.group, circuit: light?.circuit || null,
        powerMode: light?.powerMode || 'unpowered', kind: light?.kind || null,
      }),
    });
  }
  return out;
}

export function resolveSourceRoomMemoryLights(fixtures, {
  time = 0, reducedMotion = false, flashMode = 'full', liveCircuits = null,
  origin = null, slots = 3,
} = {}) {
  const resolvedRigs = new Map();
  const lights = [];
  for (const fixture of fixtures) {
    const room = fixture.roomMemory;
    if (!room?.originalLightId) continue;
    const key = `${room.group}:${room.zone}`;
    if (!resolvedRigs.has(key)) resolvedRigs.set(key, resolveLocalLights({ group: room.group, zone: room.zone }, {
      timeSec: time, reducedFlash: reducedMotion, effectsMode: reducedMotion ? 'reduced' : flashMode,
      liveCircuits, slots: Infinity,
    }));
    const light = resolvedRigs.get(key).find((entry) => entry.id === room.originalLightId);
    if (!light) continue;
    const authored = lightsById.get(room.originalLightId);
    const offset = authored.anchorOffset || [0, 0, 0];
    const x = fixture.matrix[12] + offset[0], y = fixture.matrix[13] + offset[1], z = fixture.matrix[14] + offset[2];
    const distance = origin ? Math.hypot(x - origin.x, z - origin.z) : 0;
    // The real rig's finite falloff owns reach, including its emergency floor.
    // An emitter outside that reach cannot spend a per-pixel visibility slot.
    if (distance >= light.radius) continue;
    lights.push({
      ...light, id: `${fixture.id}:light`, x, y, z,
      anchorPropId: fixture.id, originalLightId: room.originalLightId,
      floorY: y - 1.8, roomMemory: room, sourceRoomMemory: true,
    });
  }
  return lights.sort((a, b) => {
    if (!origin) return a.id.localeCompare(b.id);
    return Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z);
  }).slice(0, slots);
}

export function sourceRoomMemorySnapshot(props) {
  return props.filter((prop) => prop.roomMemory).map((prop) => ({
    id: prop.id, mesh: prop.mesh, ...prop.roomMemory,
    x: prop.matrix[12], y: prop.matrix[13], z: prop.matrix[14],
    cellX: prop.matrix[12] / CELL, cellY: prop.matrix[14] / CELL,
    fixture: prop.sourceMemoryFixture === true,
  }));
}
