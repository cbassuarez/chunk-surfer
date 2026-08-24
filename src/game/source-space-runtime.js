import SOURCE_ATLAS from '../../content/chunk-surf/source-atlas.json' with { type: 'json' };
import { CELL, EYE, F, MATERIAL, ZONE } from '../data/floorplan/legend.js';
import { encodeH } from '../world/floorplan.js';
import { HORIZON_PROFILE } from '../data/generated/horizon-profile.js';
import {
  CHUNK_SURF_HUSH_STAGE,
  CHUNK_SURF_PHASE,
  HORIZON_EXIT,
  SOURCE_FINALE_ROUTE,
  SOURCE_FINALE_STAGE,
  SOURCE_FINAL_OUTCOME,
  SOURCE_FINAL_STATUS,
  SOURCE_PURSUIT_BEAT,
  chunkSurfCompletion,
  chunkSurfProbe,
  normalizeChunkSurfState,
  pageStageForDistance,
  reduceChunkSurf,
  sourceBossAvailable,
} from './chunk-surf-state.js';
import { chunkSurfRoom } from '../data/chunk-surf-script.js';
import { SOURCE_PAGES, sourcePageFor } from '../data/source-pages.js';
import { ambientPaperDocumentId, paperAtlasIndex } from './paper-assets.js';
import {
  SOURCE_DIALOGUE_FACT,
  SOURCE_DIALOGUE_LIMITS,
  assignSourceDialoguePage,
  normalizeSourceDialogueState,
  recordSourceDialogueFact,
} from './source-dialogue.js';
import {
  hallRainFrame,
  SOURCE_BRACKET,
  SOURCE_HALL_END_METRES,
  SOURCE_HAYSTACK,
  SOURCE_SEARCH_START_METRES,
  haystackFearFrame,
  haystackMovementMultiplier,
  haystackMoshFrame,
  haystackPageGuidance,
  haystackRainFrame,
  sourceBracketFrame as buildSourceBracketFrame,
  sourceStandingPressure,
} from './source-haystack.js';
import {
  SOURCE_CHUTES, SOURCE_HORIZON, SOURCE_LIFTS, SOURCE_TIER_BY_ID,
  sourceChuteById, sourceFeatureAt, sourceHorizonDepth, sourceHorizonSeconds,
  sourceHorizonSlice, sourceLiftById, sourceTierAt,
  sourceTierHeightAt, sourceTraversal,
  SOURCE_BELLS,
  SOURCE_BELLS_ROOM,
  SOURCE_BELL_PASSAGE,
  inSourceBellsRoom,
  sourceBellsDepth,
  sourceBellsRoomResolve,
} from '../data/source-level.js';
import {
  SOURCE_LANDING_ENTRY_LOCAL,
  SOURCE_LANDING_FIELD_EDGE_LOCAL_Y,
  SOURCE_LANDING_HUSH_LOCAL,
  SOURCE_LANDING_OPENING_LOCAL,
  sourceLandingCellAt,
  sourceLandingContract,
  sourceLandingDoorPlacements,
  sourceLandingLights,
  sourceLandingPropPlacements,
} from '../data/source-landing.js';
import {
  nextSourceContact,
  normalizeSourceContactState,
  resolveSourceContact,
  sourceBossExposed,
} from './source-contact.js';

export const SOURCE_PLAN_WINDOW = 384;
export const SOURCE_PLAN_SNAP = 16;
export const SOURCE_ARCH_TILE_CELLS = 128;
export const SOURCE_ARCH_TILE_RADIUS = 2;
export const SOURCE_ARCH_MAX_INSTANCES = 20000;
export const SOURCE_SEEDED_STRUCTURE_COUNT = 14;
export const SOURCE_TRANSFORM_SECONDS = 5.5;
export const SOURCE_ENTRY = Object.freeze({ x: 0, y: 0, facing: 0 });

const HALL_HALF_WIDTH = 6; // runtime cells = three metres from centre to wall
const HALL_CEIL = 4.5;
export const SOURCE_HALL_END_Y = -(SOURCE_HALL_END_METRES / CELL);
const LANDSCAPE_W = 360; // 180 metres
const LANDSCAPE_H = 340; // 170 metres
const LANDSCAPE_FRONT = 18; // room behind the field origin, including the grey-door wall

const LANDMARK_OFFSETS = Object.freeze({
  'fork-room': { x: 0, y: -42, sector: 'fork' },
  'surfer-origin': { x: -92, y: -104, sector: 'student' },
  'work-order-loop': { x: 92, y: -104, sector: 'workOrder' },
  'recordist-loop': { x: 0, y: -142, sector: 'recordist' },
  'body-room': { x: 0, y: -232, sector: 'body' },
  'final-page': { x: 80, y: -312, sector: 'final' },
});

const REDACTIONS = Object.freeze([
  { id: 'comfort', sourceAnchor: 'source-not-body', dx: -10 },
  { id: 'body', sourceAnchor: 'borrowed-body-return', dx: 0 },
  { id: 'source', sourceAnchor: 'source-you', dx: 10 },
]);
const ROUTE_SEGMENTS = Object.freeze([
  { id: 'critical-spine', kind: 'critical', halfWidth: 6, points: [{ x: 0, y: 4 }, { x: 0, y: -42 }, { x: 0, y: -142 }, { x: 0, y: -232 }] },
  { id: 'surfer-loop', kind: 'optional', halfWidth: 4.5, points: [{ x: 0, y: -42 }, { x: -44, y: -70 }, { x: -92, y: -104 }, { x: -54, y: -132 }, { x: 0, y: -142 }] },
  { id: 'work-order-loop', kind: 'optional', halfWidth: 4.5, points: [{ x: 0, y: -42 }, { x: 44, y: -70 }, { x: 92, y: -104 }, { x: 54, y: -132 }, { x: 0, y: -142 }] },
  { id: 'final-causeway', kind: 'critical', halfWidth: 6, points: [{ x: 0, y: -232 }, { x: 24, y: -260 }, { x: 48, y: -282 }, { x: 80, y: -312 }] },
]);
const LANDMARK_PAD_RADIUS = 10;
const SOURCE_LAYER_BY_SECTOR=Object.freeze({hall:1,fork:2,recordist:3,student:4,workOrder:5,body:6,final:7,hush:8});

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));
const clamp01 = (value) => clamp(value, 0, 1);
const hash32 = (value) => {
  let x = Number(value) | 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16; return x >>> 0;
};
const rand = (seed, index, salt = 0) => hash32((seed | 0) ^ Math.imul(index + 1, 1597334677) ^ salt) / 4294967295;

// The eyes are evidence, never a payment. A player who put them back has done
// at least as much as one still carrying them; merely seeing them and refusing
// them, or never finding them, does not satisfy the Horizon proposition.
export function horizonBustEyeEvidence(phase = null) {
  if (phase === 'carried') return Object.freeze({ eligible: true, mode: 'carried' });
  if (phase === 'returned') return Object.freeze({ eligible: true, mode: 'returned' });
  return Object.freeze({ eligible: false, mode: phase === 'declined' ? 'declined' : 'untouched' });
}

function pageCount(distance) {
  const d = Math.max(0, distance);
  // Density is a dramatic control, not an interaction count. Readable pages
  // remain a subset while the renderer gets a much denser authored field.
  if (d < 28) return 260 + Math.floor(d / 28 * 80);
  if (d < 56) return 340 + Math.floor((d - 28) / 28 * 120);
  if (d < 84) return 460 + Math.floor((d - 56) / 28 * 160);
  if (d < 112) return 620 + Math.floor((d - 84) / 28 * 180);
  return 960;
}

function sourceLines(sectorId) {
  return SOURCE_ATLAS.sectors?.[sectorId]?.sourceLines || SOURCE_ATLAS.sectors?.hall?.sourceLines || [];
}

function readableSourceLines(sectorId) {
  const readable = sourceLines(sectorId).filter((entry) => entry.text.trim().length >= 16 && /[A-Za-z_$]/.test(entry.text));
  return readable.length ? readable : sourceLines(sectorId);
}

function exactLine(sectorId, index = 0) {
  const lines = readableSourceLines(sectorId);
  return lines.length ? lines[((index % lines.length) + lines.length) % lines.length] : null;
}

function redactedSourceText(entry) {
  if (!entry?.text) return '[SOURCE OMITTED]';
  const candidates = (entry.tokens || []).filter((token) => token.kind === 'string' || token.kind === 'number' || (token.kind === 'identifier' && token.text.length >= 9));
  const selected = candidates.length ? candidates.filter((_, index) => index % 2 === 0) : [];
  if (!selected.length) return entry.text;
  const chars = [...entry.text];
  for (const token of selected) {
    for (let index = token.start; index < token.end; index += 1) {
      if (!/\s/.test(chars[index] || '')) chars[index] = '█';
    }
  }
  return chars.join('');
}

function sourceLineByAnchor(anchor) {
  for (const entry of Object.values(SOURCE_ATLAS.entries || {})) {
    if (entry.text.includes(anchor)) return entry;
  }
  return exactLine('final', 0);
}

export function validateSourceAtlas(atlas = SOURCE_ATLAS) {
  const errors = [];
  if (atlas?.schemaVersion !== 3) errors.push('schemaVersion must equal 3');
  if (!atlas?.exactSource) errors.push('exactSource must be true');
  for (const [sectorId, sector] of Object.entries(atlas?.sectors || {})) {
    if ((sector.sourceLines || []).length < 8) errors.push(`${sectorId} has too few source lines`);
    for (const line of sector.sourceLines || []) {
      if (!line.file || !Number.isFinite(line.line) || !line.text || !Number.isFinite(line.hash)) errors.push(`${sectorId} contains invalid provenance`);
      if (/https?:\/\//i.test(line.text) || /\/Users\//.test(line.text)) errors.push(`${sectorId} contains unsafe source`);
    }
  }
  for (const reference of atlas?.references || []) {
    const entry = atlas?.entries?.[reference.entryId];
    if (!entry || entry.file !== reference.file || entry.line !== reference.line || entry.hash !== reference.hash) {
      errors.push(`${reference.id || 'reference'} has invalid provenance`);
    }
    if (!atlas?.symbols?.[reference.from] || !atlas?.symbols?.[reference.to]) errors.push(`${reference.id || 'reference'} has unknown symbols`);
  }
  return { ok: errors.length === 0, errors };
}

function mul(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}

const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const translate = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const scale = (x, y, z) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };

export function sourceMatrix({ x = 0, y = 0, z = 0, scaleX = 1, scaleY = 1, scaleZ = 1, pitch = 0, yaw = 0, roll = 0 } = {}) {
  return mul(translate(x, y, z), mul(rotY(yaw), mul(rotX(pitch), mul(rotZ(roll), scale(scaleX, scaleY, scaleZ)))));
}

function treeOffsets(seed = 4417) {
  const out = [];
  for (let i = 0; i < 132; i += 1) {
    const side = i % 2 ? 1 : -1;
    const x = side * (18 + rand(seed, i, 11) * 150);
    const y = -18 - rand(seed, i, 29) * 306;
    if (Math.hypot(x, y + 142) < 18 || Math.hypot(x - 80, y + 312) < 20) continue;
    out.push({ x, y, radius: 2.2 + rand(seed, i, 47) * 4.8 });
  }
  return out;
}

function distanceToSegment(point, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = point.x - a.x, wy = point.y - a.y;
  const t = clamp01((wx * vx + wy * vy) / Math.max(0.0001, vx * vx + vy * vy));
  return Math.hypot(point.x - (a.x + vx * t), point.y - (a.y + vy * t));
}

function routeDistance(point, route) {
  let distance = Infinity;
  for (let index = 0; index < route.points.length - 1; index += 1) {
    distance = Math.min(distance, distanceToSegment(point, route.points[index], route.points[index + 1]));
  }
  return distance;
}

function routeAt(point) {
  return ROUTE_SEGMENTS.find((route) => routeDistance(point, route) <= route.halfWidth) || null;
}

function onLandmarkPad(point) {
  return Object.values(LANDMARK_OFFSETS).some((landmark) => Math.hypot(point.x - landmark.x, point.y - landmark.y) <= LANDMARK_PAD_RADIUS);
}

const smoothstep = (lo, hi, value) => {
  const t = clamp01((value - lo) / Math.max(0.0001, hi - lo));
  return t * t * (3 - 2 * t);
};

const SOURCE_STRUCTURE_ROUTE_BUFFER = 12;
const SOURCE_STRUCTURE_EDGE_MARGIN = 12;
const SEEDED_STRUCTURE_KINDS = Object.freeze([
  'music-stand', 'music-stand', 'upright-piano', 'grand-piano',
  'marimba', 'timpani', 'cello', 'violin', 'bust', 'fractured-bust',
]);

const heroStructurePlacements = () => [
  {
    id: 'source-hero-stand-gate', kind: 'music-stand-gate', hero: true, x: 0, y: -30, yaw: 0,
    components: [
      { mesh: 'music_stand', dx: -24, dz: 0, scale: 9, yaw: 0.12, roll: -0.045, sink: 0.18 },
      { mesh: 'music_stand', dx: 24, dz: 0, scale: 9.4, yaw: -0.12, roll: 0.045, sink: 0.22 },
    ],
    colliders: [
      { dx: -24, dz: 0, halfX: 5, halfY: 5, yaw: 0.12 },
      { dx: 24, dz: 0, halfX: 5.2, halfY: 5.2, yaw: -0.12 },
    ],
  },
  {
    id: 'source-hero-string-fall', kind: 'string-fall', hero: true, x: -128, y: -104, yaw: -0.18,
    components: [
      { mesh: 'cello', dx: -3, dz: 0, scale: 7.2, yaw: -0.28, roll: -0.16, sink: 0.55 },
      { mesh: 'violin', dx: 6, dz: 2, scale: 15, yaw: 0.55, pitch: -Math.PI / 2, roll: 0.22, sink: 0.32 },
      { mesh: 'music_stand', dx: 2, dz: -7, scale: 7.4, yaw: 1.15, roll: 0.34, sink: 0.8 },
    ],
    colliders: [{ dx: 0, dz: -1, halfX: 10, halfY: 10, yaw: -0.18 }],
  },
  {
    id: 'source-hero-piano-rise', kind: 'piano-rise', hero: true, x: 128, y: -112, yaw: 0.14,
    components: [
      { mesh: 'grand_piano', dx: -5, dz: 1, scale: 6.8, yaw: 0.38, roll: -0.055, sink: 1.15 },
      { mesh: 'upright_piano', dx: 12, dz: -6, scale: 7.6, yaw: -0.48, roll: 0.035, sink: 0.58 },
    ],
    colliders: [
      { dx: -5, dz: 1, halfX: 13, halfY: 20, yaw: 0.38 },
      { dx: 12, dz: -6, halfX: 12, halfY: 10, yaw: -0.48 },
    ],
  },
  {
    id: 'source-hero-percussion-shelf', kind: 'percussion-shelf', hero: true, x: 44, y: -184, yaw: -0.08,
    components: [
      { mesh: 'marimba', dx: 0, dz: 0, scale: 8, yaw: Math.PI / 2 - 0.08, roll: -0.025, sink: 0.7 },
      { mesh: 'timpani', dx: 4, dz: -13, scale: 10, yaw: 0.24, sink: 0.9 },
      { mesh: 'timpani', dx: -6, dz: -14, scale: 8.5, yaw: -0.16, sink: 0.65 },
      { mesh: 'mallet_pair', dx: -2, dz: 3, scale: 20, yaw: 0.72, pitch: -0.18, elevation: 2.4 },
      { mesh: 'music_stand', dx: 9, dz: 8, scale: 6.8, yaw: -0.55, roll: 0.16, sink: 0.48 },
    ],
    colliders: [
      { dx: 0, dz: 0, halfX: 11, halfY: 22, yaw: Math.PI / 2 - 0.08 },
      { dx: 0, dz: -14, halfX: 12, halfY: 8, yaw: 0 },
      { dx: 9, dz: 8, halfX: 4, halfY: 4, yaw: -0.55 },
    ],
  },
  {
    id: 'source-hero-bust-tribunal', kind: 'bust-tribunal', hero: true, x: -52, y: -250, yaw: 0.12,
    components: [
      { mesh: 'academic_bust_plinth', dx: -8, dz: 0, scale: 12, yaw: 0.06, sink: 0.25 },
      { mesh: 'marble_bust_01', dx: -8, dz: 0, scale: 24, yaw: Math.PI + 0.06, elevation: 13.25 },
      { mesh: 'source_bust_broken_torso', dx: 8, dz: -2, scale: 24, yaw: Math.PI - 0.2, roll: -0.08, sink: 0.3 },
      { mesh: 'source_bust_broken_head', dx: 15, dz: 5, scale: 24, yaw: 0.72, roll: 1.08, sink: 0.16 },
      { mesh: 'source_bust_face_shard', dx: 4, dz: 9, scale: 24, yaw: -0.6, roll: 0.44, sink: 0.08 },
      { mesh: 'source_bust_marble_chips', dx: 10, dz: 3, scale: 24, yaw: 0.2, sink: 0.02 },
    ],
    colliders: [
      { dx: -8, dz: 0, halfX: 8, halfY: 8, yaw: 0.06 },
      { dx: 9, dz: 2, halfX: 12, halfY: 11, yaw: -0.12 },
    ],
  },
];

function rotateOffset(dx = 0, dz = 0, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: dx * c + dz * s, y: -dx * s + dz * c };
}

function colliderWorld(placement, collider) {
  const offset = rotateOffset(collider.dx, collider.dz, placement.yaw || 0);
  return {
    x: placement.x + offset.x,
    y: placement.y + offset.y,
    halfX: collider.halfX,
    halfY: collider.halfY,
    yaw: (placement.yaw || 0) + (collider.yaw || 0),
  };
}

function pointInStructureCollider(x, y, placement, collider) {
  const world = colliderWorld(placement, collider);
  const c = Math.cos(world.yaw), s = Math.sin(world.yaw);
  const dx = x - world.x, dy = y - world.y;
  const localX = dx * c - dy * s;
  const localY = dx * s + dy * c;
  return Math.abs(localX) <= world.halfX && Math.abs(localY) <= world.halfY;
}

function placementRadius(placement) {
  return Math.max(1, ...(placement.colliders || []).map((collider) => {
    const offset = Math.hypot(collider.dx || 0, collider.dz || 0);
    return offset + Math.hypot(collider.halfX || 0, collider.halfY || 0);
  }));
}

function placementClearsAuthoredSpace(placement, accepted = []) {
  const radius = placementRadius(placement);
  if (Math.abs(placement.x) + radius > LANDSCAPE_W / 2 - SOURCE_STRUCTURE_EDGE_MARGIN) return false;
  if (placement.y + radius > -12 || placement.y - radius < -LANDSCAPE_H + SOURCE_STRUCTURE_EDGE_MARGIN) return false;
  for (const route of ROUTE_SEGMENTS) {
    if (routeDistance(placement, route) <= route.halfWidth + SOURCE_STRUCTURE_ROUTE_BUFFER + radius) return false;
  }
  for (const point of Object.values(LANDMARK_OFFSETS)) {
    if (Math.hypot(placement.x - point.x, placement.y - point.y) <= LANDMARK_PAD_RADIUS + SOURCE_STRUCTURE_ROUTE_BUFFER + radius) return false;
  }
  return !accepted.some((other) => Math.hypot(placement.x - other.x, placement.y - other.y)
    <= radius + placementRadius(other) + 8);
}

function seededStructure(kind, seed, index, x, y) {
  const unit = rand(seed, index, 811);
  const yaw = rand(seed, index, 823) * Math.PI * 2;
  const depth = -y;
  const emergence = smoothstep(28, LANDSCAPE_H - 36, depth);
  const sink = (1.65 - emergence * 1.25) * (0.5 + rand(seed, index, 827) * 0.7);
  const make = (components, colliders) => ({
    id: `source-seeded-giant-${index}`, kind, hero: false, seeded: true, x, y, yaw, components, colliders,
  });
  if (kind === 'music-stand') {
    const scale = 5.2 + unit * 2.8;
    return make([{ mesh: 'music_stand', scale, yaw: 0, roll: (rand(seed, index, 829) - 0.5) * 0.2, sink }],
      [{ halfX: scale * 0.58, halfY: scale * 0.58, yaw: 0 }]);
  }
  if (kind === 'upright-piano') {
    const scale = 4.5 + unit * 3;
    return make([{ mesh: 'upright_piano', scale, yaw: 0, roll: (rand(seed, index, 839) - 0.5) * 0.12, sink }],
      [{ halfX: scale * 1.55, halfY: scale * 1.36, yaw: 0 }]);
  }
  if (kind === 'grand-piano') {
    const scale = 5.5 + unit * 3;
    return make([{ mesh: 'grand_piano', scale, yaw: 0, roll: (rand(seed, index, 853) - 0.5) * 0.1, sink }],
      [{ halfX: scale * 2.05, halfY: scale * 3.12, yaw: 0 }]);
  }
  if (kind === 'marimba') {
    const scale = 5.5 + unit * 3.5;
    return make([{ mesh: 'marimba', scale, yaw: 0, roll: (rand(seed, index, 857) - 0.5) * 0.08, sink }],
      [{ halfX: scale * 2.7, halfY: scale * 1.36, yaw: 0 }]);
  }
  if (kind === 'timpani') {
    const scale = 6 + unit * 5;
    return make([{ mesh: 'timpani', scale, yaw: 0, sink }],
      [{ halfX: scale * 0.92, halfY: scale * 0.92, yaw: 0 }]);
  }
  if (kind === 'cello') {
    const scale = 4 + unit * 3.5;
    return make([{ mesh: 'cello', scale, yaw: 0, roll: (rand(seed, index, 859) - 0.5) * 0.22, sink }],
      [{ halfX: scale * 0.62, halfY: scale * 0.62, yaw: 0 }]);
  }
  if (kind === 'violin') {
    const scale = 8 + unit * 8;
    return make([{ mesh: 'violin', scale, yaw: 0, pitch: -Math.PI / 2, roll: (rand(seed, index, 863) - 0.5) * 0.26, sink }],
      [{ halfX: scale * 0.68, halfY: scale * 1.1, yaw: 0 }]);
  }
  if (kind === 'fractured-bust') {
    const scale = 14 + unit * 8;
    return make([
      { mesh: 'source_bust_broken_torso', dx: -2, dz: 0, scale, yaw: 0, roll: -0.08, sink },
      { mesh: 'source_bust_broken_head', dx: 3.5, dz: 2, scale, yaw: 0.7, roll: 1.1, sink: sink * 0.4 },
      { mesh: 'source_bust_face_shard', dx: 0, dz: 4, scale, yaw: -0.55, roll: 0.4, sink: 0 },
      { mesh: 'source_bust_marble_chips', dx: 1, dz: 2, scale, yaw: 0, sink: 0 },
    ], [{ dx: 0.5, dz: 1.5, halfX: scale * 0.9, halfY: scale * 0.8, yaw: 0 }]);
  }
  const plinthScale = 6 + unit * 2;
  const bustScale = plinthScale * 2;
  return make([
    { mesh: 'academic_bust_plinth', scale: plinthScale, yaw: 0, sink },
    { mesh: 'marble_bust_01', scale: bustScale, yaw: Math.PI, elevation: plinthScale * 1.11 - sink },
  ], [{ halfX: plinthScale * 0.66, halfY: plinthScale * 0.66, yaw: 0 }]);
}

export function sourceStructurePlacements(seed = 4417) {
  const heroes = heroStructurePlacements();
  const accepted = [];
  let fractured = 0;
  for (let candidate = 0; candidate < 800 && accepted.length < SOURCE_SEEDED_STRUCTURE_COUNT; candidate += 1) {
    const x = (rand(seed, candidate, 733) - 0.5) * (LANDSCAPE_W - SOURCE_STRUCTURE_EDGE_MARGIN * 2);
    const y = -(24 + rand(seed, candidate, 751) * (LANDSCAPE_H - 48));
    let kind = SEEDED_STRUCTURE_KINDS[Math.floor(rand(seed, candidate, 769) * SEEDED_STRUCTURE_KINDS.length)];
    if (kind === 'fractured-bust' && fractured >= 2) kind = 'bust';
    const placement = seededStructure(kind, seed, candidate, x, y);
    if (!placementClearsAuthoredSpace(placement, [...heroes, ...accepted])) continue;
    if (kind === 'fractured-bust') fractured += 1;
    placement.id = `source-seeded-giant-${accepted.length}`;
    accepted.push(placement);
  }
  if (accepted.length !== SOURCE_SEEDED_STRUCTURE_COUNT) {
    throw new Error(`Source structure placement exhausted at ${accepted.length}/${SOURCE_SEEDED_STRUCTURE_COUNT}`);
  }
  return [...heroes, ...accepted];
}

export function sourceStructureCollisionAt(placements, localX, localY) {
  return (placements || []).find((placement) => (placement.colliders || [])
    .some((collider) => pointInStructureCollider(localX, localY, placement, collider))) || null;
}

export function sourceStructureRouteClearance(placement) {
  let clearance = Infinity;
  for (const collider of placement?.colliders || []) {
    const world = colliderWorld(placement, collider);
    for (const route of ROUTE_SEGMENTS) {
      clearance = Math.min(clearance, routeDistance(world, route) - route.halfWidth - Math.max(world.halfX, world.halfY));
    }
  }
  return clearance;
}

export function sourceLandscapePlanOrigin(origin = { x: 0, y: -252 }) {
  const marginX = (SOURCE_PLAN_WINDOW - LANDSCAPE_W) / 2;
  const marginY = (SOURCE_PLAN_WINDOW - LANDSCAPE_H) / 2;
  return {
    x: Math.floor((Number(origin.x || 0) - LANDSCAPE_W / 2 - marginX) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP,
    y: Math.floor((Number(origin.y || 0) - LANDSCAPE_H - marginY) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP,
  };
}

export const SOURCE_OBJECTIVE_CONTRACT_VERSION = 2;

function compassBearing(from, target) {
  if (!from || !target) return null;
  const angle = Math.atan2(target.x - from.x, -(target.y - from.y));
  const index = Math.round(angle / (Math.PI / 4) + 8) % 8;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][index];
}

// Deterministic value noise — the ground is an actual, uneven landscape of mounds
// and dips generated here, not a smooth ramp dressed with decals. The code text
// planes sample this same function as collision, so the source IS the terrain's
// surface, tiled over its real topology. Amplitude/frequency are bounded so the
// per-cell slope stays under the walk limit.
function landHash(ix, iy) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) | 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function landNoise(x, y) {
  const fx = Math.floor(x), fy = Math.floor(y), sx = x - fx, sy = y - fy;
  const u = sx * sx * (3 - 2 * sx), v = sy * sy * (3 - 2 * sy);
  const a = landHash(fx, fy), b = landHash(fx + 1, fy), c = landHash(fx, fy + 1), d = landHash(fx + 1, fy + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; // 0..1
}
// THE FIELD IS TIERED NOW, AND THAT IS THE WHOLE POINT.
//
// This used to be a set of smooth ramps plus slope-bounded mounds, chosen "so
// the whole field stays walkable" — which is precisely why the space had no
// level design in it: nothing could be gated, no route cost anything, and every
// destination was a straight line away. It is four plateaus separated by cliffs
// taller than a step, joined by authored field lifts and chutes (data/source-level.js).
//
// The mounds survive, scaled right down: enough that a tier reads as ground
// rather than as a table, small enough that it never becomes an accidental ramp
// between two tiers that are supposed to be a decision apart.
export function sourceLandscapeFloorAt(localX, localY) {
  const lx = Number(localX) || 0, ly = Number(localY) || 0;
  const base = sourceTierHeightAt(ly);

  // A field lift is a vertical volume, not a disguised ramp. Its footprint keeps
  // the height of whichever side of the boundary it occupies; the runtime owns
  // the committed vertical travel and the camera's interpolated floor.
  const feature = sourceFeatureAt(lx, ly);
  if (feature?.kind === 'lift') return base;
  // A chute is a ramp you can only take downhill — the surf. It falls from its
  // mouth to the tier below across its run.
  if (feature?.kind === 'chute') {
    const top = SOURCE_TIER_BY_ID[feature.from]?.height ?? base;
    const bottom = SOURCE_TIER_BY_ID[feature.to]?.height ?? base;
    return top + (bottom - top) * clamp01(feature.progress);
  }

  const mounds = (landNoise(lx * 0.05 + 11, ly * 0.05) - 0.5) * 0.42
    + (landNoise(lx * 0.12 + 37, ly * 0.12) - 0.5) * 0.16;
  return base + mounds;
}

function materialAtLandscape(localX, localY) {
  const p = { x: localX, y: localY };
  // LEGIBILITY WITHOUT UI. A chute mouth and a ladder foot have to read from a
  // distance in a space whose whole aesthetic is that it has no markers, so they
  // read by MATERIAL — the same trick the routes already use. sourceFault is the
  // brightest of the three and it is what a way up or down should be.
  const feature = sourceFeatureAt(localX, localY);
  if (feature) return MATERIAL.sourceFault;
  if (routeAt(p)) return MATERIAL.sourcePath;
  for (const point of Object.values(LANDMARK_OFFSETS)) {
    if (Math.hypot(localX - point.x, localY - point.y) <= 7) return MATERIAL.sourceFault;
  }
  return MATERIAL.sourceField;
}

function focusedCandidate(px, py, facing, candidates, maxCells = 6) {
  const dir = [[0, -1], [1, 0], [0, 1], [-1, 0]][((facing % 4) + 4) % 4];
  const eligible = candidates.map((candidate) => {
    const dx = candidate.x - px, dy = candidate.y - py;
    const distance = Math.hypot(dx, dy);
    const dot = distance > 0.001 ? (dx * dir[0] + dy * dir[1]) / distance : 1;
    return {
      ...candidate,
      distance,
      dot,
      focusPriority: Number(candidate.focusPriority) || 0,
    };
  }).filter((candidate) => candidate.distance <= (Number(candidate.focusRadius) || maxCells) && candidate.dot >= 0.2)
    .sort((a, b) => (b.dot - a.dot) || (a.distance - b.distance));

  const best = eligible[0] || null;
  if (!best) return null;
  // Priority breaks a close perceptual tie only. It cannot pull the real page
  // from off-axis or from materially farther away than the thing being aimed at.
  return eligible.find((candidate) => candidate.focusPriority > best.focusPriority
    && candidate.dot >= best.dot - 0.18
    && candidate.distance <= best.distance + 1.5) || best;
}

function lineOfSight(canStep, a, b) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(distance * 2));
  let previous = { x: a.x, y: a.y };
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const next = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (!canStep(previous.x, previous.y, next.x, next.y)?.ok) return false;
    previous = next;
  }
  return true;
}

function aStar(canStep, canOccupy, start, goal, maxVisited = 30000) {
  const sx = Math.floor(start.x), sy = Math.floor(start.y), gx = Math.floor(goal.x), gy = Math.floor(goal.y);
  const key = (x, y) => `${x},${y}`;
  const open = [{ x: sx, y: sy, g: 0, f: Math.hypot(gx - sx, gy - sy) }];
  const best = new Map([[key(sx, sy), 0]]), parent = new Map();
  let visited = 0;
  while (open.length && visited++ < maxVisited) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    if (current.x === gx && current.y === gy) {
      const path = [{ x: gx + 0.5, y: gy + 0.5 }];
      let k = key(gx, gy);
      while (parent.has(k)) {
        const prev = parent.get(k); path.push({ x: prev.x + 0.5, y: prev.y + 0.5 }); k = key(prev.x, prev.y);
      }
      return path.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx, y = current.y + dy;
      const next = { x: x + 0.5, y: y + 0.5 };
      if (!canOccupy(next.x, next.y) || !canStep(current.x + 0.5, current.y + 0.5, next.x, next.y)?.ok) continue;
      const nk = key(x, y), ng = current.g + 1;
      if (ng >= (best.get(nk) ?? Infinity)) continue;
      best.set(nk, ng); parent.set(nk, { x: current.x, y: current.y });
      open.push({ x, y, g: ng, f: ng + Math.hypot(gx - x, gy - y) });
    }
  }
  return [];
}

export function createSourceSpaceRuntime({
  initialState,
  onState = () => {},
  onComplete = () => {},
  onScare = () => {},
  // WHAT THE MAN OUTSIDE TOLD HIM, MONTHS BEFORE THE BUST SAYS IT.
  //
  // Malcolm Vey, in the rain, with a laminated map: the chapel in there and the
  // cathedral out here are one signal path. He has no basis for it and he is
  // right (data/exterior-vigil.js). This flag is RECOGNITION AND NOT ACCESS —
  // the bust's offer, the exit it opens and everything past it are identical
  // either way. All it buys is that the player already knows where the longer
  // road goes when it is offered, instead of finding out afterwards.
  linkedChapels = false,
} = {}) {
  let state = normalizeChunkSurfState(initialState);
  let sourceDialogue = normalizeSourceDialogueState(state.haystackDialogue, {
    seed: state.seed,
    facts: state.profile?.sourceMemoryFacts || {},
  });
  let player = { x: SOURCE_ENTRY.x, y: SOURCE_ENTRY.y, facing: SOURCE_ENTRY.facing };
  let transformElapsed = 0;
  let lastPlan = null;
  let lastFocus = null;
  const readSheets = new Set();
  let completionSent = false;
  let pathCache = { key: '', path: [] };
  let protectionRemaining = 0;
  let restartGraceRemaining = state.sourceContacts?.captures > 0 ? 5 : 0;
  let captureMovementRequired = state.sourceContacts?.captures > 0;
  let captureMovementAnchor = null;
  let traversal = null;
  let pendingContact = null;
  // A committed Contact resumes at the fight, never at the warning. Exact turns
  // are deliberately not persisted; the branch commitment is.
  let bossRequested = state.finale?.route === SOURCE_FINALE_ROUTE.CONTACT
    && state.finale?.stage === SOURCE_FINALE_STAGE.CONTACT_COMMITTED;
  let landingRainRemaining = state.landingWeatherSpent ? 0 : 12;
  let phaseElapsed = 0;
  // SEARCH begins in the final quarter of the tunnel. It is a continuous
  // dramatic span, so this clock does not reset at HALL -> HAYSTACK.
  let searchElapsed = state.phase === CHUNK_SURF_PHASE.HAYSTACK ? 12 : 0;
  // The pressure floor belongs to the whole hall/search event, not to a phase.
  // It is monotonic until the real page is taken.
  let standingPressure = sourceStandingPressure({
    hallMaxDistance: state.hallMaxDistance,
    searchElapsed,
  });
  // A resumed haystack is already past the point at which weather has arrived.
  let rainLatched = state.phase === CHUNK_SURF_PHASE.HAYSTACK;
  let haystackWrongReads = 0;
  let haystackReadImpulse = 0;
  let noProgressSeconds = 0;
  let lastObjectiveDistance = Infinity;
  let lastObjectiveId = '';
  const sceneCache = new Map();
  const sceneAssemblyCache = new Map();
  const trees = treeOffsets(state.seed);
  const structures = sourceStructurePlacements(state.seed);
  let sourceCorpusCache = null;

  const searchSpanActiveFor = (snapshot = state) => snapshot.phase === CHUNK_SURF_PHASE.HAYSTACK
    || (snapshot.phase === CHUNK_SURF_PHASE.HALL
      && (Number(snapshot.hallMaxDistance) || 0) >= SOURCE_SEARCH_START_METRES);

  function setState(next, { immediate = false } = {}) {
    const previousPhase = state.phase;
    const previousSearchSpan = searchSpanActiveFor(state);
    state = normalizeChunkSurfState(next);
    if (state.landingWeatherSpent) landingRainRemaining = 0;
    const nextSearchSpan = searchSpanActiveFor(state);
    if (state.phase !== previousPhase) {
      phaseElapsed = 0;
      // HALL -> HAYSTACK is deliberately not a pressure boundary.
      if (!(previousSearchSpan && nextSearchSpan)) {
        searchElapsed = 0;
        haystackReadImpulse = 0;
        if (!nextSearchSpan) {
          haystackWrongReads = 0;
          rainLatched = false;
          // TRANSFORMING is the first point where the sequence is allowed to
          // release. Until then the floor only rises.
          if (![CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) standingPressure = 0;
        }
      }
    }
    sourceDialogue = normalizeSourceDialogueState(state.haystackDialogue || sourceDialogue, {
      seed: state.seed,
      facts: state.profile?.sourceMemoryFacts || {},
    });
    lastPlan = null;
    onState(state, { immediate });
    return state;
  }

  function dispatch(event, options) { return setState(reduceChunkSurf(state, event), options); }

  function commitDialogue(next, { immediate = true } = {}) {
    sourceDialogue = normalizeSourceDialogueState(next, { seed: state.seed, facts: state.profile?.sourceMemoryFacts || {} });
    return setState({ ...state, haystackDialogue: sourceDialogue }, { immediate });
  }

  function rememberDialogueFact(key, value = true, { latencyReads = SOURCE_DIALOGUE_LIMITS.localFactLatencyReads } = {}) {
    const existing = sourceDialogue.facts?.[key];
    if (existing?.value === value) return sourceDialogue;
    return commitDialogue(recordSourceDialogueFact(sourceDialogue, key, value, { latencyReads }), { immediate: true }).haystackDialogue;
  }
  function landscapeOrigin() { return state.landscapeOrigin || { x: 0, y: -252 }; }
  function landmarkPoint(id) {
    const offset = LANDMARK_OFFSETS[id];
    if (!offset) return null;
    const origin = landscapeOrigin();
    return { id, x: origin.x + offset.x, y: origin.y + offset.y, sector: offset.sector };
  }
  function haystackPagePoint() {
    const slot = state.interactivePageSlot ?? (state.seed >>> 0) % 12;
    const row = Math.floor(slot / 4), col = slot % 4;
    // The still page lives on the playable side of the 112 m line. The corridor
    // may continue visually forever, but nothing actionable is placed inside
    // that visual-only continuation.
    const longitudinalOffsets = [8, 16, 24]; // runtime cells: 4m, 8m, 12m back
    return {
      x: -4.5 + col * 3,
      y: SOURCE_HALL_END_Y + longitudinalOffsets[row],
    };
  }

  function sourceLandscapeOriginAfterHaystack() {
    // Keep the later Source field anchored independently from whichever still
    // page slot this run happened to receive.
    return { x: 0, y: SOURCE_HALL_END_Y - 28 };
  }

  function inLandscape(x, y) {
    if (![CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return false;
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    const progress=state.phase===CHUNK_SURF_PHASE.TRANSFORMING?clamp01(transformElapsed/SOURCE_TRANSFORM_SECONDS):1;
    const revealedDepth=LANDSCAPE_H*clamp01((progress-.12)/.88);
    return lx >= -LANDSCAPE_W / 2 && lx <= LANDSCAPE_W / 2 && ly <= LANDSCAPE_FRONT && ly >= -revealedDepth;
  }

  // Out past the perimeter. Its own box, because the field's is 340 deep and the
  // tape is 512 — which is also why the horizon does NOT join the anchored plan
  // list in renderPlanFor(): the 384 window has to follow the body out here the
  // way it followed him down the hall.
  // THE WALK FOLLOWS THE PICTURE.
  //
  // This used to be a hard axis-aligned box — a 512-cell tube of fixed width —
  // which is why the horizon was two minutes of holding one key. The data
  // comment on halfWidth has always said the edge is "soft, a wash, not a wall"
  // and the implementation has never been anything of the sort.
  //
  // It is the recording's shape now. HORIZON_PROFILE carries, per slice, where
  // the picture's bright mass sits across the corridor and how wide its
  // substance actually is — both measured off the shipped bake. The walkable
  // ground is centred on the light and reaches as far as the picture does, so
  // the route drifts as the recording drifts, and where the tape has little
  // left to show there is correspondingly little to stand on.
  //
  // Beyond it is not a wall. It is the end of the picture, and there is nothing
  // out there at all — see horizonEdge() for what the approach feels like.
  function horizonBand(ly) {
    const depth = Math.max(0, Math.min(SOURCE_HORIZON.length, SOURCE_HORIZON.from - ly));
    const at = depth / SOURCE_HORIZON.sliceMetres;
    const i = Math.max(0, Math.min(HORIZON_PROFILE.slices - 1, Math.floor(at)));
    const j = Math.min(HORIZON_PROFILE.slices - 1, i + 1);
    const t = at - i;
    const lerp = (arr) => arr[i] + (arr[j] - arr[i]) * t;
    // Tape units and runtime cells run 1:1 along the tape; across it the
    // corridor is mapped onto the picture, so the profile's units come back
    // through the same scale (see r3d's HORIZON_LATERAL_SCALE).
    const centre = lerp(HORIZON_PROFILE.com) / HORIZON_LATERAL_SCALE;
    // A PATH THROUGH THE PICTURE, NOT THE WHOLE OF IT.
    //
    // Taking the full width of the recording's substance gave a corridor 80 to
    // 96 cells across, and against that the drift is nothing: you could hold one
    // key down the middle and never touch an edge, which is the straight walk
    // this was supposed to stop being.
    //
    // Narrow enough that the wander has to be steered, wide enough that
    // steering is not a tightrope: the body walks in the lit part of the frame
    // and the recording continues past it on both sides, which is the right
    // relationship anyway. You are inside the picture, not filling it.
    const reach = Math.max(HORIZON_MIN_HALF_WIDTH,
      Math.min(HORIZON_MAX_HALF_WIDTH, lerp(HORIZON_PROFILE.spread) * 0.62 / HORIZON_LATERAL_SCALE));
    return { centre, reach, mosh: lerp(HORIZON_PROFILE.mosh), lum: lerp(HORIZON_PROFILE.lum) };
  }

  // How far outside the picture the body is, 0 inside and 1 at the last step it
  // is allowed. The renderer and the score both want this: walking out of the
  // recording should be felt before it is refused.
  function horizonEdge(x, y) {
    const o = landscapeOrigin();
    const band = horizonBand(y - o.y);
    const over = Math.abs((x - o.x) - band.centre) - band.reach;
    return Math.max(0, Math.min(1, over / HORIZON_EDGE_FADE + 1));
  }

  function inHorizon(x, y) {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return false;
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    if (ly > SOURCE_HORIZON.from || ly < SOURCE_HORIZON.to) return false;
    const band = horizonBand(ly);
    return Math.abs(lx - band.centre) <= band.reach;
  }

  function horizonCell(x, y) {
    if (!inHorizon(x, y)) return null;
    // Flat, open, and unlit by anything the building owns. No ceiling: what is
    // overhead is the tape, and the tape is drawn by the splat pass, not by a
    // cell. See horizon3d.js.
    return {
      floor: SOURCE_TIER_BY_ID.horizon.height,
      ceil: HALL_CEIL * 4,
      flags: 0,
      zone: ZONE.none,
      material: MATERIAL.none,
      sourceHorizon: true,
    };
  }

  function routeEnabled(route) {
    // Exploration-first: no action gates movement. Every causeway — spine, both
    // optional loops, the final causeway — is walkable from the moment the field
    // opens. You wander and read the source as you go; tuning a landmark is
    // optional lore and evidence toward the rare fifth ending, never a key that
    // unlocks the ground under your feet.
    return !!route;
  }

  function landmarkPadEnabled(point) {
    for (const [id, landmark] of Object.entries(LANDMARK_OFFSETS)) {
      if (Math.hypot(point.x - landmark.x, point.y - landmark.y) <= LANDMARK_PAD_RADIUS) return available(id);
    }
    return false;
  }

  function landscapeCell(x, y) {
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    // The whole opened field is one walkable ground — free roam, Oblivion-style,
    // no invisible causeway walls carving the space into corridors. The routes
    // survive only as brighter path material for wayfinding, not as the edges of
    // the floor. The only wall is the field's own perimeter (rendered as visible
    // code, see perimeterWallInstances); beyond it is sky.
    if (!inLandscape(x, y)) return null;
    const landing = sourceLandingCellAt(lx, ly);
    if (landing?.owned) {
      if (landing.solid) return null;
      return {
        floor: landing.floor,
        ceil: landing.ceil,
        flags: landing.flags,
        zone: landing.zone,
        material: landing.material,
        sourceLanding: true,
      };
    }
    // Only the room itself may project behind the field edge. Without this
    // shared terrain carve-out, the otherwise open Source ground wraps around
    // both side walls and reaches the sealed rear of the get-in.
    if (ly > SOURCE_LANDING_FIELD_EDGE_LOCAL_Y) return null;
    if ([CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)
        && sourceStructureCollisionAt(structures, lx, ly)) return null;
    const floor = sourceLandscapeFloorAt(lx, ly);
    return { floor, ceil: floor + 22, flags: F.SKY, zone: ZONE.sourceSpace, material: materialAtLandscape(lx, ly) };
  }

  function hallCellDescriptor() {
    const transformCode = state.phase === CHUNK_SURF_PHASE.TRANSFORMING
      && transformElapsed > SOURCE_TRANSFORM_SECONDS * 0.45;
    return {
      floor: 0,
      ceil: HALL_CEIL,
      flags: 0,
      zone: ZONE.sourceSpace,
      material: transformCode ? MATERIAL.sourcePage : MATERIAL.serviceConcrete,
    };
  }

  function hallVisibleInPhase() {
    return ![CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase);
  }

  function physicalHallCell(x, y) {
    if (!hallVisibleInPhase()) return null;
    if (Math.abs(x) > HALL_HALF_WIDTH || y > 3) return null;
    // BODY CONTRACT: 112 m is the end. This line never moves with the player or
    // with haystackOrigin, and no HAYSTACK state opens more traversable corridor.
    if (y < SOURCE_HALL_END_Y) return null;
    return hallCellDescriptor();
  }

  function visualHallCell(x, y) {
    if (!hallVisibleInPhase()) return null;
    if (Math.abs(x) > HALL_HALF_WIDTH || y > 3) return null;
    // EYE CONTRACT: there is deliberately no forward bound. The finite render
    // plan/far plane is the only limit, so the hall appears to continue beyond
    // the physical line without creating navigation, collision, or objectives.
    return hallCellDescriptor();
  }

  function physicalCellAt(x, y) {
    return bellsCell(x, y) || horizonCell(x, y) || landscapeCell(x, y) || physicalHallCell(x, y);
  }

  function renderCellAt(x, y) {
    return bellsCell(x, y) || horizonCell(x, y) || landscapeCell(x, y) || visualHallCell(x, y);
  }

  // Internal navigation/pathfinding keeps using this alias. Rendering does not.
  const cellAt = physicalCellAt;

  function sourceLayerAtWorld(x,y,cell){
    if(!cell||cell.material<MATERIAL.sourceField)return 0;
    const o=landscapeOrigin(),lx=x-o.x,ly=y-o.y;
    let nearest=null;
    for(const point of Object.values(LANDMARK_OFFSETS)){
      const distance=Math.hypot(lx-point.x,ly-point.y);
      if(!nearest||distance<nearest.distance)nearest={distance,sector:point.sector};
    }
    if(nearest&&nearest.distance<24)return SOURCE_LAYER_BY_SECTOR[nearest.sector]||1;
    return cell.material===MATERIAL.sourceFault?SOURCE_LAYER_BY_SECTOR.hush:SOURCE_LAYER_BY_SECTOR.hall;
  }

  const geometry = {
    id: 'source-space',
    cellAt: physicalCellAt,
    renderCellAt,
    isSolid: (x, y) => !physicalCellAt(x, y),
    canStep(fromX, fromY, toX, toY) {
      const from = physicalCellAt(fromX, fromY), to = physicalCellAt(toX, toY);
      if (!to) return {
        ok: false,
        why: hallVisibleInPhase() && Math.abs(toX) <= HALL_HALF_WIDTH && toY < SOURCE_HALL_END_Y
          ? 'source-hall-boundary'
          : 'wall',
      };
      if (to.ceil - to.floor < EYE + 0.2) return { ok: false, why: 'headroom' };
      if (from) {
        // THE ONE EXCEPTION. A tier boundary is taller than a step on purpose;
        // a lift is how you take it upward and a chute is how you take it
        // down, and there is no third way. Everything the level gates, it gates
        // here (see data/source-level.js).
        const o = landscapeOrigin();
        const via = sourceTraversal(
          fromX - o.x, fromY - o.y, toX - o.x, toY - o.y, from.floor, to.floor,
        );
        if (via.ok) return {
          ok: true,
          floor: to.floor,
          via: via.via,
          feature: via.id,
          ride: via.dir || null,
          travel: via.travel || null,
          fromTier: via.fromTier || null,
          toTier: via.toTier || null,
        };
        const fromFeature=sourceFeatureAt(fromX-o.x,fromY-o.y);
        const toFeature=sourceFeatureAt(toX-o.x,toY-o.y);
        if(fromFeature?.kind==='chute'||toFeature?.kind==='chute')return{ok:false,why:'one-way chute'};
        // A lift's deck is ordinary walkable floor on either landing. Only the
        // forbidden downward tier crossing is one-way; treating the whole
        // capture rectangle as a wall traps the rider on arrival.
        if(Math.abs(to.floor-from.floor)<=0.45)return{ok:true,floor:to.floor};
        if(fromFeature?.kind==='lift'||toFeature?.kind==='lift')return{ok:false,why:'one-way lift'};
        if (Math.abs(to.floor - from.floor) > 0.45) return { ok: false, why: 'too high' };
      }
      return { ok: true, floor: to.floor };
    },
    floorAt: (x, y) => physicalCellAt(x, y)?.floor ?? 0,
    renderedFloorAt: () => traversal?.floor ?? physicalCellAt(player.x, player.y)?.floor ?? 0,
    ceilAt: (x, y) => physicalCellAt(x, y)?.ceil || HALL_CEIL,
    zoneAt: (x, y) => physicalCellAt(x, y)?.zone || ZONE.none,
    materialAt: (x, y) => physicalCellAt(x, y)?.material || MATERIAL.none,
    worldAt: () => 'source_space',
    areaLabelAt: () => 'source space',
    logicalToPhysical: (x, y) => ({ x, z: y, y: physicalCellAt(x, y)?.floor ?? 0, layer: 'source', spaceId: 'source-space', renderGroup: 'source-space' }),
    renderPlanFor(x, y) {
      const half = SOURCE_PLAN_WINDOW / 2;
      const anchored = [CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase);
      const landscapePlan = anchored ? sourceLandscapePlanOrigin(landscapeOrigin()) : null;
      const originX = landscapePlan?.x ?? Math.floor((x - half) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP;
      const originY = landscapePlan?.y ?? Math.floor((y - half) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP;
      const o = landscapeOrigin();
      const key = `${state.phase}:${state.pageStage}:${o.x}:${o.y}:${originX}:${originY}`;
      if (lastPlan?.key === key) return lastPlan;
      const size = SOURCE_PLAN_WINDOW;
      const rgba = new Uint8Array(size * size * 4);
      const material = new Uint8Array(size * size);
      const sourceLayer = new Uint8Array(size * size);
      for (let py = 0; py < size; py += 1) for (let px = 0; px < size; px += 1) {
        const c = renderCellAt(originX + px + 0.5, originY + py + 0.5), i = py * size + px;
        if (!c) { rgba[i * 4 + 2] = F.SOLID; continue; }
        rgba[i * 4] = encodeH(c.floor);
        rgba[i * 4 + 1] = encodeH(c.ceil);
        rgba[i * 4 + 2] = c.flags;
        rgba[i * 4 + 3] = c.zone;
        material[i] = c.material;
        sourceLayer[i] = sourceLayerAtWorld(originX+px+.5,originY+py+.5,c);
      }
      lastPlan = { rgba, material, sourceLayer, w: size, h: size, originX, originY, group: 'source-space', key };
      return lastPlan;
    },
  };

  function haystackCheckpoint() {
    return { x: 0, y: SOURCE_HALL_END_Y + 5, facing: 0 };
  }

  function landingWorld(local = SOURCE_LANDING_ENTRY_LOCAL) {
    const o = landscapeOrigin();
    return { x: o.x + local.x, y: o.y + local.y, facing: 0 };
  }

  function tierCheckpointId(tierId) { return `landing-${tierId}`; }

  function tierCheckpoint(tierId) {
    const o = landscapeOrigin();
    if (tierId === 'arrival') return landingWorld();
    if (tierId === 'fork') return { x: o.x, y: o.y - 48, facing: 0 };
    if (tierId === 'trace') return { x: o.x, y: o.y - 128, facing: 0 };
    if (tierId === 'return') return { x: o.x, y: o.y - 228, facing: 0 };
    // Just over the seam, facing in. Far enough that the field is behind him and
    // he cannot walk back out of it by accident.
    if (tierId === 'horizon') return { x: o.x, y: o.y + SOURCE_HORIZON.from - SOURCE_HORIZON.entryStandoff, facing: 0 };
    return landingWorld();
  }

  function checkpointPosition(id = state.checkpoint?.id || state.checkpointId) {
    if (id === 'hall-entry') return { x: SOURCE_ENTRY.x, y: SOURCE_ENTRY.y, facing: 0 };
    if (id === 'haystack-entry' || state.phase === CHUNK_SURF_PHASE.HAYSTACK) return haystackCheckpoint();
    if (id === 'landscape-entry' || id === 'landing-arrival') return landingWorld();
    if (id === 'landing-fork') return tierCheckpoint('fork');
    if (id === 'landing-trace') return tierCheckpoint('trace');
    if (id === 'landing-return') return tierCheckpoint('return');
    if (id === 'landing-horizon') return tierCheckpoint('horizon');
    const point = landmarkPoint(id);
    return point ? { x: point.x, y: point.y + 7, facing: 0 } : { x: SOURCE_ENTRY.x, y: SOURCE_ENTRY.y, facing: 0 };
  }

  function available() {
    // Every landmark is reachable and readable from the moment the field opens —
    // there is no unlock. The final ENCOUNTER is still paced (see onStep's
    // FINAL_REACHED, which only asks that you have wandered past Body Return), but
    // nothing stops you exploring the whole horizon before then.
    return true;
  }

  function protectMoment(seconds = 3) {
    protectionRemaining = Math.max(protectionRemaining, Math.max(0, Number(seconds) || 0));
  }

  function traversalFrame() {
    if (!traversal) return { active: false, grounded: true, locksMovement: false };
    return {
      active: true,
      grounded: false,
      locksMovement: true,
      kind: traversal.kind,
      id: traversal.id,
      progress: clamp01(traversal.elapsed / traversal.duration),
      x: traversal.x,
      y: traversal.y,
      floor: traversal.floor,
      fromTier: traversal.fromTier,
      toTier: traversal.toTier,
    };
  }

  function beginTraversal({ move = null, from = player } = {}) {
    if (traversal || pendingContact || !move?.via || !move.feature) return { handled: false, frame: traversalFrame() };
    const o = landscapeOrigin();
    const local = { x: Number(from.x) - o.x, y: Number(from.y) - o.y };
    const startFloor = geometry.floorAt(from.x, from.y);
    if (move.via === 'lift') {
      const lift = sourceLiftById(move.feature);
      if (!lift || move.travel !== 'up') return { handled: false, frame: traversalFrame() };
      const lower = SOURCE_TIER_BY_ID[lift.from]?.height ?? startFloor;
      const upper = SOURCE_TIER_BY_ID[lift.to]?.height ?? startFloor;
      const targetLocalY = lift.y - (lift.depth + 1.25);
      const targetLocalX = clamp(local.x, lift.x - lift.halfWidth + 0.75, lift.x + lift.halfWidth - 0.75);
      const targetFloor = upper;
      const travelSeconds = Math.min(1.6, Math.abs(targetFloor - startFloor) / 5.5 + 0.4);
      traversal = {
        kind: 'lift', id: lift.id, elapsed: 0, duration: travelSeconds,
        launch: 0.18, settle: 0.22,
        start: { x: Number(from.x), y: Number(from.y), floor: startFloor },
        end: { x: o.x + targetLocalX, y: o.y + targetLocalY, floor: targetFloor },
        x: Number(from.x), y: Number(from.y), floor: startFloor,
        fromTier: move.fromTier || lift.from,
        toTier: move.toTier || lift.to,
      };
    } else if (move.via === 'chute') {
      const chute = sourceChuteById(move.feature);
      if (!chute) return { handled: false, frame: traversalFrame() };
      const endLocal = {
        x: chute.x + chute.dir.x * (chute.run - 1),
        y: chute.y + chute.dir.y * (chute.run - 1),
      };
      const targetFloor = SOURCE_TIER_BY_ID[chute.to]?.height ?? sourceLandscapeFloorAt(endLocal.x, endLocal.y);
      const gravityTime = Math.sqrt((2 * Math.max(0.1, startFloor - targetFloor)) / 12);
      traversal = {
        kind: 'chute', id: chute.id, elapsed: 0, duration: clamp(gravityTime, 0.55, 1.1),
        start: { x: Number(from.x), y: Number(from.y), floor: startFloor },
        end: { x: o.x + endLocal.x, y: o.y + endLocal.y, floor: targetFloor },
        x: Number(from.x), y: Number(from.y), floor: startFloor,
        fromTier: chute.from,
        toTier: chute.to,
      };
    } else return { handled: false, frame: traversalFrame() };
    protectMoment(traversal.duration + 0.35);
    return { handled: true, frame: traversalFrame() };
  }

  function tickTraversal(dt) {
    if (!traversal) return { active: false, completed: false, frame: traversalFrame() };
    const ride = traversal;
    ride.elapsed = Math.min(ride.duration, ride.elapsed + Math.max(0, Number(dt) || 0));
    const raw = clamp01(ride.elapsed / ride.duration);
    let travelT = raw;
    if (ride.kind === 'lift') {
      const launchT = ride.launch / ride.duration;
      const settleT = 1 - ride.settle / ride.duration;
      travelT = smoothstep(launchT, Math.max(launchT + 0.001, settleT), raw);
    }
    ride.x = ride.start.x + (ride.end.x - ride.start.x) * travelT;
    ride.y = ride.start.y + (ride.end.y - ride.start.y) * travelT;
    const baseFloor = ride.start.floor + (ride.end.floor - ride.start.floor) * travelT;
    // Constant Source gravity: horizontal progress is linear while vertical
    // displacement grows with t squared. The duration was derived from 12m/s²
    // above, then clamped only for authored feel/safety.
    ride.floor = ride.kind === 'chute'
      ? ride.start.floor + (ride.end.floor - ride.start.floor) * raw * raw
      : baseFloor;
    player = { ...player, x: ride.x, y: ride.y };
    if (raw < 1) return { active: true, completed: false, frame: traversalFrame() };
    traversal = null;
    player = { ...player, x: ride.end.x, y: ride.end.y };
    const checkpointId = tierCheckpointId(ride.toTier);
    if (ride.kind === 'lift') {
      dispatch({ type: 'SOURCE_LIFT_COMPLETED', id: ride.id, checkpointId }, { immediate: true });
      if (!state.landingWeatherSpent && ride.id === 'lift-fork') landingRainRemaining = Math.max(landingRainRemaining, 12);
    } else {
      dispatch({ type: 'CHECKPOINT_SET', id: checkpointId }, { immediate: true });
    }
    restartGraceRemaining = Math.max(restartGraceRemaining, 0.6);
    const dropHeight=Math.max(0,ride.start.floor-ride.end.floor);
    return { active: false, completed: true, kind: ride.kind, id: ride.id, dropHeight, impact:clamp01(dropHeight/6.2), frame: traversalFrame(), position: { ...player } };
  }

  function sourceObjective() {
    const o = landscapeOrigin();
    const localPlayer = { x: player.x - o.x, y: player.y - o.y };
    let objective;
    if (state.phase === CHUNK_SURF_PHASE.HORIZON) {
      // OUT HERE THE OLD OBJECTIVE WAS A LIE.
      //
      // With no HORIZON branch this fell through to the final `else` and read
      // REACH THE FINAL HORIZON, pointed at `final-page` — a landmark BEHIND the
      // body, inside a field that stops existing the moment the phase changes.
      // There is one direction out here and no bearing to take: the objective is
      // the walk itself.
      const depth = sourceHorizonDepth(player.y - o.y);
      objective = {
        id: 'horizon-walk',
        label: 'WALK THE TAPE',
        target: null,
        bearingEligible: false,
        horizonDepth: depth,
        horizonProgress: Math.max(0, Math.min(1, depth / SOURCE_HORIZON.length)),
      };
    } else if (state.phase === CHUNK_SURF_PHASE.HALL) {
      objective = { id: 'long-hall', label: 'FOLLOW THE PAPER FIELD', target: { x: 0, y: -(SOURCE_HALL_END_METRES / CELL) }, bearingEligible: false };
    } else if (state.phase === CHUNK_SURF_PHASE.HAYSTACK) {
      objective = { id: 'still-page', label: 'FIND THE STILL PAGE', target: haystackPagePoint(), bearingEligible: true };
    } else if (state.phase === CHUNK_SURF_PHASE.TRANSFORMING || !state.firstLiftCompleted) {
      const outside = localPlayer.y <= SOURCE_LANDING_OPENING_LOCAL.y + 2;
      objective = outside
        ? { id: 'first-lift', label: 'ENTER THE RISING SOURCE', target: { x: o.x, y: o.y - 40 }, bearingEligible: true }
        : { id: 'leave-get-in', label: 'LEAVE THE GET-IN', target: landingWorld(SOURCE_LANDING_OPENING_LOCAL), bearingEligible: true };
    } else if (state.phase === CHUNK_SURF_PHASE.FINAL && state.finalEncounter.status !== SOURCE_FINAL_STATUS.RESOLVED) {
      objective = {
        id: sourceBossExposed(state.sourceContacts) ? 'return-paths' : 'normal-exit',
        label: sourceBossExposed(state.sourceContacts) ? 'CHOOSE A RETURN PATH' : 'LEAVE THE SOURCE',
        target: landmarkPoint('final-page'),
        bearingEligible: false,
      };
    } else if (state.phase === CHUNK_SURF_PHASE.COMPLETED) {
      objective = { id: 'tower-crossing', label: 'MOVE FORWARD INTO THE TOWER', target: landmarkPoint('final-page'), bearingEligible: false };
    } else {
      objective = { id: 'final-horizon', label: 'REACH THE FINAL HORIZON', target: landmarkPoint('final-page'), bearingEligible: true };
    }
    const distance = objective.target ? Math.hypot(player.x - objective.target.x, player.y - objective.target.y) : null;
    const evidenceTags=new Set(state.profile?.evidenceTags||[]);
    const knownLandmarks=[
      ...(evidenceTags.has('student-performance')?['surfer-origin']:[]),
      ...(evidenceTags.has('contract-inheritance')?['work-order-loop']:[]),
      ...(evidenceTags.has('borrowed-body')?['body-room']:[]),
    ];
    return {
      schema: SOURCE_OBJECTIVE_CONTRACT_VERSION,
      ...objective,
      bearing: objective.bearingEligible ? compassBearing(player, objective.target) : null,
      distance: Number.isFinite(distance) ? distance : null,
      distanceMeters: Number.isFinite(distance) ? distance * CELL : null,
      alignmentPulse: noProgressSeconds >= 6,
      knownLandmarks,
      coherentRoute:state.profile?.sourceGuidance
        ? ['surfer-origin','work-order-loop','recordist-loop','body-room']
        : [],
      tier: [CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE,
        CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)
        ? sourceTierAt(localPlayer.y).id : null,
      altitude: [CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE,
        CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)
        ? sourceLandscapeFloorAt(localPlayer.x, localPlayer.y) : null,
      bossExposed: sourceBossExposed(state.sourceContacts),
    };
  }

  function nearProtectedMoment() {
    if (traversal || pendingContact || !state.firstLiftCompleted) return true;
    if ([CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return true;
    if (state.phase !== CHUNK_SURF_PHASE.LANDSCAPE) return false;
    return Object.keys(LANDMARK_OFFSETS).some((id) => {
      const point = landmarkPoint(id);
      return point && Math.hypot(player.x - point.x, player.y - point.y) <= LANDMARK_PAD_RADIUS;
    });
  }

  function sourceBracketFrame() {
    return buildSourceBracketFrame({
      hallMaxDistance: state.hallMaxDistance,
      player,
      cellMetres: CELL,
      enabled: [CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase),
    });
  }

  function sourceLandingHushFrame() {
    const active = [CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE].includes(state.phase)
      && !state.firstLiftCompleted;
    const point = landingWorld(SOURCE_LANDING_HUSH_LOCAL);
    return {
      active,
      safe: true,
      rear: {
        visible: active,
        x: point.x,
        y: point.y,
        strength: 0.96,
      },
    };
  }

  function hushMode() {
    const hallSearch = state.phase === CHUNK_SURF_PHASE.HALL
      && state.hallMaxDistance >= SOURCE_SEARCH_START_METRES;
    const haystackHunt = state.phase === CHUNK_SURF_PHASE.HAYSTACK;
    const searchActive = hallSearch || haystackHunt;
    const bracket = sourceBracketFrame();
    const landing = sourceLandingHushFrame();
    const protectedMoment = protectionRemaining > 0 || restartGraceRemaining > 0 || nearProtectedMoment();

    // SEARCH/HAYSTACK is a bracket, not a chase. The rear body keeps pace under
    // authored tableau control and the forward body is render-only. Neither is
    // allowed to resolve contact. Conventional Source pursuits remain available
    // later in the landscape through the serialized pursuitBeat.
    const laterPursuit = !bracket.active && !landing.active && state.firstLiftCompleted && !!state.pursuitBeat;
    const present = bracket.active || landing.active || state.hushStage !== CHUNK_SURF_HUSH_STAGE.ABSENT;
    const colliding = laterPursuit && !protectedMoment;
    return {
      mode: colliding ? 'pursuit' : present ? 'atmospheric' : 'absent',
      colliding,
      protected: protectedMoment,
      pursuitBeat: laterPursuit ? state.pursuitBeat : null,
      haystackHunt,
      hallSearch,
      searchActive,
      bracketActive: bracket.active,
      landingTableau: landing.active,
      rearPace: bracket.active,
      frontManifestation: bracket.front.visible,
      restartGrace: restartGraceRemaining,
      grounded: !traversal,
    };
  }

  function latchedRain(raw, minimum = 0) {
    const value = clamp01(raw);
    if (value > 0.001) rainLatched = true;
    return rainLatched ? Math.max(clamp01(minimum), value) : value;
  }

  function refreshStandingPressure() {
    standingPressure = Math.max(
      standingPressure,
      sourceStandingPressure({
        hallMaxDistance: state.hallMaxDistance,
        searchElapsed,
      }),
    );
    return standingPressure;
  }

  function pressureFrame({ reducedMotion = false } = {}) {
    if (state.phase === CHUNK_SURF_PHASE.HAYSTACK) {
      const standing = refreshStandingPressure();
      const pressure = clamp(
        standing + clamp01(haystackReadImpulse) * 0.08,
        0,
        SOURCE_HAYSTACK.maxPressure,
      );
      const authoredPressure = Math.max(SOURCE_HAYSTACK.entryPressure, pressure);
      const pressureT = clamp01(
        (authoredPressure - SOURCE_HAYSTACK.entryPressure)
          / Math.max(0.001, SOURCE_HAYSTACK.maxPressure - SOURCE_HAYSTACK.entryPressure),
      );
      const rawRain = haystackRainFrame({ elapsed: searchElapsed, pressure: authoredPressure, seed: state.seed });
      return {
        phase: state.phase,
        elapsed: phaseElapsed,
        searchElapsed,
        searchActive: true,
        standingPressure: standing,
        pressure,
        fearFloor: clamp01(standing * 0.72),
        movementMultiplier: haystackMovementMultiplier(authoredPressure),
        fear: haystackFearFrame(authoredPressure),
        // Once precipitation has arrived it may surge and recede, but it never
        // returns to dry until the real page is taken.
        rain: latchedRain(rawRain, 0.48 + pressureT * 0.18),
        rainLatched,
        mosh: haystackMoshFrame({
          elapsed: searchElapsed,
          seed: state.seed,
          pressure: authoredPressure,
          wrongReadImpulse: haystackReadImpulse,
          reducedMotion,
        }),
        wrongReads: haystackWrongReads,
        wrongReadImpulse: haystackReadImpulse,
        noProgressSeconds,
      };
    }

    if (state.phase === CHUNK_SURF_PHASE.HALL) {
      const depth = clamp01((state.hallMaxDistance || 0) / SOURCE_HALL_END_METRES);
      const searching = searchSpanActiveFor(state);
      const standing = refreshStandingPressure();
      const authoredPressure = Math.max(SOURCE_HAYSTACK.entryPressure, standing);
      const rawRain = hallRainFrame({
        elapsed: phaseElapsed,
        distanceMetres: state.hallMaxDistance,
        seed: state.seed,
      });
      const hallRainFloor = 0.16 + depth * 0.22;
      return {
        phase: state.phase,
        elapsed: phaseElapsed,
        searchElapsed,
        searchActive: searching,
        standingPressure: standing,
        pressure: standing,
        fearFloor: clamp01(standing * 0.72),
        movementMultiplier: searching
          ? Math.max(1 + depth * 1.10, 2.08 + smoothstep(0, 18, searchElapsed) * 0.12)
          : 1 + depth * 1.10,
        // The final quarter of the tunnel is already SEARCH. It gets the same
        // authored cadence as the haystack and carries straight through the phase
        // transition instead of dropping back to a softer beat.
        fear: searching ? haystackFearFrame(authoredPressure) : null,
        rain: latchedRain(rawRain, hallRainFloor),
        rainLatched,
        mosh: searching
          ? haystackMoshFrame({
            elapsed: searchElapsed,
            seed: state.seed,
            pressure: authoredPressure,
            wrongReadImpulse: haystackReadImpulse,
            reducedMotion,
          })
          : { active: false, amount: 0, cycle: -1 },
        wrongReads: haystackWrongReads,
        wrongReadImpulse: haystackReadImpulse,
        noProgressSeconds,
      };
    }

    const landingWeatherActive = !state.landingWeatherSpent
      && [CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase);
    const landingRain = landingWeatherActive
      ? (state.firstLiftCompleted ? clamp01(landingRainRemaining / 12) : 1)
      : 0;
    return {
      phase: state.phase,
      elapsed: phaseElapsed,
      searchElapsed,
      searchActive: false,
      standingPressure: 0,
      pressure: 0,
      fearFloor: 0,
      // THE TAPE IS WALKED, NOT CROSSED.
      //
      // The horizon is 512 cells and the legs run one cell per 90ms, so the
      // crossing took about forty-five seconds — and the piece hung on it is
      // two hundred and fifty-nine. Position IS the playhead out here, so a
      // sprint does not skip the score, it plays it at five and a half times
      // speed: nobody had ever heard the recording they were walking through.
      // It also pinned the score's one expressive parameter, the velocity bend,
      // hard against its clamp for the whole walk.
      //
      // Slower legs fix all of it at once — the piece is mostly heard, the bend
      // becomes expressive again, and the picture gets time to be looked at.
      // The same mechanism the hall and the haystack use; see
      // currentMoveIntervalMs.
      movementMultiplier: state.phase === CHUNK_SURF_PHASE.HORIZON ? HORIZON_PACE : 1,
      fear: null,
      rain: landingRain,
      rainLatched: landingRain > 0,
      mosh: { active: false, amount: 0, cycle: -1 },
      wrongReads: haystackWrongReads,
      wrongReadImpulse: 0,
      noProgressSeconds,
    };
  }

  function sourceLook() {
    const o = landscapeOrigin();
    const depth = Math.max(0, o.y - player.y);
    const approach = smoothstep(270, 318, depth);
    const resolved = state.finalEncounter.status === SOURCE_FINAL_STATUS.RESOLVED || state.phase === CHUNK_SURF_PHASE.COMPLETED;
    const understood = normalizeSourceContactState(state.sourceContacts).insights.length;
    return {
      sunrise: resolved ? 1 : approach,
      chroma: Math.max(0.18, 1 - approach * 0.72 - understood * 0.1),
      paper: resolved ? 1 : smoothstep(286, 318, depth),
      intervalStability: understood / 3,
    };
  }

  function finalEncounterRequest() {
    if (state.phase !== CHUNK_SURF_PHASE.FINAL || state.finalEncounter.status !== SOURCE_FINAL_STATUS.READY) return null;
    const final = landmarkPoint('final-page');
    if (!final || Math.hypot(player.x - final.x, player.y - final.y) > 12) return null;
    const exposed = sourceBossExposed(state.sourceContacts);
    // The rig no longer decides whether there is a fight. It decides how badly
    // it goes — see applyRigAdvantage() — and it still decides whether a win can
    // reach the rescue, because inverting the contract is what the rig is for.
    const rigAvailable = !!state.profile?.bestEligible;
    const hurtBefore = state.injuriesAtEntry >= 1;
    const available = sourceBossAvailable(state);
    const bodyReturnAssist = state.visited.includes('body-room');
    return {
      schema: 3,
      id: 'source-final',
      adapter: available
        && state.finale?.route === SOURCE_FINALE_ROUTE.CONTACT
        && state.finale?.stage === SOURCE_FINALE_STAGE.CONTACT_COMMITTED
        && bossRequested ? 'combat-v1' : null,
      outcomes: Object.values(SOURCE_FINAL_OUTCOME),
      exposed,
      hurtBefore,
      rigAvailable,
      bodyReturnAssist,
      battleAvailable: available,
      normalExitAvailable: true,
      rescueEligible: available && rigAvailable,
      compatibility: { redactions: REDACTIONS.map(({ id, sourceAnchor }) => ({ id, sourceAnchor })) },
    };
  }

  function requestBossBattle() {
    const exposed = sourceBossExposed(state.sourceContacts);
    const hurtBefore = state.injuriesAtEntry >= 1;
    if (!sourceBossAvailable(state)) return { handled: true, available: false, exposed, hurtBefore };
    if (state.finale?.route && state.finale.route !== SOURCE_FINALE_ROUTE.CONTACT) {
      return { handled: true, available: false, exposed, hurtBefore, committed: state.finale.route };
    }
    return { handled: true, available: true, warning: true, request: finalEncounterRequest() };
  }

  function commitContact() {
    const exposed = sourceBossExposed(state.sourceContacts);
    const hurtBefore = state.injuriesAtEntry >= 1;
    if (!sourceBossAvailable(state)) return { handled: true, available: false, exposed, hurtBefore };
    dispatch({ type: 'CONTACT_COMMITTED' }, { immediate: true });
    if (state.finale?.route !== SOURCE_FINALE_ROUTE.CONTACT) {
      return { handled: false, available: false, exposed, hurtBefore };
    }
    bossRequested = true;
    protectMoment(30);
    return { handled: true, available: true, request: finalEncounterRequest() };
  }

  // Walking away from the fault no longer ends the chapter — it ends the FIELD.
  // The reading is the same (contain, comfort) and the dossier still gets it,
  // but the way out is over the seam and onto the tape. onComplete does not fire
  // here; it fires at an exit, in chooseHorizonExit().
  function completeNormalExit() {
    if (state.phase !== CHUNK_SURF_PHASE.FINAL) return { handled: false, state };
    dispatch({ type: 'SOURCE_NORMAL_EXIT' }, { immediate: true });
    return enteredHorizon();
  }

  function resolveFinalEncounter(result = {}) {
    bossRequested = false;
    dispatch({ type: 'FINAL_ENCOUNTER_RESOLVED', result }, { immediate: true });
    if (state.finalEncounter.status !== SOURCE_FINAL_STATUS.RESOLVED) return { handled: false, state };
    dispatch({ type: 'SOURCE_COMPLETED' }, { immediate: true });
    if (!completionSent) {
      completionSent = true;
      onComplete(chunkSurfCompletion(state), exitSnapshot());
    }
    protectMoment(30);
    return { handled: true, state, completion: chunkSurfCompletion(state) };
  }

  // Losing used to cost one tier of altitude and two and a half seconds, which
  // is another way of saying it cost nothing. It costs the chapter now: it
  // submits on your behalf, and the way out of the room you lost in is forward.
  function failFinalEncounter() {
    bossRequested = false;
    dispatch({ type: 'FINAL_ENCOUNTER_LOST' }, { immediate: true });
    if (state.finale?.stage !== SOURCE_FINALE_STAGE.RESOLVED) return { handled: false, state };
    if (!completionSent) {
      completionSent = true;
      onComplete(chunkSurfCompletion(state), exitSnapshot());
    }
    protectMoment(30);
    return { handled: true, state, completion: chunkSurfCompletion(state) };
  }

  // Shared tail of both roads out. The body is put over the seam rather than
  // walked there, because the field behind it is finished and re-entering it
  // would be walking back into a chapter that has already closed.
  function enteredHorizon() {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return { handled: false, state };
    const entry = checkpointPosition('landing-horizon');
    setPlayerPosition({ x: entry.x, y: entry.y, facing: entry.facing || 0 });
    protectMoment(30);
    protectionRemaining = Math.max(protectionRemaining, 30);
    restartGraceRemaining = Math.max(restartGraceRemaining, 10);
    return { handled: true, state, horizon: true, reason: state.horizon.reason, checkpoint: entry };
  }

  // THE HEAD THAT TALKS, AND WHERE IT STANDS.
  //
  // A third of the way in, and off to one side rather than across the path. He
  // is not a gate and he is not a checkpoint; he is a thing you can walk past
  // without ever finding out what he wanted, which is the only way the joke
  // works. Everything he offers costs ten minutes and he says so.
  const HORIZON_BUST_DEPTH = 168;
  // HE STANDS ON THE ROUTE, NOT BESIDE IT.
  //
  // He was a fixed twenty-six cells off the centre line, from when the corridor
  // was a straight tube and being off to one side was the whole of his staging.
  // With the walk following the picture that number means nothing — the path is
  // somewhere else by then — and the only authored beat in five hundred metres
  // was parked in the dark where nobody had a reason to go.
  //
  // Offset from the PATH instead: far enough off the middle of it that he is
  // passed rather than collided with, close enough that walking the tape walks
  // you to him.
  const HORIZON_BUST_OFFSET = -9;
  const horizonBustLateral = () =>
    horizonBand(SOURCE_HORIZON.from - HORIZON_BUST_DEPTH).centre + HORIZON_BUST_OFFSET;

  // Appended to the bust's patter, and only when the player was told. It never
  // becomes a fourth beat on its own: it lands on the last line, which is the
  // line that carries the offer.
  const HORIZON_BUST_RECOGNITION = Object.freeze(
    { who: 'you', text: 'The man in the yellow cagoule had this on a laminated map. One instrument, he said. He could not prove a word of it.' },
  );

  const HORIZON_BUST_LINES = Object.freeze({
    carried: Object.freeze([
      { who: 'direction', text: 'The weight in the case shifts. Two marble eyes strike the brass catches from inside.' },
      { who: 'bust', text: 'You carried sight out of the building. That is enough. I can show you what the bells are looking at.' },
      { who: 'bust', text: 'It is the longer way. The machinery moves whether you understand it or not, and at the end it will hear you.' },
    ]),
    returned: Object.freeze([
      { who: 'direction', text: 'Wet pupils open in the Horizon stone. They are the eyes you returned, looking here from the gallery.' },
      { who: 'bust', text: 'You gave sight back to its proper face. It has been looking through me ever since.' },
      { who: 'bust', text: 'I can show you what the bells are looking at. It is the longer way, and at the end it will hear you.' },
    ]),
  });

  // Where he stands, for anything that has to draw him.
  //
  // Depth passes straight through: one cell along the tape IS one tape unit,
  // because 512 cells and 512 tape units are both 256 slices. Lateral does not
  // — the corridor is wider than the picture — so the renderer scales it, and
  // this reports the raw offset rather than guessing at the mapping.
  function horizonBustPlacement() {
    const evidence = horizonBustEyeEvidence(state.profile?.marbleEyes);
    return {
      lateral: horizonBustLateral(),
      depth: HORIZON_BUST_DEPTH,
      eyes: !!state.finale?.bust?.recognized && evidence.eligible,
      eyeMode: evidence.mode,
    };
  }

  function horizonBustPoint() {
    const o = landscapeOrigin();
    return {
      x: o.x + horizonBustLateral(),
      y: o.y + SOURCE_HORIZON.from - HORIZON_BUST_DEPTH,
    };
  }

  // How much of his patter the body has stood still for. He is a distraction by
  // design: the offer is only made once he has been allowed to waste some.
  //
  // Deliberately not persisted: a reload puts him back at his first line, which
  // is the right behaviour for a bore whose whole function is to waste time you
  // have chosen to give him. What IS persisted is the exit he offers.
  let horizonBustBeat = 0;
  // WHERE THE RECORDING CHANGES.
  //
  // Read off the tape rather than chosen: the macroblock damage begins around
  // depth 42 and clears again around 358, so the crossing already has three
  // acts — clean, ruined, clean — with the bust standing inside the ruined one
  // and the collapse waiting past the end of it. Nothing had ever marked them,
  // so a walk with a shape played as a walk with none.
  //
  // Each fires once, on the step that crosses it.
  const HORIZON_MARKERS = Object.freeze([
    { id: 'damage-begins', depth: 42 },
    { id: 'damage-ends', depth: 358 },
  ]);
  const horizonMarkersSeen = new Set();
  let horizonMarkerPending = null;
  // Read and clear: the caller speaks it, and it must not be spoken twice.
  function takeHorizonMarker() {
    const marker = horizonMarkerPending;
    horizonMarkerPending = null;
    return marker;
  }

  // The furthest whole slice the body has reached, so HORIZON_ADVANCED fires
  // once per slice instead of once per footstep. Runtime-only; the durable
  // figure is state.horizon.maxDepth, which this feeds.
  let horizonDepthSlice = -1;

  function talkToHorizonBust() {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return { handled: false, state };
    const evidence = horizonBustEyeEvidence(state.profile?.marbleEyes);
    if (!evidence.eligible) {
      dispatch({ type: 'HORIZON_BUST_DECIDED', decision: 'declined' }, { immediate: true });
      return {
        handled: true,
        eligible: false,
        evidence,
        line: { who: 'bust', text: 'No. You saw what sight cost and left it where it was. Keep walking.' },
      };
    }
    dispatch({ type: 'HORIZON_BUST_RECOGNIZED', eligible: true }, { immediate: true });
    const lines = HORIZON_BUST_LINES[evidence.mode];
    horizonBustBeat = Math.min(lines.length, horizonBustBeat + 1);
    const last = horizonBustBeat >= lines.length;
    return {
      handled: true,
      eligible: true,
      evidence,
      beat: horizonBustBeat,
      line: lines[horizonBustBeat - 1],
      recognition: last && linkedChapels ? HORIZON_BUST_RECOGNITION : null,
      linkedChapels: !!linkedChapels,
      offers: last && !state.finale?.bust?.decision,
    };
  }

  function decideHorizonBust(accept = false) {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON || state.finale?.bust?.decision) return { handled: false, state };
    dispatch({ type: 'HORIZON_BUST_DECIDED', decision: accept ? 'accepted' : 'declined' }, { immediate: true });
    const decision = state.finale?.bust?.decision;
    return { handled: !!decision, accepted: decision === 'accepted', decision, state };
  }

  function takeHorizonBustDetour() {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON || state.finale?.bust?.decision !== 'accepted') return { handled: false, state };
    return chooseHorizonExit(HORIZON_EXIT.TOWER);
  }

  // Where he is on the tape, which is also when he is on it. The renderer, the
  // score and the bust all read this one frame.
  // Where the tail begins, as a fraction of the tape. One constant, so the
  // score's fade and the picture's collapse cannot drift apart again.
  const HORIZON_COLLAPSE_FROM = 0.88;
  // Picture half-width over corridor half-width, mirroring the renderer: the
  // profile is in tape units and the runtime walks in cells.
  const HORIZON_LATERAL_SCALE = 64 / 96;
  // The corridor never pinches below this, however little the tape has left —
  // a path that closes to a point is a soft-lock, not a mood. And never opens
  // past this, or the drift stops being something the legs have to answer.
  const HORIZON_MIN_HALF_WIDTH = 15;
  const HORIZON_MAX_HALF_WIDTH = 32;
  // How many cells of approach the edge is felt over.
  const HORIZON_EDGE_FADE = 18;
  // How much slower than an ordinary walk the tape is. One number, because the
  // right value is a matter of feel. Measured against the real base step of
  // ~46ms a cell over 506 cells:
  //
  //     1   ~23s   score at 11x   the old sprint
  //     6   ~140s  score at 1.9x  a walk, most of the piece heard
  //     11  ~259s  score at 1:1   the whole piece, exactly once
  //
  // Six, because the piece wants to be heard and four and a half minutes of
  // holding one key is a longer ask than anything else in the game makes.
  // THREE, NOT SIX.
  //
  // Six was chosen so the whole piece could be heard once, and it made the
  // crossing four and a half minutes of holding one key — which is a longer ask
  // than anything else in the game makes, and it read as slow rather than as
  // long. Three is about seventy seconds at a walk: most of the piece, a tape
  // that plays at roughly double speed, and a crossing whose middle act you are
  // still in rather than waiting out.
  const HORIZON_PACE = 3;
  // How far ahead the floor samples the corridor, in cells.
  const HORIZON_BAND_LOOKAHEAD = 110;
  const progress01 = (depth) => Math.max(0, Math.min(1, depth / SOURCE_HORIZON.length));

  function horizonFrame() {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return { active: false };
    const o = landscapeOrigin();
    const local = player.y - o.y;
    const slice = sourceHorizonSlice(local);
    const depth = sourceHorizonDepth(local);
    return {
      active: true,
      reason: state.horizon.reason,
      depth,
      progress: depth / SOURCE_HORIZON.length,
      seconds: sourceHorizonSeconds(local),
      slice: slice.index,
      sliceFraction: slice.fraction,
      lateral: player.x - o.x,
      // The tail of the piece is where the picture collapses. Nothing punishes
      // him for standing in it; it simply stops having anything left to show.
      collapsing: progress01(depth) > HORIZON_COLLAPSE_FROM,
      // AND THE SAME THING AS A RAMP, WHICH IS WHAT THE RENDERER ASKED FOR.
      //
      // The boolean above is what the score reads. The renderer reads
      // `collapse` — a 0..1 — and has done since it was written: it dims the
      // void by `1 - collapse*0.85` and fades every splat by `1 - collapse*0.92`.
      // Nothing ever set it, so `Number(undefined) || 0` pinned it at zero and
      // the authored blackout was audio-only. The score went quiet over a
      // picture that did not change.
      // How far out of the picture the body has wandered, 0..1. The edge of a
      // recording is not a wall and should not behave like one — it is the
      // place the recording stops having anything, and the approach to it
      // should darken and thin before the step is refused.
      edge: horizonEdge(player.x, player.y),
      band: horizonBand(local),
      // THE SAME BAND, A HUNDRED METRES ON. The floor draws the corridor
      // (horizon3d.js, horizonGround) and a corridor drawn only at the body's
      // own depth is a straight lane that snaps sideways as you walk. Two
      // samples and a lerp is enough to make the drift read as a bend.
      bandAhead: horizonBand(local - HORIZON_BAND_LOOKAHEAD),
      bandLookahead: HORIZON_BAND_LOOKAHEAD,
      collapse: HORIZON_COLLAPSE_FROM >= 1 ? 0
        : Math.max(0, Math.min(1, (progress01(depth) - HORIZON_COLLAPSE_FROM) / (1 - HORIZON_COLLAPSE_FROM))),
      // Declared rather than left to the renderer's `?? 1` default, so the one
      // place that decides how bright the tape is, is this one.
      exposure: 1,
    };
  }

  function chooseHorizonExit(exit) {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return { handled: false, state };
    dispatch({ type: 'HORIZON_EXIT_CHOSEN', exit }, { immediate: true });
    if (state.horizon.exit !== exit) return { handled: false, state };
    // THE TOWER ROAD DOES NOT END THE CHAPTER. It opens the bell passage, and
    // the chapter ends four hundred metres later, in a room. Nothing is
    // reported to main.js yet — there is nothing to transition to.
    if (state.phase === CHUNK_SURF_PHASE.BELLS) {
      enteredBells();
      return { handled: true, state, exit, entered: 'bells' };
    }
    if (!completionSent) {
      completionSent = true;
      onComplete(chunkSurfCompletion(state), exitSnapshot());
    }
    protectMoment(30);
    return { handled: true, state, exit, completion: chunkSurfCompletion(state) };
  }

  // ── THE BELL PASSAGE ──────────────────────────────────────────────────────
  //
  // Put over the seam rather than walked there, for the same reason the horizon
  // is: what is behind him is a recording that has finished with him.
  function enteredBells() {
    if (state.phase !== CHUNK_SURF_PHASE.BELLS) return { handled: false, state };
    const o = landscapeOrigin();
    setPlayerPosition({
      x: o.x,
      y: o.y + SOURCE_BELLS.from - SOURCE_BELLS.entryStandoff,
      facing: 0,
    });
    protectMoment(30);
    protectionRemaining = Math.max(protectionRemaining, 30);
    restartGraceRemaining = Math.max(restartGraceRemaining, 10);
    return { handled: true, state, bells: true };
  }

  // Everything the renderer and the score want to know about the crossing, in
  // one frame, the same shape the horizon reports.
  function bellsFrame() {
    if (state.phase !== CHUNK_SURF_PHASE.BELLS) return { active: false };
    const o = landscapeOrigin(), local = player.y - o.y;
    const depth = sourceBellsDepth(local);
    return {
      active: true,
      depth,
      progress: depth / SOURCE_BELLS.length,
      lateral: player.x - o.x,
      // How much of the room has arrived. The far end of the walk is a shape
      // getting closer and this is the whole of that beat.
      resolve: sourceBellsRoomResolve(local),
      // Metres still to walk. The audio bed rides this rather than a clock,
      // because a man who stops walking has stopped arriving.
      remaining: Math.max(0, SOURCE_BELLS.length - depth),
      atRoom: inSourceBellsRoom(player.x - o.x, local),
    };
  }

  function inBells(x, y) {
    if (state.phase !== CHUNK_SURF_PHASE.BELLS) return false;
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    if (ly > SOURCE_BELLS.from || ly < SOURCE_BELLS.to) return false;
    // Inside the room the walls are the bound; outside it the open ground is.
    if (ly <= SOURCE_BELLS.room.threshold) return Math.abs(lx) <= SOURCE_BELLS.room.halfX - 0.6;
    return Math.abs(lx) <= SOURCE_BELLS.halfWidth;
  }

  // Half-extent of a passage piece, by family. One number each is enough: there
  // is nothing out here that a centimetre matters in, and the alternative is
  // shipping a second set of hand-typed footprints that can disagree with the
  // meshes.
  function bellHalfExtent(entry) {
    const scale = Number(entry.scale) || 1;
    if (/tower_bell/.test(entry.mesh)) return 0.64 * scale;
    if (/tower_frame/.test(entry.mesh)) return 4.5 * scale;
    if (/tower_louvres/.test(entry.mesh)) return 3.0 * scale;
    if (/tower_wheel/.test(entry.mesh)) return 1.06 * scale;
    return 1.0 * scale;
  }

  // Local (landscape-relative) metres. Only the pieces that declared themselves
  // solid, and the room's walls only once the room has actually arrived —
  // otherwise the player collides with a building that is still 0.3 opaque.
  function bellPassageBlockedAt(lx, ly) {
    const resolve = sourceBellsRoomResolve(player.y - landscapeOrigin().y);
    const consider = resolve > 0.85
      ? [...SOURCE_BELL_PASSAGE, ...SOURCE_BELLS_ROOM]
      : SOURCE_BELL_PASSAGE;
    for (const entry of consider) {
      if (!entry.blocks) continue;
      const half = bellHalfExtent(entry);
      const dx = lx - entry.x, dy = ly - entry.y;
      if (Math.abs(dx) > half + 1 || Math.abs(dy) > half + 1) continue;
      const c = Math.cos(entry.yaw || 0), sn = Math.sin(entry.yaw || 0);
      const localX = dx * c - dy * sn, localY = dx * sn + dy * c;
      // Louvres are a wall: long one way, thin the other.
      const halfX = /tower_louvres/.test(entry.mesh) ? half : half;
      const halfY = /tower_louvres/.test(entry.mesh) ? 0.35 * (Number(entry.scale) || 1) : half;
      if (Math.abs(localX) <= halfX && Math.abs(localY) <= halfY) return entry;
    }
    return null;
  }

  function bellsCell(x, y) {
    if (!inBells(x, y)) return null;
    const o = landscapeOrigin();
    if (bellPassageBlockedAt(x - o.x, y - o.y)) return null;
    // Flat, open, and unlit by anything the building owns — the same ground the
    // tape stands on, because it is the same ground.
    return {
      floor: SOURCE_TIER_BY_ID.bells?.height ?? 15.2,
      ceil: null,
      solid: false,
      zone: ZONE.sourceSpace,
    };
  }

  // The commit. Walking through the missing wall is the only way it fires, and
  // it fires once.
  function enterBellsRoom() {
    if (state.phase !== CHUNK_SURF_PHASE.BELLS) return { handled: false, state };
    dispatch({ type: 'BELLS_ROOM_ENTERED' }, { immediate: true });
    if (state.phase !== CHUNK_SURF_PHASE.COMPLETED) return { handled: false, state };
    if (!completionSent) {
      completionSent = true;
      onComplete(chunkSurfCompletion(state), exitSnapshot());
    }
    protectMoment(30);
    return { handled: true, state, completion: chunkSurfCompletion(state) };
  }

  // THE SHEETS YOU CAN ACTUALLY READ.
  //
  // The hall used to be a hundred and twelve metres of scenery: sheets you
  // walked past, exactly one of which was secretly real, none of which could be
  // picked up. Walking that far past unreadable paper is a distance, not a beat.
  //
  // These are the floor-lying sheets from pageInstances (surface 3 and 4 of the
  // five-way split), addressed by the same seed, so a page you read stays the
  // page it was. The one that matters is still the one that does not move.
  function readablePages() {
    if (![CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) return [];
    const count = pageCount(state.hallMaxDistance);
    const out = [];
    for (let i = 1; i < count; i += 1) {
      if (i % 5 < 3) continue;                       // wall and ceiling sheets are out of reach
      const r0 = rand(state.seed, i, 101), r1 = rand(state.seed, i, 211);
      const reach = Math.max(36, Math.min(280, state.hallMaxDistance / CELL + 42));
      const candidate = {
        kind: 'source-sheet',
        id: `source-sheet-${i}`,
        index: i,
        x: (r1 - 0.5) * HALL_HALF_WIDTH * 1.72,
        y: -18 - r0 * reach,
      };
      // The visual paper field is allowed to continue through the impossible
      // corridor. Interaction is not: every readable fake remains on the
      // player's side of the physical boundary.
      if (candidate.y < SOURCE_HALL_END_Y) continue;
      out.push(candidate);
    }
    return out;
  }

  function focusAt(px, py, facing) {
    const candidates = [];
    if (state.phase === CHUNK_SURF_PHASE.HAYSTACK) candidates.push({
      kind: 'haystack-page', id: 'source-page', ...haystackPagePoint(), focusPriority: 10, focusRadius: 7,
    });
    candidates.push(...readablePages());
    if (state.phase === CHUNK_SURF_PHASE.HORIZON) {
      const bust = horizonBustPoint();
      // Radius widened with him: he is a monument standing on the route now, and
          // needing to be within eight cells of a thing that size to notice it is
          // a reticle problem, not a staging one.
          candidates.push({ kind: 'horizon-bust', id: 'horizon-bust', ...bust, focusPriority: 9, focusRadius: 20 });
      return (lastFocus = focusedCandidate(px, py, facing, candidates, 8));
    }
    if ([CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase)) {
      for (const id of Object.keys(LANDMARK_OFFSETS)) {
        if (state.phase === CHUNK_SURF_PHASE.FINAL && id === 'final-page') continue;
        const point = landmarkPoint(id);
        if (point) candidates.push({ kind: 'landmark', available: available(id), ...point });
      }
      if (state.phase === CHUNK_SURF_PHASE.FINAL) {
        const final = landmarkPoint('final-page');
        candidates.push({ kind: 'normal-exit', id: 'source-normal-exit', x: final.x - 5, y: final.y - 4, focusPriority: 8, focusRadius: 9 });
        if (sourceBossExposed(state.sourceContacts)) {
          candidates.push({
            kind: 'boss-fault', id: 'source-boss-fault', x: final.x + 5, y: final.y - 4,
            available: sourceBossAvailable(state), focusPriority: 9, focusRadius: 9,
          });
        }
      }
    }
    lastFocus = focusedCandidate(px, py, facing, candidates, state.phase === CHUNK_SURF_PHASE.HAYSTACK ? 6 : 8);
    if (state.armedRedaction && (lastFocus?.kind !== 'redaction' || lastFocus.id !== state.armedRedaction)) dispatch({ type: 'REDACTION_CANCELLED' });
    return lastFocus;
  }

  function onStep(from, to) {
    player = { ...player, ...to };
    if(captureMovementRequired){
      if(!captureMovementAnchor)captureMovementAnchor={x:Number(from.x),y:Number(from.y)};
      if(Math.hypot(Number(to.x)-captureMovementAnchor.x,Number(to.y)-captureMovementAnchor.y)>=1.5){
        captureMovementRequired=false;
        captureMovementAnchor=null;
      }
    }
    if (state.phase === CHUNK_SURF_PHASE.HORIZON) {
      // Furthest in, not current — walking back up the tape is allowed and is
      // most of the point, but it must not un-earn the ground he has decoded.
      const depth = sourceHorizonDepth(to.y - landscapeOrigin().y);
      // A SAVE PER FOOTSTEP IS NOT A CHECKPOINT.
      //
      // This dispatched on every step — eleven a second at pace — and every
      // dispatch runs setState, which calls onState, which commits the save.
      // What it was persisting is a monotone maxDepth that nothing reads back.
      // Only tell the store when the furthest point actually moves, and only in
      // whole slices, so the write rate follows the tape rather than the legs.
      for (const marker of HORIZON_MARKERS) {
        if (depth >= marker.depth && !horizonMarkersSeen.has(marker.id)) {
          horizonMarkersSeen.add(marker.id);
          horizonMarkerPending = marker.id;
        }
      }
      const slice = Math.floor(depth / SOURCE_HORIZON.sliceMetres);
      if (slice > horizonDepthSlice) {
        horizonDepthSlice = slice;
        dispatch({ type: 'HORIZON_ADVANCED', depth });
      }
      // THE DEFAULT EXIT IS DOING NOTHING. Walk far enough and the recording
      // runs out, and where it runs out is the nave. This is the exit that
      // cannot be missed, which is exactly why it is the one that costs nothing
      // and gives nothing — no bells, no advantage, just the way on.
      if (depth >= SOURCE_HORIZON.length - 1) chooseHorizonExit(HORIZON_EXIT.CHAPEL);
      return;
    }
    if (state.phase === CHUNK_SURF_PHASE.BELLS) {
      const local = { x: to.x - landscapeOrigin().x, y: to.y - landscapeOrigin().y };
      if (inSourceBellsRoom(local.x, local.y)) enterBellsRoom();
      return;
    }
    if (state.phase === CHUNK_SURF_PHASE.HALL) {
      if (to.y > 1 && from.y <= 1) onScare({ reason: 'turned-back', at: { x: to.x, y: to.y } });
      // A retreat is a lived event, not a coordinate leak. Record only the
      // semantic fact after the player has genuinely made progress into the
      // corridor, and delay its eligibility so the next sheet cannot visibly
      // answer the input that produced it.
      if (state.hallMaxDistance >= 10 && to.y > from.y + 0.35) {
        rememberDialogueFact(SOURCE_DIALOGUE_FACT.TURNED_BACK_IN_SEARCH);
      }
      const distance = Math.max(0, -to.y * CELL);
      dispatch({ type: 'HALL_ADVANCED', distance });
      if (state.pageStage >= 1) rememberDialogueFact(SOURCE_DIALOGUE_FACT.RAIN_STARTED);
      if (distance >= SOURCE_HALL_END_METRES) {
        dispatch({
          type: 'HAYSTACK_REACHED',
          origin: { x: 0, y: SOURCE_HALL_END_Y },
          slot: (state.seed >>> 0) % 12,
        }, { immediate: true });
      }
      return;
    }
    if (state.phase === CHUNK_SURF_PHASE.HAYSTACK) {
      const still = haystackPagePoint();
      const before = Math.hypot(from.x - still.x, from.y - still.y);
      const after = Math.hypot(to.x - still.x, to.y - still.y);
      if (after <= 6) rememberDialogueFact(SOURCE_DIALOGUE_FACT.APPROACHED_STILL_PAGE);
      if (before <= 6 && after >= 9) rememberDialogueFact(SOURCE_DIALOGUE_FACT.APPROACHED_THEN_RETREATED);
    }
    if ([CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase)) {
      // Walking near a landmark simply notes you were there (lore, and the record
      // of what you have seen). No pursuit is armed and nothing checkpoints you —
      // the hush stalks the field as atmosphere, seen but never stopping the walk.
      for (const id of Object.keys(LANDMARK_OFFSETS)) {
        const point = landmarkPoint(id);
        if (point && Math.hypot(to.x - point.x, to.y - point.y) < 9 && !state.visited.includes(id)) {
          dispatch({ type: 'LANDMARK_VISITED', id });
          protectMoment(id === 'body-room' ? 4 : 2.5);
        }
      }
      const final = landmarkPoint('final-page');
      // The final page is a place, not an equipment check. Contact knowledge is
      // still earned only through the three authored HUSH encounters; arriving
      // without it is the unchanged walk-away route into the Horizon.
      if (state.phase === CHUNK_SURF_PHASE.LANDSCAPE
          && final && Math.hypot(to.x - final.x, to.y - final.y) < 10) {
        dispatch({ type: 'FINAL_REACHED' }, { immediate: true });
        protectMoment(30);
      }
    }
  }

  function inspectFocused(px, py, facing) {
    const focus = focusAt(px, py, facing);
    if (!focus) return { handled: false };
    if (focus.kind === 'source-sheet') {
      const assigned = assignSourceDialoguePage(sourceDialogue, SOURCE_PAGES, {
        sheetId: focus.id,
        hallStage: state.pageStage,
      });
      if (assigned.assigned) commitDialogue(assigned.state, { immediate: true });
      const page = assigned.page;
      readSheets.add(focus.id);
      // Reading is not safety. The physical sheet is lazily assigned once and
      // persisted, so revisiting or reloading can never rewrite it; in the
      // haystack, stopping on a decoy still feeds the existing pressure field.
      if (searchSpanActiveFor(state)) {
        haystackWrongReads += 1;
        haystackReadImpulse = Math.min(1, haystackReadImpulse + 0.42);
      }
      return { handled: true, kind: 'page', page, text: '', event: 'page-read' };
    }
    if (focus.kind === 'haystack-page') {
      const page = haystackPagePoint();
      dispatch({
        type: 'HAYSTACK_PAGE_FOUND',
        landscapeOrigin: sourceLandscapeOriginAfterHaystack(),
      }, { immediate: true });
      transformElapsed = 0;
      // NO LINE HERE. This used to answer with 'One sheet does not move…', which
      // the caller spoke — so the hardest walk in the game ended on a caption.
      // The caller cuts to black on this event instead: a door, and then the
      // field. Anything said here would be said over the top of that.
      return { handled: true, text: '', event: 'page-found' };
    }
    if (focus.kind === 'landmark') {
      if (!focus.available) return { handled: true, text: 'The source is present, but its call site has not been reached.' };
      dispatch({ type: 'LANDMARK_VISITED', id: focus.id });
      protectMoment(5);
      const room = chunkSurfRoom(focus.id);
      return { handled: true, text: room.inspect, source: exactLine(focus.sector, 0) };
    }
    if (focus.kind === 'horizon-bust') {
      const talk = talkToHorizonBust();
      return {
        handled: true,
        event: talk.offers ? 'horizon-bust-offer' : 'horizon-bust',
        line: talk.line,
        // The recognition line, when the man outside already said this. Carried
        // beside the bust's own sentence rather than merged into it, so the
        // presenter can put it in the player's mouth where it belongs.
        recognition: talk.recognition || null,
        eligible: talk.eligible,
        evidence: talk.evidence,
        beat: talk.beat,
        text: '',
      };
    }
    if (focus.kind === 'normal-exit') {
      // The two authored pads are one decision, not a secret safe exit beside a
      // dangerous one. When Contact is available, either approach opens the
      // same explicit warning; Horizon is entered only by choosing WALK AWAY.
      const request = requestBossBattle();
      if (request.available) return { handled: true, event: 'boss-warning', text: '' };
      const completed = completeNormalExit();
      return { ...completed, event: 'horizon', text: '' };
    }
    if (focus.kind === 'boss-fault') {
      const request = requestBossBattle();
      if (request.available) return { handled: true, event: 'boss-warning', text: '' };
      // Two ways to be inert, and they are not the same refusal. Without the
      // insights there is nothing here he knows how to address; without the
      // night having taken him, there is nothing here he believes is listening.
      return {
        handled: true,
        event: 'boss-inert',
        text: request.exposed
          ? 'The return path is exposed and it is not for you. Nothing in this building has laid a hand on you tonight.'
          : 'The return path is exposed. You have not heard enough of it to say anything back.',
      };
    }
    return { handled: false };
  }

  function tick(dt, { px = player.x, py = player.y, facing = player.facing } = {}) {
    player = { x: px, y: py, facing };
    const elapsed = Math.max(0, Number(dt) || 0);
    phaseElapsed += elapsed;
    const searchActive = searchSpanActiveFor(state);
    if (searchActive) searchElapsed += elapsed;
    else if (state.phase === CHUNK_SURF_PHASE.HALL) searchElapsed = 0;
    if ([CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) refreshStandingPressure();
    protectionRemaining = Math.max(0, protectionRemaining - elapsed);
    restartGraceRemaining = Math.max(0, restartGraceRemaining - elapsed);
    if (state.firstLiftCompleted && !state.landingWeatherSpent && landingRainRemaining > 0) {
      landingRainRemaining = Math.max(0, landingRainRemaining - elapsed);
      if (landingRainRemaining <= 0) dispatch({ type: 'SOURCE_LANDING_WEATHER_SPENT' }, { immediate: true });
    }
    if (searchActive) {
      haystackReadImpulse = Math.max(0, haystackReadImpulse - elapsed * 0.42);
    } else {
      haystackReadImpulse = 0;
    }
    if (state.phase === CHUNK_SURF_PHASE.TRANSFORMING) {
      transformElapsed = Math.min(SOURCE_TRANSFORM_SECONDS, transformElapsed + elapsed);
      if (transformElapsed >= SOURCE_TRANSFORM_SECONDS) dispatch({ type: 'TRANSFORMATION_COMPLETED' }, { immediate: true });
    }
    focusAt(px, py, facing);
    const objective = sourceObjective();
    const distance = objective.distance;
    if (objective.id !== lastObjectiveId) {
      lastObjectiveId = objective.id;
      lastObjectiveDistance = Number.isFinite(distance) ? distance : Infinity;
      noProgressSeconds = 0;
    } else if (Number.isFinite(distance) && distance < lastObjectiveDistance - 0.75) {
      noProgressSeconds = 0;
      lastObjectiveDistance = distance;
    } else if (Number.isFinite(distance) && (!nearProtectedMoment() || !state.firstLiftCompleted) && !traversal && !pendingContact) {
      noProgressSeconds += elapsed;
      if (noProgressSeconds >= 8) rememberDialogueFact(SOURCE_DIALOGUE_FACT.STOOD_STILL_UNDER_PRESSURE);
    }
  }

  function paperDocumentIdForSheet(index) {
    const sheetId=`source-sheet-${index}`;
    const assignedId=sourceDialogue.assignments?.[sheetId];
    if(assignedId)return `source-page:${assignedId}`;
    const fallback=sourcePageFor(index,state.pageStage,state.seed);
    return fallback?`source-page:${fallback.id}`:ambientPaperDocumentId(state.seed,index);
  }

  function pageInstances(px, py, {time=0,reducedMotion=false,objectiveHints='full',flashMode='full'}={}) {
    if (![CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK, CHUNK_SURF_PHASE.TRANSFORMING].includes(state.phase)) return [];
    const count = pageCount(state.hallMaxDistance);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const r0 = rand(state.seed, i, 101), r1 = rand(state.seed, i, 211), r2 = rand(state.seed, i, 307);
      let rx, ry, elevation, pitch, yaw, roll;
      if (i === 0) {
        rx = 0; ry = -24 * CELL; elevation = 0.018; pitch = 0; yaw = 0.06; roll = 0;
      } else {
        // Placement is world-authoritative and seed-derived. It never follows
        // the player or disappears on retreat; only the visible render window
        // moves around the persistent procedural addresses.
        const reach = Math.max(36, Math.min(280, state.hallMaxDistance / CELL + 42));
        ry = (-18 - r0 * reach) * CELL;
        const surface = i % 5;
        if (surface === 0 || surface === 1) {
          rx = (surface === 0 ? -HALL_HALF_WIDTH + 0.12 : HALL_HALF_WIDTH - 0.12) * CELL;
          elevation = 0.35 + r1 * 3.6; pitch = Math.PI / 2; yaw = surface === 0 ? Math.PI / 2 : -Math.PI / 2; roll = (r2 - 0.5) * 0.45;
        } else if (surface === 2) {
          rx = (r1 - 0.5) * HALL_HALF_WIDTH * CELL * 1.7; elevation = HALL_CEIL - 0.08; pitch = Math.PI; yaw = r2 * Math.PI * 2; roll = 0;
        } else {
          rx = (r1 - 0.5) * HALL_HALF_WIDTH * CELL * 1.72; elevation = 0.018; pitch = 0; yaw = r2 * Math.PI * 2; roll = (r0 - 0.5) * 0.16;
        }
      }
      if(i>0&&!reducedMotion&&state.pageStage>0){
        const flutter=Math.sin(time*(1.1+r2*.9)+i*.73)*(.012+state.pageStage*.004);
        elevation+=flutter;
        roll+=flutter*2.4;
      }
      out.push({
        id: `source-sheet-${i}`,
        mesh: 'loose_note',
        matrix: sourceMatrix({ x: rx, y: elevation, z: ry, scaleX: 1.05, scaleY: 1.05, scaleZ: 1.05, pitch, yaw, roll }),
        zone: ZONE.sourceSpace,
        structural: false,
        paperIndex: paperAtlasIndex(paperDocumentIdForSheet(i)),
        semantic: 'physical-paper',
      });
    }

    // THE AIR ITSELF IS FULL OF PAPER.
    //
    // Static authored sheets make density; this local, noninteractive swarm
    // makes weather. Three deterministic flow families send sheets at the
    // camera, past the player, and across the corridor. They are presentation
    // only: readable page addresses remain world-authoritative and stable.
    const searchWind = state.phase === CHUNK_SURF_PHASE.HAYSTACK
      ? 1
      : clamp01(((state.hallMaxDistance || 0) - 56) / 56);
    const gustCount = reducedMotion
      ? Math.floor(searchWind * 18)
      : Math.floor(searchWind * (state.phase === CHUNK_SURF_PHASE.HAYSTACK ? 96 : 64));
    if (gustCount > 0) {
      const forward = [[0, -1], [1, 0], [0, 1], [-1, 0]][((player.facing % 4) + 4) % 4];
      const right = [-forward[1], forward[0]];
      const centerX = px * CELL, centerZ = py * CELL;
      for (let i = 0; i < gustCount; i += 1) {
        const a = rand(state.seed, i, 1201);
        const b = rand(state.seed, i, 1213);
        const c = rand(state.seed, i, 1229);
        const d = rand(state.seed, i, 1249);
        const cycle = 4.2 + a * 3.8;
        const progress = reducedMotion
          ? b
          : ((Math.max(0, Number(time) || 0) / cycle + b) % 1);
        const flow = i % 3;
        let longitudinal = 0, lateral = 0;

        if (flow === 0) {
          // Head-on: from in front of the player to well behind them.
          longitudinal = (11 + c * 7) - progress * (25 + d * 11);
          lateral = (a - 0.5) * 7.5;
        } else if (flow === 1) {
          // Crosswind: sheets traverse the whole sightline.
          longitudinal = (a - 0.5) * 14;
          lateral = (-10 - c * 4) + progress * (20 + c * 8);
        } else {
          // Overtake: something catches you from behind and keeps going.
          longitudinal = (-8 - c * 5) + progress * (20 + d * 9);
          lateral = (b - 0.5) * 8.5;
        }

        const arch = Math.sin(Math.PI * progress);
        const lift = reducedMotion
          ? 0.22 + c * 0.45
          : 0.28 + arch * (1.2 + c * 2.1) + Math.sin(time * (1.3 + d) + i) * 0.14;
        const wx = centerX + forward[0] * longitudinal + right[0] * lateral;
        const wz = centerZ + forward[1] * longitudinal + right[1] * lateral;
        const spin = reducedMotion ? (c - 0.5) * 0.3 : time * (1.2 + d * 2.6) + i * 0.61;
        out.push({
          id: `source-wind-sheet-${i}`,
          mesh: 'loose_note',
          matrix: sourceMatrix({
            x: wx,
            y: lift,
            z: wz,
            scaleX: 0.90 + a * 0.30,
            scaleY: 0.90 + a * 0.30,
            scaleZ: 0.90 + a * 0.30,
            pitch: reducedMotion ? 0.12 : 0.22 + Math.sin(spin * 0.7) * 0.68,
            yaw: spin,
            roll: reducedMotion ? (b - 0.5) * 0.25 : Math.sin(spin * 1.13) * 1.05,
          }),
          zone: ZONE.sourceSpace,
          structural: false,
          paperIndex: paperAtlasIndex(ambientPaperDocumentId(state.seed, 10000 + i)),
          noShadow: true,
          semantic: 'source-wind-paper',
        });
      }
    }

    if (state.phase === CHUNK_SURF_PHASE.HAYSTACK) {
      const correct = haystackPagePoint();
      const guidance = state.phase === CHUNK_SURF_PHASE.HAYSTACK
        ? haystackPageGuidance({ noProgressSeconds, hints: objectiveHints, flash: flashMode, time })
        : { visible: false, strength: 0 };
      out.push({
        id: 'source-sheet-interactive',
        mesh: 'loose_note',
        matrix: sourceMatrix({ x: correct.x * CELL, y: 0.026, z: correct.y * CELL, scaleX: 1.12, scaleY: 1.12, scaleZ: 1.12 }),
        zone: ZONE.sourceSpace,
        structural: false,
        paperIndex: paperAtlasIndex('source-real-still'),
        interactiveId: 'source-page',
        ...(guidance.visible ? { emissive: [
          guidance.color?.[0] ?? 1.0,
          guidance.color?.[1] ?? 0.52,
          guidance.color?.[2] ?? 0.12,
          guidance.strength,
        ] } : null),
      });
    }
    return out;
  }


  function landscapeTextInstances() {
    if (![CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return [];
    const o = landscapeOrigin(), out = [];
    for (let i = 0; i < trees.length; i += 1) {
      const tree = trees[i], line = exactLine(i % 2 ? 'student' : 'hush', i);
      for (let layer = 0; layer < 4; layer += 1) {
        const width = 1.5 + layer * 0.55;
        out.push({
          id: `source-tree-${i}-${layer}`,
          sourceId: line?.id,
          text: line?.text || '',
          matrix: sourceMatrix({
            x: o.x + tree.x,
            y: 0.35 + layer * 0.62,
            z: o.y + tree.y,
            scaleX: width,
            scaleY: 0.36,
            scaleZ: 1,
            yaw: (i % 4) * Math.PI / 2,
          }),
          color: layer === 0 ? [0.19, 0.47, 0.08, 1] : [0.03, 0.95, 0.18, 1],
          semantic: 'source-tree',
        });
      }
    }
    for (const [id, offset] of Object.entries(LANDMARK_OFFSETS)) {
      const p = landmarkPoint(id);
      for (let lineIndex = 0; lineIndex < 5; lineIndex += 1) {
        const line = exactLine(offset.sector, lineIndex * 3);
        out.push({
          id: `source-landmark-${id}-${lineIndex}`,
          sourceId: line?.id,
          text: line?.text || '',
          matrix: sourceMatrix({ x: p.x, y: 0.4 + lineIndex * 0.48, z: p.y, scaleX: 2.6, scaleY: 0.34, yaw: (lineIndex % 2 ? Math.PI / 2 : 0) }),
          color: id === 'final-page' || id === 'body-room' ? [1, 0.18, 0.12, 1] : id === 'fork-room' ? [0.82, 0.92, 1, 1] : [0.05, 0.74, 1, 1],
          semantic: `landmark:${id}`,
        });
      }
    }
    return out;
  }

  function densityWakeTextInstances(presence = null, time = 0) {
    const runtimeHush = hushMode();
    if (!runtimeHush.searchActive
      && ![CHUNK_SURF_HUSH_STAGE.STALK, CHUNK_SURF_HUSH_STAGE.HUNT, CHUNK_SURF_HUSH_STAGE.FINAL].includes(state.hushStage)) return [];
    const hx=Number(presence?.x),hy=Number(presence?.y);
    if(!presence?.active||!Number.isFinite(hx)||!Number.isFinite(hy))return[];
    const velocity=presence?.velocity||{x:0,y:0};
    const direction=Math.hypot(Number(velocity.x)||0,Number(velocity.y)||0)>.02
      ?Math.atan2(Number(velocity.y)||0,Number(velocity.x)||0):time*.08;
    const lines = sourceLines('hush');
    // The visible body is now the anchor; this wake is what Source does AROUND
    // it. Keep the displaced text broad enough that it reads as a pressure field
    // rather than a second silhouette competing with the authored HUSH card.
    return Array.from({length:9},(_,index)=>{
      const side=index%2?1:-1;
      const behind=5+Math.floor(index/2)*2.4;
      const across=side*(6+(index%3)*2.2);
      const dx=Math.cos(direction)*-behind-Math.sin(direction)*across;
      const dz=Math.sin(direction)*-behind+Math.cos(direction)*across;
      const worldX=hx+dx,worldY=hy+dz;
      const o=landscapeOrigin(),floor=sourceLandscapeFloorAt(worldX-o.x,worldY-o.y);
      const line = lines[(index * 7) % Math.max(1, lines.length)];
      return {
        id: `source-density-wake-${index}`,
        sourceId: line?.id,
        sourceFile: line?.file,
        sourceLine: line?.line,
        sourceHash: line?.hash,
        text:index%3===0?'[PRE-ROLL OMITTED]':line?.text||'',
        matrix:sourceMatrix({x:worldX*CELL,y:floor+.08,z:worldY*CELL,scaleX:1.25,scaleY:.18,yaw:direction+(side>0?.08:-.08),pitch:-Math.PI/2}),
        color:index%3===0?[.04,.04,.035,.92]:[.88,.22,.14,.46],
        semantic:'source-density-wake',
      };
    });
  }

  const sourcePanel = ({ id, sector = 'hall', lineIndex = 0, redact = false, x, y, z, scaleX, scaleY, pitch = 0, yaw = 0, roll = 0, color = [0.72, 1, 0.82, 1], semantic = 'text-architecture', interactiveId = null, overlapLayer = 'base', platformHeight = null }) => {
    const source = exactLine(sector, lineIndex);
    const displayText = redact ? redactedSourceText(source) : source?.text || '[SOURCE OMITTED]';
    const visiblyRedacted = !!(redact && source && displayText !== source.text);
    return {
      id,
      sourceId: source?.id,
      sourceFile: source?.file,
      sourceLine: source?.line,
      sourceHash: source?.hash,
      text: displayText,
      redacted: visiblyRedacted,
      matrix: sourceMatrix({ x, y, z, scaleX, scaleY, pitch, yaw, roll }),
      color,
      semantic,
      overlapLayer,
      ...(Number.isFinite(platformHeight) ? { platformHeight } : {}),
      ...(interactiveId ? { interactiveId } : {}),
    };
  };

  const sourceSymbolPanel = ({ id, symbol, referenceId, x, y, z, scaleX = 2.5, scaleY = 0.4, pitch = 0, yaw = 0, roll = 0, color = [0.72, 1, 0.82, 1] }) => {
    const occurrence = SOURCE_ATLAS.symbols?.[symbol]?.occurrence || SOURCE_ATLAS.symbols?.[symbol]?.occurrences?.[0];
    return {
      id,
      sourceId: occurrence?.entryId,
      sourceFile: occurrence?.file,
      sourceLine: occurrence?.line,
      sourceHash: occurrence?.hash,
      referenceId,
      text: symbol,
      matrix: sourceMatrix({ x, y, z, scaleX, scaleY, pitch, yaw, roll }),
      color,
      semantic: 'text-architecture:reference',
      overlapLayer: 'overlap',
    };
  };

  function resolvedIntervalTextInstances(){
    const count=normalizeSourceContactState(state.sourceContacts).insights.length;
    if(!count)return[];
    const o=landscapeOrigin(),depths=[-52,-138,-238],out=[];
    for(let index=0;index<count;index+=1){
      const worldY=o.y+depths[index],floor=sourceLandscapeFloorAt(0,depths[index]);
      for(const side of [-1,1])out.push(sourcePanel({
        id:`source-resolved-interval-${index}-${side<0?'left':'right'}`,
        sector:index===0?'hall':index===1?'recordist':'body',lineIndex:17+index*23,
        x:(o.x+side*5.5)*CELL,y:floor+.3,z:worldY*CELL,
        scaleX:1.1,scaleY:5.6,yaw:Math.PI/2,
        color:[.42,.88,.74,.76],semantic:'source-resolved-interval',overlapLayer:'resolved',
      }));
      out.push(sourcePanel({
        id:`source-resolved-interval-${index}-span`,
        sector:index===0?'hall':index===1?'recordist':'body',lineIndex:29+index*19,
        x:o.x*CELL,y:floor+3.1,z:worldY*CELL,
        scaleX:5.8,scaleY:.34,
        color:[.68,1,.84,.88],semantic:'source-resolved-interval',overlapLayer:'resolved',
      }));
    }
    return out;
  }

  const sectorAtHallDepth = (depth) => ['hall', 'recordist', 'student', 'workOrder', 'body', 'hush'][Math.abs(Math.floor(depth / 18)) % 6];
  const routeVisual = (localX, localY) => {
    const route = routeAt({ x: localX, y: localY });
    if (route?.id === 'surfer-loop') return { sector: 'student', color: [0.10, 0.86, 1, 0.88] };
    if (route?.id === 'work-order-loop') return { sector: 'workOrder', color: [1, 0.30, 0.14, 0.88] };
    if (route?.id === 'final-causeway') return { sector: 'final', color: [0.86, 0.92, 0.82, 0.92] };
    return { sector: sectorAtHallDepth(localY), color: [0.42, 1, 0.62, 0.88] };
  };

  function landscapeArchitectureTextInstances(px, py, { tileX = Math.floor(px / SOURCE_ARCH_TILE_CELLS), tileY = Math.floor(py / SOURCE_ARCH_TILE_CELLS) } = {}) {
    if (![CHUNK_SURF_PHASE.TRANSFORMING,CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return [];
    const out = [];
    const o = landscapeOrigin();
    const tileMinX = tileX * SOURCE_ARCH_TILE_CELLS;
    const tileMinY = tileY * SOURCE_ARCH_TILE_CELLS;
    const tileMaxX = tileMinX + SOURCE_ARCH_TILE_CELLS;
    const tileMaxY = tileMinY + SOURCE_ARCH_TILE_CELLS;
    const ownsWorld = (x, y) => x >= tileMinX && x < tileMaxX && y >= tileMinY && y < tileMaxY;
    // The floor SURFACE, tiled densely in source and hugging the terrain in both
    // axes — the code IS the ground, following every mound and dip, not a rug laid
    // on a flat plane. Positions derive only from the world tile, never the
    // player, so a residency change cannot slide the floor underneath them.
    for (let worldZ = tileMinY + 2; worldZ < tileMaxY; worldZ += 4) {
      for (let worldX = tileMinX + 4; worldX < tileMaxX; worldX += 8) {
        const cell=cellAt(worldX,worldZ);
        if(!cell)continue;
        const before=cellAt(worldX,worldZ+1)?.floor??cell.floor;
        const after=cellAt(worldX,worldZ-1)?.floor??cell.floor;
        const rampPitch=-Math.PI/2+Math.atan2(after-before,2*CELL);
        const west=cellAt(worldX-1,worldZ)?.floor??cell.floor;
        const east=cellAt(worldX+1,worldZ)?.floor??cell.floor;
        const rollTilt=Math.atan2(east-west,2*CELL);
        const visual=routeVisual(worldX-o.x,worldZ-o.y);
        out.push(sourcePanel({
          id: `source-field-floor-${worldX}-${worldZ}`,
          sector: visual.sector, lineIndex: Math.abs(worldZ * 11 + worldX * 17), redact: (worldZ + worldX) % 20 === 0,
          x: worldX * CELL, y: cell.floor + 0.014 + Math.abs(worldX % 3) * 0.001, z: worldZ * CELL + (worldX % 2) * 0.035,
          scaleX: 8.2, scaleY: 0.52,
          pitch: rampPitch, yaw: (worldX % 5) * 0.009, roll: rollTilt,
          color: worldX % 16 ? visual.color.map((value,index)=>index===3?value:value*.82) : visual.color,
          semantic: 'text-architecture:ramp', overlapLayer: worldX % 16 ? 'overlap' : 'base', platformHeight: cell.floor,
        }));
      }
    }

    // Text monoliths sit outside every walkable causeway and landmark pad, so
    // their visual mass never implies a hidden collision volume on the route.
    for(let index=0;index<trees.length;index+=1){
      const tree=trees[index],worldX=o.x+tree.x,worldZ=o.y+tree.y;
      if(routeAt(tree)||onLandmarkPad(tree))continue;
      if(!ownsWorld(worldX,worldZ))continue;
      const base=sourceLandscapeFloorAt(tree.x,tree.y);
      for(let row=0;row<8;row+=1)out.push(sourcePanel({
        id:`source-field-monolith-${index}-${row}`,
        sector:index%3===0?'hush':index%2?'student':'recordist',lineIndex:index*5+row*13,redact:row===5,
        x:worldX*CELL,y:base+.28+row*.42,z:worldZ*CELL,
        scaleX:2.1+row%3*.55,scaleY:.28,yaw:(index%4)*Math.PI/2,roll:row%2?.035:-.035,
        color:row%3===0?[.16,.82,1,.9]:[.34,1,.48,.82],semantic:'text-architecture:monolith',overlapLayer:row%2?'overlap':'base',
      }));
    }

    // Cross-braced frames make the long ramps legible at distance and give the
    // massive field some authored architecture beyond its ground plane.
    for(let depth=24;depth<=LANDSCAPE_H-12;depth+=24){
      const worldZ=o.y-depth,base=sourceLandscapeFloorAt(0,-depth);
      if(!ownsWorld(o.x,worldZ))continue;
      for(const side of [-1,1])for(let row=0;row<5;row+=1)out.push(sourcePanel({
        id:`source-ramp-frame-${depth}-${side}-${row}`,sector:sectorAtHallDepth(depth),lineIndex:depth+row*19+(side>0?7:0),
        x:(o.x+side*13)*CELL,y:base+.3+row*.52,z:worldZ*CELL,scaleX:3.1,scaleY:.26,yaw:Math.PI/2,
        color:row===4?[1,.28,.16,.9]:[.18,.78,1,.72],semantic:'text-architecture:frame',overlapLayer:row%2?'overlap':'base',
      }));
      out.push(sourcePanel({
        id:`source-ramp-span-${depth}`,sector:sectorAtHallDepth(depth),lineIndex:depth*3,redact:depth%48===0,
        x:o.x*CELL,y:base+3.05,z:worldZ*CELL,scaleX:7.2,scaleY:.34,
        color:[.62,1,.72,.84],semantic:'text-architecture:span',overlapLayer:'overlap',
      }));
    }

    // Exact identifiers and same-line reference edges become a hovering call
    // graph around the Fork Gate. No labels are authored outside the corpus.
    const fork = landmarkPoint('fork-room');
    if (ownsWorld(fork.x, fork.y)) {
      const references = (SOURCE_ATLAS.references || []).slice(0, 28);
      references.forEach((reference, index) => {
        const angle = index * 0.73;
        const radius = 9 + (index % 5) * 1.8;
        const symbol = index % 2 ? reference.to : reference.from;
        out.push(sourceSymbolPanel({
          id: `source-reference-${reference.id}`,
          symbol,
          referenceId: reference.id,
          x: (fork.x + Math.cos(angle) * radius) * CELL,
          y: 1.2 + (index % 9) * 0.48,
          z: (fork.y + Math.sin(angle) * radius) * CELL,
          scaleX: 3.4 + (index % 4) * 0.9,
          scaleY: 0.46,
          yaw: -angle + Math.PI / 2,
          roll: index % 2 ? 0.05 : -0.05,
          color: index % 3 === 0 ? [1, 0.20, 0.12, 0.94] : [0.18, 0.84, 1, 0.86],
        }));
      });
    }

    for (const [id, offset] of Object.entries(LANDMARK_OFFSETS)) {
      const x = (o.x + offset.x) * CELL, z = (o.y + offset.y) * CELL;
      if (!ownsWorld(o.x + offset.x, o.y + offset.y)) continue;
      const base=sourceLandscapeFloorAt(offset.x,offset.y);
      for (let row = 0; row < 16; row += 1) {
        out.push(sourcePanel({
          id: `source-field-pillar-${id}-${row}`,
          sector: offset.sector, lineIndex: row * 7 + id.length, redact: row % 6 === 3,
          x, y: base+0.25 + row * 0.38, z,
          scaleX: 4.8 + (row % 3) * 0.75, scaleY: 0.32,
          yaw: row % 2 ? Math.PI / 2 : 0, roll: row % 2 ? 0.04 : -0.04,
          color: id === 'final-page' ? [1, 0.32, 0.24, 1] : [0.72, 1, 0.82, 1],
          semantic: 'text-architecture:pillar', overlapLayer: row % 2 ? 'overlap' : 'base',
        }));
      }
    }

    const final=landmarkPoint('final-page'),finalOffset=LANDMARK_OFFSETS['final-page'];
    const finalBase=sourceLandscapeFloorAt(finalOffset.x,finalOffset.y);
    if(ownsWorld(final.x,final.y)){
      for(const side of [-1,1])for(let row=0;row<14;row+=1)out.push(sourcePanel({
        id:`source-endpoint-upright-${side}-${row}`,sector:'final',lineIndex:row*11+(side>0?5:0),redact:row%7===4,
        x:(final.x+side*8)*CELL,y:finalBase+.3+row*.44,z:(final.y-4)*CELL,
        scaleX:4.2,scaleY:.31,yaw:Math.PI/2,
        color:row%4===0?[1,.14,.08,1]:[.82,.95,.86,.86],semantic:'text-architecture:endpoint',overlapLayer:row%2?'overlap':'base',
      }));
      for(let beam=0;beam<5;beam+=1)out.push(sourcePanel({
        id:`source-endpoint-beam-${beam}`,sector:'final',lineIndex:80+beam*17,redact:beam===2,
        x:final.x*CELL,y:finalBase+4.2+beam*.36,z:(final.y-4)*CELL,
        scaleX:7.4-beam*.45,scaleY:.3,roll:beam%2?.025:-.025,
        color:beam===0?[1,.16,.08,1]:[.16,.82,1,.82],semantic:'text-architecture:endpoint',overlapLayer:beam?'overlap':'base',
      }));
    }

    // The old connectors were only floor interpolation. These columns are the
    // literal field lifts: readable from the previous tier, open on both ends,
    // and tall enough that their travel direction is visible before commitment.
    for (const lift of SOURCE_LIFTS) {
      const worldX = o.x + lift.x, worldZ = o.y + lift.y;
      if (!ownsWorld(worldX, worldZ)) continue;
      const lower = SOURCE_TIER_BY_ID[lift.from]?.height ?? 0;
      const upper = SOURCE_TIER_BY_ID[lift.to]?.height ?? lower;
      const rows = Math.max(8, Math.ceil((upper - lower) / 0.42));
      for (const side of [-1, 1]) for (let row = 0; row <= rows; row += 1) {
        const t = row / rows;
        out.push(sourcePanel({
          id: `source-lift-${lift.id}-${side}-${row}`,
          sector: row % 3 === 0 ? 'hush' : 'recordist',
          lineIndex: row * 13 + (side > 0 ? 7 : 0),
          x: (worldX + side * (lift.halfWidth - 0.5)) * CELL,
          y: lower + 0.18 + (upper - lower) * t,
          z: worldZ * CELL,
          scaleX: 2.2,
          scaleY: 0.26,
          yaw: Math.PI / 2,
          roll: side * 0.025,
          color: row % 4 === 0 ? [1, 0.22, 0.10, 0.96] : [0.12, 0.92, 1, 0.82],
          semantic: `text-traversal:lift:${lift.id}`,
          overlapLayer: row % 2 ? 'overlap' : 'base',
        }));
      }
    }

    // The field's edge is a WALL OF CODE, not an invisible boundary. Where the
    // ground runs out at the left/right perimeter, tall columns of source strings
    // stand up out of the floor so you can SEE the wall — the "made of code" of
    // the space, made literal. Each course belongs to exactly one world tile;
    // the interior is open sky, no walls (Oblivion).
    const halfW = LANDSCAPE_W / 2;
    for (const side of [-1, 1]) {
      const edgeWorldX = o.x + side * halfW;
      for (let worldZ = Math.floor((o.y - LANDSCAPE_H) / 4) * 4; worldZ <= o.y + 4; worldZ += 4) {
        const localY = worldZ - o.y;
        if (localY > 4 || localY < -LANDSCAPE_H) continue;
        if (!ownsWorld(edgeWorldX, worldZ)) continue;
        const base = sourceLandscapeFloorAt(side * halfW, localY);
        for (let row = 0; row < 12; row += 1) {
          out.push(sourcePanel({
            id: `source-wall-${side}-${worldZ}-${row}`,
            sector: sectorAtHallDepth(-localY), lineIndex: Math.abs(worldZ * 7 + row * 13 + (side > 0 ? 5 : 0)), redact: row % 5 === 0,
            x: edgeWorldX * CELL, y: base + 0.3 + row * 0.95, z: worldZ * CELL,
            scaleX: 3.6, scaleY: 0.86, yaw: Math.PI / 2, roll: side * 0.03,
            color: row % 4 === 0 ? [0.05, 0.74, 1, 0.92] : [0.12, 0.86, 0.42, 0.86],
            semantic: 'text-architecture:wall', overlapLayer: row % 2 ? 'overlap' : 'base',
          }));
        }
      }
    }
    return out;
  }

  function interactionTextInstances() {
    const out = [];
    if (state.phase === CHUNK_SURF_PHASE.TRANSFORMING) {
      const point = haystackPagePoint();
      out.push(sourcePanel({
        id: 'source-text-exit-page', sector: 'final', lineIndex: 10,
        x: point.x * CELL, y: 0.018, z: point.y * CELL,
        scaleX: 2.8, scaleY: 0.34, pitch: -Math.PI / 2,
        color: [1, 0.26, 0.18, 1], semantic: 'text-interaction:page', interactiveId: 'source-page',
      }));
    }
    if (state.phase === CHUNK_SURF_PHASE.FINAL || state.phase === CHUNK_SURF_PHASE.COMPLETED) {
      const final = landmarkPoint('final-page');
      const base=sourceLandscapeFloorAt(LANDMARK_OFFSETS['final-page'].x,LANDMARK_OFFSETS['final-page'].y);
      out.push(sourcePanel({
        id: 'source-text-normal-exit', sector: 'final', lineIndex: 9,
        x: (final.x - 5) * CELL, y: base + 1.15, z: (final.y - 4) * CELL,
        scaleX: 3.8, scaleY: 0.42,
        color: [0.88, 0.94, 0.86, 1],
        semantic: 'text-endpoint:normal-exit', interactiveId: 'source-normal-exit',
      }));
      if (sourceBossExposed(state.sourceContacts)) out.push(sourcePanel({
        id: 'source-text-boss-fault', sector: 'hush', lineIndex: 6, redact: true,
        x: (final.x + 5) * CELL, y: base + 1.15, z: (final.y - 4) * CELL,
        scaleX: 3.8, scaleY: 0.42,
        color: state.profile?.bestEligible ? [1, 0.16, 0.10, 1] : [0.34, 0.34, 0.32, 0.72],
        semantic: 'text-endpoint:boss-fault', interactiveId: 'source-boss-fault',
      }));
    }
    return out;
  }

  // The long hall is still the physical building: hundreds of authored sheet
  // meshes occupy its floor, walls and ceiling. Meshes disappear only after
  // the page opens into Source Space proper.
  // Cathédrale engloutie: real building meshes — chapel vaults, bells, pews, an
  // organ, the drowned furniture of the rooms — leak up through the open field.
  // They render through renderPropPass and are composited by the text-space
  // shader, so they arrive already half made of code: solid stone one glance,
  // dissolving into source the next. More of it surfaces the deeper you go — code
  // near the entrance, built architecture near the end (progressive resolution).
  const SOURCE_LEAK_MESHES = Object.freeze([
    'chapel_vault', 'altar_table', 'lectern', 'hymn_board', 'pew', 'pew', 'chapel_inner_screen',
    'organ_console', 'organ_pipes', 'tower_organ_case', 'portrait_frame', 'hall_structure',
    'hall_seating', 'tower_bell_01', 'tower_bell_04', 'tower_frame', 'tower_wheel_01',
    'upright_piano', 'grand_piano', 'marimba', 'timpani',
  ]);
  const SOURCE_LEAK_COUNT = 120;

  function landingPropInstances() {
    return [...sourceLandingPropPlacements(landscapeOrigin()),...sourceLandingDoorPlacements(landscapeOrigin())].map((placement) => ({
      id: placement.id,
      mesh: placement.mesh,
      matrix: sourceMatrix({
        x: placement.x * CELL,
        y: placement.y,
        z: placement.z * CELL,
        yaw: placement.yaw,
        scaleX: placement.scaleX ?? placement.scale,
        scaleY: placement.scaleY ?? placement.scale,
        scaleZ: placement.scaleZ ?? placement.scale,
      }),
      zone: ZONE.sourceSpace,
      structural: true,
      sourcePropId: placement.sourcePropId,
      sourceDoorId: placement.sourceDoorId,
    }));
  }

  // CONNECTORS HAVE TO EXIST BEFORE THE TEXT FIELD DOES.
  //
  // The first lift's code columns lived exclusively in sourceScene(), while
  // textSpaceActive() deliberately stays false until that lift has completed.
  // The result was a real traversal volume with no visible object at its mouth.
  // These ordinary meshes are the always-on body of every lift and chute; the
  // text architecture can grow over them after the first ascent.
  function connectorPropInstances() {
    const o = landscapeOrigin();
    const out = [{
      id: 'source-landing-opening-emergency-casing',
      mesh: 'tower_bulkhead',
      matrix: sourceMatrix({
        x: (o.x + SOURCE_LANDING_OPENING_LOCAL.x) * CELL,
        y: 3.05,
        z: (o.y + SOURCE_LANDING_OPENING_LOCAL.y - 2) * CELL,
        scaleX: 1.5, scaleY: 1.5, scaleZ: 1.5,
      }),
      emissive: [1, 0.01, 0.003, 0.82],
      zone: ZONE.sourceSpace,
      structural: true,
      sourceConnector: 'landing-opening',
    }];

    for (const lift of SOURCE_LIFTS) {
      const lower = SOURCE_TIER_BY_ID[lift.from]?.height ?? 0;
      const upper = SOURCE_TIER_BY_ID[lift.to]?.height ?? lower;
      const worldX = (o.x + lift.x) * CELL;
      const worldZ = (o.y + lift.y) * CELL;
      out.push({
        id: `source-connector-${lift.id}-deck`,
        mesh: 'tower_catwalk',
        matrix: sourceMatrix({
          x: worldX, y: lower - 0.02, z: worldZ,
          scaleX: Math.max(0.18, lift.halfWidth * 2 * CELL / 11.87),
          scaleY: 0.12,
          scaleZ: Math.max(0.28, lift.depth * 2 * CELL / 7.91),
        }),
        emissive: [0.08, 0.44, 0.48, 0.22],
        zone: ZONE.sourceSpace, structural: true, sourceConnector: lift.id,
      });
      for (const side of [-1, 1]) {
        out.push({
          id: `source-connector-${lift.id}-upright-${side}`,
          mesh: 'tower_louvres',
          matrix: sourceMatrix({
            x: (o.x + lift.x + side * (lift.halfWidth - 0.35)) * CELL,
            y: lower,
            z: worldZ,
            scaleX: Math.max(0.28, lift.depth * 2 * CELL / 6),
            scaleY: Math.max(0.4, (upper - lower) / 3.5),
            scaleZ: 0.42,
            yaw: Math.PI / 2,
          }),
          emissive: side < 0 ? [0.02, 0.46, 0.58, 0.3] : [0.62, 0.03, 0.01, 0.3],
          zone: ZONE.sourceSpace, structural: true, sourceConnector: lift.id,
        });
        out.push({
          id: `source-connector-${lift.id}-emergency-${side}`,
          mesh: 'tower_bulkhead',
          matrix: sourceMatrix({
            x: (o.x + lift.x + side * (lift.halfWidth - 0.45)) * CELL,
            y: lower + Math.min(2.4, Math.max(1.5, (upper - lower) * 0.55)),
            z: (o.y + lift.y + lift.depth - 0.35) * CELL,
            scaleX: 1.35, scaleY: 1.35, scaleZ: 1.35,
            yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2,
          }),
          emissive: [1, 0.008, 0.002, lift.id === 'lift-fork' ? 0.95 : 0.58],
          zone: ZONE.sourceSpace, structural: true, sourceConnector: lift.id,
        });
      }
    }

    for (const chute of SOURCE_CHUTES) {
      const top = SOURCE_TIER_BY_ID[chute.from]?.height ?? 0;
      const bottom = SOURCE_TIER_BY_ID[chute.to]?.height ?? top;
      const length = chute.run * CELL;
      const pitch = Math.atan2(top - bottom, Math.max(0.01, length));
      const centreX = (o.x + chute.x + chute.dir.x * chute.run * 0.5) * CELL;
      const centreZ = (o.y + chute.y + chute.dir.y * chute.run * 0.5) * CELL;
      const deckYaw = Math.atan2(chute.dir.x, chute.dir.y);
      const railYaw = Math.atan2(-chute.dir.y, chute.dir.x);
      out.push({
        id: `source-connector-${chute.id}-run`,
        mesh: 'tower_catwalk',
        matrix: sourceMatrix({
          x: centreX, y: (top + bottom) * 0.5 - 0.02, z: centreZ,
          scaleX: Math.max(0.18, chute.halfWidth * 2 * CELL / 11.87),
          scaleY: 0.1,
          scaleZ: Math.max(0.35, length / 7.91),
          pitch, yaw: deckYaw,
        }),
        emissive: [0.5, 0.035, 0.008, 0.24],
        zone: ZONE.sourceSpace, structural: true, sourceConnector: chute.id,
      });
      for (const side of [-1, 1]) out.push({
        id: `source-connector-${chute.id}-rail-${side}`,
        mesh: 'tower_loft_rail',
        matrix: sourceMatrix({
          x: centreX + side * chute.halfWidth * CELL,
          y: (top + bottom) * 0.5 + 0.18,
          z: centreZ,
          scaleX: Math.max(0.3, length / 10.07),
          scaleY: 0.72,
          scaleZ: 0.65,
          yaw: railYaw,
          roll: -pitch,
        }),
        emissive: [0.52, 0.025, 0.006, 0.2],
        zone: ZONE.sourceSpace, structural: true, sourceConnector: chute.id,
      });
    }
    return out;
  }

  function structurePropInstances(px, py) {
    const o = landscapeOrigin();
    const out = [];
    for (const placement of structures) {
      const placementX = o.x + placement.x, placementY = o.y + placement.y;
      if (Math.hypot((placementX - px) * CELL, (placementY - py) * CELL) > 120) continue;
      (placement.components || []).forEach((component, componentIndex) => {
        const offset = rotateOffset(component.dx, component.dz, placement.yaw || 0);
        const localX = placement.x + offset.x, localY = placement.y + offset.y;
        const worldX = o.x + localX, worldZ = o.y + localY;
        const floor = sourceLandscapeFloorAt(localX, localY);
        const scaleValue = Number(component.scale) || 1;
        out.push({
          id: `${placement.id}-${componentIndex}`,
          mesh: component.mesh,
          matrix: sourceMatrix({
            x: worldX * CELL,
            y: floor + (Number(component.elevation) || 0) - (Number(component.sink) || 0),
            z: worldZ * CELL,
            scaleX: scaleValue,
            scaleY: scaleValue,
            scaleZ: scaleValue,
            yaw: (placement.yaw || 0) + (component.yaw || 0),
            pitch: component.pitch || 0,
            roll: component.roll || 0,
          }),
          zone: ZONE.sourceSpace,
          structural: true,
          sourceStructure: placement.id,
        });
      });
    }
    return out;
  }

  function surfaceArchitectureInstances(px, py) {
    if (![CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return [];
    const o = landscapeOrigin();
    const out = [...landingPropInstances(), ...connectorPropInstances()];
    if (state.phase === CHUNK_SURF_PHASE.TRANSFORMING) return out;
    out.push(...structurePropInstances(px, py));
    for (let i = 0; i < SOURCE_LEAK_COUNT; i += 1) {
      const localX = (rand(state.seed, i, 71) - 0.5) * LANDSCAPE_W * 0.94;
      const depth = 8 + rand(state.seed, i, 131) * (LANDSCAPE_H - 16);
      const localY = -depth;
      // The drowned architecture surfaces more the deeper (nearer the end) you go.
      const resolution = 0.16 + 0.84 * smoothstep(40, LANDSCAPE_H - 30, depth);
      if (rand(state.seed, i, 199) > resolution) continue;
      const worldX = o.x + localX, worldZ = o.y + localY;
      if (Math.hypot((worldX - px) * CELL, (worldZ - py) * CELL) > 108) continue;
      const floor = sourceLandscapeFloorAt(localX, localY);
      const piece = SOURCE_LEAK_MESHES[Math.floor(rand(state.seed, i, 233) * SOURCE_LEAK_MESHES.length)];
      const scale = 0.8 + rand(state.seed, i, 251) * 1.2;
      // Half-sunk: many pieces rise only partway out of the field, still drowned.
      const sink = rand(state.seed, i, 281) * 1.7;
      out.push({
        id: `source-leak-${i}`,
        mesh: piece,
        matrix: sourceMatrix({
          x: worldX * CELL, y: floor - sink + 0.05, z: worldZ * CELL,
          scaleX: scale, scaleY: scale, scaleZ: scale,
          yaw: rand(state.seed, i, 353) * Math.PI * 2,
          roll: (rand(state.seed, i, 401) - 0.5) * 0.2,
          pitch: (rand(state.seed, i, 431) - 0.5) * 0.14,
        }),
        zone: ZONE.sourceSpace,
        structural: true,
      });
    }
    // The drowned cathedral itself, standing at the horizon: a dense cluster of
    // vault, bells, organ and pews around the final page, mostly risen where the
    // rest of the field is still code. It reads from a distance as the place the
    // whole space is sinking toward — the engloutie you walk into.
    const final = landmarkPoint('final-page');
    if (Math.hypot((final.x - px) * CELL, (final.y - py) * CELL) < 150) {
      const CATHEDRAL = ['chapel_vault', 'tower_bell_01', 'tower_bell_04', 'tower_frame', 'organ_console', 'organ_pipes', 'altar_table', 'lectern', 'pew', 'pew', 'chapel_inner_screen'];
      for (let i = 0; i < 34; i += 1) {
        const ang = i * 0.79, rad = 3 + (i % 7) * 3.4;
        const worldX = final.x + Math.cos(ang) * rad, worldZ = final.y - 4 + Math.sin(ang) * rad * 0.8;
        const floor = sourceLandscapeFloorAt(worldX - o.x, worldZ - o.y);
        const piece = CATHEDRAL[i % CATHEDRAL.length];
        const scale = 1.1 + rand(state.seed, i, 617) * 1.4;
        out.push({
          id: `source-cathedral-${i}`,
          mesh: piece,
          matrix: sourceMatrix({ x: worldX * CELL, y: floor - rand(state.seed, i, 641) * 0.7, z: worldZ * CELL, scaleX: scale, scaleY: scale * (piece.startsWith('tower') ? 1.5 : 1), scaleZ: scale, yaw: ang + Math.PI, roll: (rand(state.seed, i, 673) - 0.5) * 0.12 }),
          zone: ZONE.sourceSpace,
          structural: true,
        });
      }
    }
    return out;
  }

  // The current: motes of source drift down the spine toward the end — a moving,
  // non-dialogue wayfinding cue (this way finishes it). They ride the terrain and
  // loop over the field length so the stream never runs dry.
  function driftInstances(px, py, time) {
    if (![CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase)) return [];
    const o = landscapeOrigin();
    const out = [];
    const span = LANDSCAPE_H;
    for (let i = 0; i < 52; i += 1) {
      const lane = (rand(state.seed, i, 61) - 0.5) * 26;
      const speed = 5 + rand(state.seed, i, 83) * 5;
      const phase = (rand(state.seed, i, 97) + time * speed / span) % 1;
      const depth = 6 + phase * (span - 12);
      const worldX = o.x + lane, worldZ = o.y - depth;
      if (Math.hypot((worldX - px) * CELL, (worldZ - py) * CELL) > 72) continue;
      const floor = sourceLandscapeFloorAt(lane, -depth);
      out.push({
        id: `source-drift-${i}`,
        mesh: 'loose_note',
        matrix: sourceMatrix({ x: worldX * CELL, y: floor + 0.5 + Math.sin(time * 1.4 + i) * 0.25, z: worldZ * CELL, scaleX: 0.5, scaleY: 0.5, scaleZ: 0.5, pitch: time * 0.8 + i, yaw: time * 0.5 + i, roll: i }),
        zone: ZONE.sourceSpace,
        structural: false,
      });
    }
    return out;
  }

  // ── WHAT STANDS IN THE BELL PASSAGE ───────────────────────────────────────
  //
  // The same instancing the landscape's giants use — a mesh, a matrix, a zone —
  // because they are the same kind of object: a real building mesh at a size the
  // building never had. The room at the end goes through here too, so what
  // resolves out of the far end and what the player finally walks into are one
  // list.
  //
  // The room fades UP rather than appearing: `resolve` is a function of depth
  // (sourceBellsRoomResolve), and a room that switched on at a threshold would
  // be the cut this whole passage exists to stop being.
  function bellPassageInstances(px, py) {
    if (state.phase !== CHUNK_SURF_PHASE.BELLS) return [];
    const o = landscapeOrigin();
    const local = player.y - o.y;
    const resolve = sourceBellsRoomResolve(local);
    const out = [];
    const place = (entry, { fade = 1 } = {}) => {
      const worldX = o.x + entry.x, worldZ = o.y + entry.y;
      if (Math.hypot((worldX - px) * CELL, (worldZ - py) * CELL) > 260) return;
      const scale = Number(entry.scale) || 1;
      out.push({
        id: entry.id,
        mesh: entry.mesh,
        matrix: sourceMatrix({
          x: worldX * CELL,
          y: (SOURCE_TIER_BY_ID.bells?.height ?? 15.2)
            + (Number(entry.elevation) || 0) - (Number(entry.sink) || 0),
          z: worldZ * CELL,
          scaleX: scale * fade, scaleY: scale * fade, scaleZ: scale * fade,
          yaw: entry.yaw || 0,
          pitch: entry.pitch || 0,
          roll: entry.roll || 0,
        }),
        zone: ZONE.sourceSpace,
        structural: true,
        sourceStructure: 'bell-passage',
      });
    };
    for (const entry of SOURCE_BELL_PASSAGE) place(entry);
    // The room arrives by growing into itself. Below a tenth it is not drawn at
    // all, which keeps two hundred metres of the walk honest about there being
    // nothing out there yet.
    if (resolve > 0.1) for (const entry of SOURCE_BELLS_ROOM) place(entry, { fade: resolve });
    return out;
  }

  function propInstances(px = player.x, py = player.y, options = {}) {
    if (state.phase === CHUNK_SURF_PHASE.BELLS) return bellPassageInstances(px, py);
    if ([CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) return pageInstances(px, py, options);
    if ([CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) {
      const arch = surfaceArchitectureInstances(px, py);
      if (options.reducedMotion || state.phase === CHUNK_SURF_PHASE.COMPLETED) return arch;
      return [...arch, ...driftInstances(px, py, options.time || 0)];
    }
    return [];
  }
  function sourceCorpus() {
    if (sourceCorpusCache) return sourceCorpusCache;
    const seen = new Set();
    const corpus = [];
    for (const entry of Object.values(SOURCE_ATLAS.entries || {})) {
      if (!entry?.text || seen.has(entry.text)) continue;
      seen.add(entry.text);
      corpus.push(entry.text);
    }
    for (const reference of (SOURCE_ATLAS.references || []).slice(0, 28)) {
      for (const symbol of [reference.from, reference.to]) {
        if (!symbol || seen.has(symbol)) continue;
        seen.add(symbol);
        corpus.push(symbol);
      }
    }
    sourceCorpusCache = Object.freeze(corpus);
    return sourceCorpusCache;
  }

  function cachedArchitecture(px, py) {
    const o = landscapeOrigin();
    const centerTileX = Math.floor(px / SOURCE_ARCH_TILE_CELLS);
    const centerTileY = Math.floor(py / SOURCE_ARCH_TILE_CELLS);
    const minTileX = Math.floor((o.x - LANDSCAPE_W / 2) / SOURCE_ARCH_TILE_CELLS);
    const maxTileX = Math.floor((o.x + LANDSCAPE_W / 2) / SOURCE_ARCH_TILE_CELLS);
    const minTileY = Math.floor((o.y - LANDSCAPE_H) / SOURCE_ARCH_TILE_CELLS);
    const maxTileY = Math.floor((o.y + LANDSCAPE_FRONT) / SOURCE_ARCH_TILE_CELLS);
    const transformBand = state.phase === CHUNK_SURF_PHASE.TRANSFORMING
      ? Math.floor(clamp01(transformElapsed / SOURCE_TRANSFORM_SECONDS) * 8) : 8;
    const progressKey = `${state.phase}:${state.pageStage}:${transformBand}:${o.x}:${o.y}`;
    const tileCoords = [];
    for (let tileY = Math.max(minTileY, centerTileY - SOURCE_ARCH_TILE_RADIUS); tileY <= Math.min(maxTileY, centerTileY + SOURCE_ARCH_TILE_RADIUS); tileY += 1) {
      for (let tileX = Math.max(minTileX, centerTileX - SOURCE_ARCH_TILE_RADIUS); tileX <= Math.min(maxTileX, centerTileX + SOURCE_ARCH_TILE_RADIUS); tileX += 1) {
        tileCoords.push({ tileX, tileY });
      }
    }
    const key = `${progressKey}:${tileCoords.map(({ tileX, tileY }) => `${tileX},${tileY}`).join(';')}`;
    if (sceneAssemblyCache.has(key)) return sceneAssemblyCache.get(key);
    const batches = tileCoords.map(({ tileX, tileY }) => {
      const tileKey = `${progressKey}:tile:${tileX}:${tileY}`;
      if (!sceneCache.has(tileKey)) {
        sceneCache.set(tileKey, landscapeArchitectureTextInstances(
          tileX * SOURCE_ARCH_TILE_CELLS + SOURCE_ARCH_TILE_CELLS / 2,
          tileY * SOURCE_ARCH_TILE_CELLS + SOURCE_ARCH_TILE_CELLS / 2,
          { tileX, tileY },
        ));
        if (sceneCache.size > 64) sceneCache.delete(sceneCache.keys().next().value);
      }
      return {
        key: tileKey,
        bounds: {
          minX: tileX * SOURCE_ARCH_TILE_CELLS * CELL,
          maxX: (tileX + 1) * SOURCE_ARCH_TILE_CELLS * CELL,
          minZ: tileY * SOURCE_ARCH_TILE_CELLS * CELL,
          maxZ: (tileY + 1) * SOURCE_ARCH_TILE_CELLS * CELL,
        },
        instances: sceneCache.get(tileKey),
      };
    });
    const instances = batches.flatMap((batch) => batch.instances);
    if (instances.length > SOURCE_ARCH_MAX_INSTANCES) {
      throw new Error(`Source architecture exceeds resident budget: ${instances.length}/${SOURCE_ARCH_MAX_INSTANCES}`);
    }
    const assembled = { key, instances, batches };
    sceneAssemblyCache.set(key, assembled);
    if (sceneAssemblyCache.size > 8) sceneAssemblyCache.delete(sceneAssemblyCache.keys().next().value);
    return assembled;
  }

  function sourceScene({ px = player.x, py = player.y, presence = null, time = 0, reducedMotion = false } = {}) {
    const cached = cachedArchitecture(px, py);
    const dynamicInstances = [
      ...interactionTextInstances(),
      ...resolvedIntervalTextInstances(),
      ...densityWakeTextInstances(presence?.active ? presence : null, reducedMotion ? 0 : time),
    ];
    return {
      schema: 1,
      key: cached.key,
      atlasKey: `${SOURCE_ATLAS.schemaVersion}:${SOURCE_ATLAS.corpusHash || Object.keys(SOURCE_ATLAS.entries || {}).length}`,
      corpus: sourceCorpus(),
      staticInstances: cached.instances,
      staticBatches: cached.batches,
      dynamicInstances,
      look: sourceLook(),
      objective: sourceObjective(),
      weather: { rain: pressureFrame({ reducedMotion }).rain, moon: 1, clouds: 1 },
      landing: sourceLandingContract(),
    };
  }

  function textInstances({ px = player.x, py = player.y, presence = null, time = 0, reducedMotion=false } = {}) {
    const scene = sourceScene({ px, py, presence, time, reducedMotion });
    return [...scene.staticInstances, ...scene.dynamicInstances];
  }

  const navigation = {
    canOccupy: (x, y) => !!cellAt(x, y),
    resolveMove(from, target, maxDistance) {
      if (lineOfSight(geometry.canStep, from, target)) {
        const dx = target.x - from.x, dy = target.y - from.y, d = Math.hypot(dx, dy);
        if (d < 0.001) return { ...from };
        const step = Math.min(d, maxDistance);
        const direct = { x: from.x + dx / d * step, y: from.y + dy / d * step };
        if (cellAt(direct.x, direct.y) && geometry.canStep(from.x, from.y, direct.x, direct.y).ok) return direct;
      }
      const key = `${Math.floor(from.x)},${Math.floor(from.y)}:${Math.floor(target.x)},${Math.floor(target.y)}`;
      if (pathCache.key !== key || pathCache.path.length < 2) {
        pathCache = { key, path: aStar(geometry.canStep, (x, y) => !!cellAt(x, y), from, target) };
      }
      while (pathCache.path.length > 1 && Math.hypot(pathCache.path[0].x - from.x, pathCache.path[0].y - from.y) < 0.45) pathCache.path.shift();
      const next = pathCache.path[0];
      if (!next) return { ...from };
      const dx = next.x - from.x, dy = next.y - from.y, d = Math.hypot(dx, dy);
      const step = Math.min(d, maxDistance);
      const moved = d > 0.001 ? { x: from.x + dx / d * step, y: from.y + dy / d * step } : { ...from };
      return cellAt(moved.x, moved.y) && geometry.canStep(from.x, from.y, moved.x, moved.y).ok ? moved : { ...from };
    },
  };

  function beginHushContact() {
    if (!hushMode().colliding || traversal || pendingContact || captureMovementRequired) return null;
    rememberDialogueFact(SOURCE_DIALOGUE_FACT.HUSH_CONTACT, true, { latencyReads: 0 });
    pendingContact = nextSourceContact(state.sourceContacts, { seed: state.seed });
    protectionRemaining = Math.max(protectionRemaining, 30);
    return pendingContact;
  }

  function contactDropTier() {
    const o = landscapeOrigin();
    const current = sourceTierAt(player.y - o.y).id;
    if (current === 'return') return 'trace';
    if (current === 'trace') return 'fork';
    return 'arrival';
  }

  function resolveHushContactChoice(choiceId) {
    if (!pendingContact) return { handled: false, checkpoint: checkpointPosition() };
    const encounter = pendingContact;
    const before = normalizeSourceContactState(state.sourceContacts);
    const contact = resolveSourceContact(before, encounter, choiceId);
    const insightGained = contact.insights.find((id) => !before.insights.includes(id)) || null;
    const dropTier = contactDropTier();
    const checkpointId = tierCheckpointId(dropTier);
    dispatch({ type: 'SOURCE_CONTACT_RESOLVED', contact, checkpointId }, { immediate: true });
    pendingContact = null;
    protectionRemaining = Math.max(0, 1.25);
    restartGraceRemaining = Math.max(restartGraceRemaining, 5);
    captureMovementRequired = true;
    captureMovementAnchor = { ...checkpointPosition(checkpointId) };
    noProgressSeconds = 0;
    return {
      handled: true,
      checkpoint: checkpointPosition(checkpointId),
      insightGained,
      bossExposed: sourceBossExposed(contact),
      contact,
      encounterId: encounter.id,
    };
  }

  // Compatibility entry point for deterministic tests and old callers. The
  // live game always opens the authored choice scene before relocation.
  function handleHushContact() {
    const encounter = beginHushContact();
    if (!encounter) return checkpointPosition();
    const fallback = encounter.choices.find((choice) => !choice.aligns) || encounter.choices[0];
    return resolveHushContactChoice(fallback?.id).checkpoint;
  }

  function sourceSurfaceLines(limit = 96) {
    const out = [];
    const sectors=Object.entries(SOURCE_ATLAS.sectors||{});
    const perSector=Math.max(1,Math.floor(limit/Math.max(1,sectors.length)));
    for (const [id,sector] of sectors) {
      for (const line of (sector.sourceLines || []).slice(0,perSector)) {
        out.push({...line,sourceLayer:SOURCE_LAYER_BY_SECTOR[id]||1});
      }
    }
    return out.slice(0,limit);
  }

  function paperTonePoint(){
    return state.phase===CHUNK_SURF_PHASE.HAYSTACK?haystackPagePoint():null;
  }

  function exitSnapshot() {
    const final = landmarkPoint('final-page') || { x: player.x, y: player.y };
    return {
      schema: 2,
      redaction: state.redaction,
      bestEligible: state.bestEligible,
      finalEncounter: { ...state.finalEncounter },
      optionalTraces: [...state.optionalTraces],
      camera: { x: final.x, y: final.y + 8, facing: 0 },
      unresolvedDensity:{status:'present',form:'unseen',near:{x:final.x-14,y:final.y-10}},
      sourceIds: REDACTIONS.map((entry) => sourceLineByAnchor(entry.sourceAnchor)?.id).filter(Boolean),
    };
  }

  function setPlayerPosition(next) {
    const candidate = { ...player, ...(next || {}) };
    // The traversal clock already owns the exact interpolated position. Running
    // the stationary connector normalizer over those frames snapped the body to
    // one lip or the other while the camera was still between floors.
    if (traversal) return;
    if ([CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase)) {
      const o = landscapeOrigin();
      const feature = sourceFeatureAt(candidate.x - o.x, candidate.y - o.y);
      if (feature?.kind === 'lift') {
        const lift = sourceLiftById(feature.id);
        const upperSide = candidate.y - o.y <= lift.y;
        candidate.y = o.y + lift.y + (upperSide ? -(lift.depth + 1.25) : lift.depth + 1.25);
      } else if (feature?.kind === 'chute') {
        const stable=checkpointPosition();
        candidate.x=stable.x;candidate.y=stable.y;candidate.facing=stable.facing;
      }
    }
    player = candidate;
    if(captureMovementRequired&&!captureMovementAnchor){
      captureMovementAnchor={x:candidate.x,y:candidate.y};
    }
  }

  function textSpaceActive() {
    return state.firstLiftCompleted
      && [CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase);
  }

  function localLights() {
    const understood=normalizeSourceContactState(state.sourceContacts).insights.length;
    return sourceLandingLights(landscapeOrigin()).map((light)=>({
      ...light,
      intensity:light.intensity+understood*.18,
      penetration:Math.min(1,light.penetration+understood*.025),
    }));
  }

  return {
    geometry,
    active: () => !!state.active,
    state: () => state,
    setPlayerPosition,
    textSpaceActive,
    localLights,
    landingContract: sourceLandingContract,
    sourceLandingHushFrame,
    traversalFrame,
    beginTraversal,
    tickTraversal,
    onStep,
    tick,
    focusAt,
    readablePagesProbe: () => readablePages().map(({ id, x, y, index }) => ({ id, x, y, index })),
    inspectFocused,
    propInstances,
    structurePlacements: () => structures,
    textInstances,
    sourceScene,
    sourceObjective,
    sourceLook,
    pressureFrame,
    sourceBracketFrame,
    hushMode,
    protectMoment,
    finalEncounterRequest,
    requestBossBattle,
    commitContact,
    completeNormalExit,
    resolveFinalEncounter,
    failFinalEncounter,
    horizonFrame,
    // The bell passage: the tower road, walked. See SOURCE_BELLS.
    bellsFrame,
    enteredBells,
    enterBellsRoom,
    chooseHorizonExit,
    horizonBustPoint,
    horizonBustPlacement,
    horizonBand,
    horizonEdge,
    takeHorizonMarker,
    talkToHorizonBust,
    decideHorizonBust,
    takeHorizonBustDetour,
    navigation,
    checkpointPosition,
    beginHushContact,
    resolveHushContactChoice,
    handleHushContact,
    sourceSurfaceLines,
    paperTonePoint,
    exitSnapshot,
    probe: () => ({
      ...chunkSurfProbe(state),
      transitionProgress: state.phase === CHUNK_SURF_PHASE.TRANSFORMING ? clamp01(transformElapsed / SOURCE_TRANSFORM_SECONDS) : state.phase === CHUNK_SURF_PHASE.LANDSCAPE ? 1 : 0,
      pageCount: pageCount(state.hallMaxDistance),
      planOrigin: lastPlan ? { x: lastPlan.originX, y: lastPlan.originY } : null,
      focus: lastFocus ? { kind: lastFocus.kind, id: lastFocus.id, source: lastFocus.sourceAnchor || null } : null,
      objective: sourceObjective(),
      hush: hushMode(),
      traversal: traversalFrame(),
      horizonFrame: horizonFrame(),
      landing: {
        ...sourceLandingContract(),
        tableau: sourceLandingHushFrame(),
        textSpaceActive: textSpaceActive(),
        weatherRemaining: landingRainRemaining,
      },
      contact: {
        captures:normalizeSourceContactState(state.sourceContacts).captures,
        insightIds:[...normalizeSourceContactState(state.sourceContacts).insights],
        bossExposed: sourceBossExposed(state.sourceContacts),
        pendingBeatId: pendingContact?.id || null,
        movementRequired: captureMovementRequired,
        graceSeconds: restartGraceRemaining,
      },
      haystack: pressureFrame({ reducedMotion: false }),
      bracket: sourceBracketFrame(),
      geometryBoundary: {
        physicalBeyondBoundary: !!physicalCellAt(0, SOURCE_HALL_END_Y - 2),
        visualBeyondBoundary: !!renderCellAt(0, SOURCE_HALL_END_Y - 2),
        y: SOURCE_HALL_END_Y,
        metres: SOURCE_HALL_END_METRES,
      },
      realPage: state.phase === CHUNK_SURF_PHASE.HAYSTACK ? {
        ...haystackPagePoint(),
        guided: true,
      } : null,
      sourceSceneCacheSize: sceneCache.size,
      sourceStructureCount: structures.length,
      sourceSeededStructureCount: structures.filter((entry) => entry.seeded).length,
      sourceSceneKey: sourceScene({ presence: null }).key,
      visibleGlyphs: textInstances({ presence: null }).reduce((sum, entry) => sum + String(entry.text || '').length, 0),
    }),
  };
}

export { SOURCE_ATLAS };
