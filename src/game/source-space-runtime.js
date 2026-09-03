import SOURCE_ATLAS from '../../content/chunk-surf/source-atlas.json' with { type: 'json' };
import { MOVE_MS } from '../config.js';
import { CELL, EYE, F, MATERIAL, ZONE } from '../data/floorplan/legend.js';
import { SCENE_DOCK_LABEL } from '../data/space-labels.js';
import { encodeH } from '../world/floorplan.js';
import { HORIZON_PROFILE } from '../data/generated/horizon-profile.js';
import {
  freshHorizonTransport,
  horizonTransportReadings,
  horizonTransportThreaded,
  threadHorizonTransport,
  HORIZON_TRANSPORT_OPTIONS,
} from './horizon-transport.js';
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
import { LIGHT_KIND } from '../data/conservatory-lights.js';
import {
  SOURCE_APPROACH_CELLS, SOURCE_CHUTES, SOURCE_HORIZON, SOURCE_LIFTS, SOURCE_TIER_BY_ID,
  SOURCE_PRE_TAPE, sourcePreTapeProgress,
  sourceChuteById, sourceFeatureAt, sourceHorizonDepth, sourceHorizonSeconds,
  sourceHorizonSlice, sourceLiftById, sourceTierAt,
  sourceTierHeightAt, sourceTraversal,
  SOURCE_BELLS,
  SOURCE_BELLS_ROOM,
  SOURCE_BELL_PASSAGE,
  inSourceBellsRoom,
  sourceBellsDepth,
  bellSwingAt,
  sourceBellsRoomResolve,
} from '../data/source-level.js';
import {
  SOURCE_LANDING_ENTRY_LOCAL,
  SOURCE_LANDING_FIELD_EDGE_LOCAL_Y,
  SOURCE_LANDING_HUSH_LOCAL,
  SOURCE_LANDING_OPENING_LOCAL,
  SOURCE_LANDING_PORTAL_DOOR_ID,
  SOURCE_LANDING_PORTAL_LOCAL,
  SOURCE_LANDING_REAR_APERTURE,
  SOURCE_LANDING_REAR_LOCAL,
  SOURCE_THRESHOLD_LIGHT_ID,
  sourceEmergencyFrame,
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
import {
  HORIZON_BUST_REFUSAL,
  horizonBustAudience,
} from './horizon-bust.js';
import { sourceSensoryMix } from './source-sensory.js';

// The anchored plan contains the complete 620-cell-deep Source field plus the
// 720-cell-wide white sea. One retained upload is still cheaper than rebuilding
// it while the FOH leaf moves; the leaf itself remains a tiny plan patch.
export const SOURCE_PLAN_WINDOW = 768;

export const SOURCE_PLAN_SNAP = 16;
export const SOURCE_ARCH_TILE_CELLS = 128;
export const SOURCE_ARCH_TILE_RADIUS = 2;
export const SOURCE_ARCH_MAX_INSTANCES = 20000;
export const SOURCE_SEEDED_STRUCTURE_COUNT = 14;
export const SOURCE_TRANSFORM_SECONDS = 5.5;
export const SOURCE_LANDING_PORTAL_SECONDS = 2.2;
export const SOURCE_ENTRY = Object.freeze({ x: 0, y: 0, facing: 0 });

const HALL_HALF_WIDTH = 6; // runtime cells = three metres from centre to wall
const HALL_CEIL = 4.5;
export const SOURCE_HALL_END_Y = -(SOURCE_HALL_END_METRES / CELL);
const LANDSCAPE_W = 360; // 180 metres
const SOURCE_VOID_HALF_WIDTH = 360; // cells: a 360m-wide sea for a 140m walk
const SOURCE_VOID_W = SOURCE_VOID_HALF_WIDTH * 2;
// The original field is 340 cells deep. The white approach moves all of Source
// proper out intact rather than compressing any later beat.
const LANDSCAPE_H = 340 + SOURCE_APPROACH_CELLS;
const LANDSCAPE_FRONT = 18; // room behind the field origin, including the grey-door wall
export const SOURCE_APPROACH_TARGET_SECONDS = 30;
export const SOURCE_APPROACH_RED_ONSET_SECONDS = 10;
const SOURCE_FIRST_STAIR = SOURCE_CHUTES.find((chute) => chute.id === 'chute-fork');
if (!SOURCE_FIRST_STAIR) throw new Error('Source approach requires chute-fork');
const SOURCE_APPROACH_STAIR_FOOT_Y = SOURCE_FIRST_STAIR.y + SOURCE_FIRST_STAIR.run;
export const SOURCE_APPROACH_TRAVEL_CELLS = Math.abs(
  SOURCE_LANDING_PORTAL_LOCAL.y - SOURCE_APPROACH_STAIR_FOOT_Y,
);
export const SOURCE_APPROACH_PACE = SOURCE_APPROACH_TARGET_SECONDS * 1000
  / Math.max(1, SOURCE_APPROACH_TRAVEL_CELLS * MOVE_MS);
const SOURCE_APPROACH_DESTINATION = Object.freeze({
  x: SOURCE_FIRST_STAIR.x,
  y: SOURCE_APPROACH_STAIR_FOOT_Y + 2,
  facing: 0,
});

// Shifted out by SOURCE_APPROACH_CELLS with the tiers they stand on, so each
// landmark keeps its position WITHIN its tier and the pacing past the approach
// is exactly what it was.
//
// Exported because the specs were keeping a hand-copied duplicate of this table,
// which is precisely the thing that goes quietly wrong when the field is
// retuned: the copy kept pointing at the old tiers and asserted nothing.
export const SOURCE_LANDMARK_OFFSETS = Object.freeze({
  'fork-room': { x: 0, y: -42 - SOURCE_APPROACH_CELLS, sector: 'fork' },
  'surfer-origin': { x: -92, y: -104 - SOURCE_APPROACH_CELLS, sector: 'student' },
  'work-order-loop': { x: 92, y: -104 - SOURCE_APPROACH_CELLS, sector: 'workOrder' },
  'recordist-loop': { x: 0, y: -142 - SOURCE_APPROACH_CELLS, sector: 'recordist' },
  'body-room': { x: 0, y: -232 - SOURCE_APPROACH_CELLS, sector: 'body' },
  'final-page': { x: 80, y: -312 - SOURCE_APPROACH_CELLS, sector: 'final' },
});
const LANDMARK_OFFSETS = SOURCE_LANDMARK_OFFSETS;

const REDACTIONS = Object.freeze([
  { id: 'comfort', sourceAnchor: 'source-not-body', dx: -10 },
  { id: 'body', sourceAnchor: 'borrowed-body-return', dx: 0 },
  { id: 'source', sourceAnchor: 'source-you', dx: 10 },
]);
const ROUTE_SEGMENTS = Object.freeze([
  { id: 'critical-spine', kind: 'critical', halfWidth: 6, points: [{ x: 0, y: 4 }, { x: 0, y: -42 - SOURCE_APPROACH_CELLS }, { x: 0, y: -142 - SOURCE_APPROACH_CELLS }, { x: 0, y: -232 - SOURCE_APPROACH_CELLS }] },
  { id: 'surfer-loop', kind: 'optional', halfWidth: 4.5, points: [{ x: 0, y: -42 - SOURCE_APPROACH_CELLS }, { x: -44, y: -70 - SOURCE_APPROACH_CELLS }, { x: -92, y: -104 - SOURCE_APPROACH_CELLS }, { x: -54, y: -132 - SOURCE_APPROACH_CELLS }, { x: 0, y: -142 - SOURCE_APPROACH_CELLS }] },
  { id: 'work-order-loop', kind: 'optional', halfWidth: 4.5, points: [{ x: 0, y: -42 - SOURCE_APPROACH_CELLS }, { x: 44, y: -70 - SOURCE_APPROACH_CELLS }, { x: 92, y: -104 - SOURCE_APPROACH_CELLS }, { x: 54, y: -132 - SOURCE_APPROACH_CELLS }, { x: 0, y: -142 - SOURCE_APPROACH_CELLS }] },
  { id: 'final-causeway', kind: 'critical', halfWidth: 6, points: [{ x: 0, y: -232 - SOURCE_APPROACH_CELLS }, { x: 24, y: -260 - SOURCE_APPROACH_CELLS }, { x: 48, y: -282 - SOURCE_APPROACH_CELLS }, { x: 80, y: -312 - SOURCE_APPROACH_CELLS }] },
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
    id: 'source-hero-stand-gate', kind: 'music-stand-gate', hero: true, x: 0, y: -30 - SOURCE_APPROACH_CELLS, yaw: 0,
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
    id: 'source-hero-string-fall', kind: 'string-fall', hero: true, x: -128, y: -104 - SOURCE_APPROACH_CELLS, yaw: -0.18,
    components: [
      { mesh: 'cello', dx: -3, dz: 0, scale: 7.2, yaw: -0.28, roll: -0.16, sink: 0.55 },
      { mesh: 'violin', dx: 6, dz: 2, scale: 15, yaw: 0.55, pitch: -Math.PI / 2, roll: 0.22, sink: 0.32 },
      { mesh: 'music_stand', dx: 2, dz: -7, scale: 7.4, yaw: 1.15, roll: 0.34, sink: 0.8 },
    ],
    colliders: [{ dx: 0, dz: -1, halfX: 10, halfY: 10, yaw: -0.18 }],
  },
  {
    id: 'source-hero-piano-rise', kind: 'piano-rise', hero: true, x: 128, y: -112 - SOURCE_APPROACH_CELLS, yaw: 0.14,
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
    id: 'source-hero-percussion-shelf', kind: 'percussion-shelf', hero: true, x: 44, y: -184 - SOURCE_APPROACH_CELLS, yaw: -0.08,
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
    id: 'source-hero-bust-tribunal', kind: 'bust-tribunal', hero: true, x: -52, y: -250 - SOURCE_APPROACH_CELLS, yaw: 0.12,
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
  // No seeded giant is allowed to puncture the white approach. Source proper
  // begins at the fork tier and retains all of its existing architecture.
  if (placement.y + radius > SOURCE_TIER_BY_ID.fork.from - 12
      || placement.y - radius < -LANDSCAPE_H + SOURCE_STRUCTURE_EDGE_MARGIN) return false;
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
  const emergence = smoothstep(Math.abs(SOURCE_TIER_BY_ID.fork.from) + 20, LANDSCAPE_H - 36, depth);
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
    const minDepth = Math.abs(SOURCE_TIER_BY_ID.fork.from) + 24;
    const y = -(minDepth + rand(seed, candidate, 751) * Math.max(1, LANDSCAPE_H - minDepth - 24));
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

// A ROUND REJECT BEFORE ANY ORIENTED-BOX MATHS.
//
// renderPlanFor walks 384x384 = 147,456 cells and asks this for most of them.
// Nineteen placements carrying twenty-four colliders meant up to 3.5 million
// rotate-and-compare tests per plan rebuild — and the plan rebuilds twice while
// the FOH leaf swings (closed -> opening -> open), which is what dropped the
// frame to nothing for the length of the animation.
//
// placementRadius already exists and bounds every collider on a placement, so a
// squared-distance test throws out all but the one or two placements a cell
// could possibly be inside. The exact test is unchanged; it just runs almost
// never instead of always.
const structureRadiusCache = new WeakMap();
function cachedPlacementRadius(placement) {
  let radius = structureRadiusCache.get(placement);
  if (radius === undefined) {
    radius = placementRadius(placement);
    structureRadiusCache.set(placement, radius);
  }
  return radius;
}

export function sourceStructureCollisionAt(placements, localX, localY) {
  const list = placements || [];
  for (const placement of list) {
    const radius = cachedPlacementRadius(placement);
    const dx = localX - placement.x, dy = localY - placement.y;
    if (dx * dx + dy * dy > radius * radius) continue;
    for (const collider of placement.colliders || []) {
      if (pointInStructureCollider(localX, localY, placement, collider)) return placement;
    }
  }
  return null;
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
  const marginX = (SOURCE_PLAN_WINDOW - SOURCE_VOID_W) / 2;
  const marginY = (SOURCE_PLAN_WINDOW - LANDSCAPE_H) / 2;
  return {
    x: Math.floor((Number(origin.x || 0) - SOURCE_VOID_HALF_WIDTH - marginX) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP,
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
  // The body needs a floor in the white absence, but the eye must never find a
  // mound, path, seam or terrain cue in it.
  if (ly <= SOURCE_LANDING_FIELD_EDGE_LOCAL_Y && ly >= SOURCE_APPROACH_DESTINATION.y) return 0;
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
} = {}) {
  let state = normalizeChunkSurfState(initialState);
  let sourceDialogue = normalizeSourceDialogueState(state.haystackDialogue, {
    seed: state.seed,
    facts: state.profile?.sourceMemoryFacts || {},
  });
  let player = { x: SOURCE_ENTRY.x, y: SOURCE_ENTRY.y, facing: SOURCE_ENTRY.facing };
  // The three dials on the machine at the edge of the field. Runtime-local
  // rather than reducer state: it is set and spent inside one visit to the pad,
  // and nothing after the crossing has any use for how it was threaded.
  let horizonTransport = freshHorizonTransport();
  let transformElapsed = 0;
  // A restored TRANSFORMING save has no still-page scene to cover it, so it
  // resumes already quiet. A live Haystack transition starts loud and drains
  // beneath the page until the page is lowered.
  let sourceSensorySettled = state.phase === CHUNK_SURF_PHASE.TRANSFORMING;
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
  let landingPortalElapsed = state.landingDoorOpen ? SOURCE_LANDING_PORTAL_SECONDS : 0;
  let landingRevealElapsed = state.landingDoorOpen ? SOURCE_LANDING_PORTAL_SECONDS : 0;
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
  const landingSceneCache = Object.freeze({
    key: 'source:landing-beat',
    instances: Object.freeze([]),
    batches: Object.freeze([]),
  });
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
    // renderPlanFor owns invalidation through its topology key. Keeping the
    // retained plan here is what lets portal-only state changes patch a dozen
    // cells instead of rebuilding the entire 512x512 field.
    onState(state, { immediate });
    return state;
  }

  function dispatch(event, options) { return setState(reduceChunkSurf(state, event), options); }

  // MEMOISED, BECAUSE THE PLAN ASKS FOR IT ONCE PER CELL.
  //
  // renderPlanFor walks a 384x384 window — 147,456 cells — and landscapeCell
  // consults this for every one of them. Building a fresh frozen ten-field
  // object that many times, twice, is most of why opening the FOH leaf dropped
  // the frame: the door's own animation is 2.2s and the stall made it read as
  // forever. Nothing here changes between those calls; the inputs are four
  // scalars.
  let portalFrameCache = null;
  function landingPortalFrame() {
    const sealed = !!state.landingDoorSealed;
    const requested = !!state.landingDoorOpen && !sealed;
    const closing = sealed && landingPortalElapsed > 0;
    const cacheKey = `${sealed}:${requested}:${closing}:${landingPortalElapsed}:${state.firstLiftCompleted}`;
    if (portalFrameCache?.key === cacheKey) return portalFrameCache.frame;
    const raw = (requested || closing) ? clamp01(landingPortalElapsed / SOURCE_LANDING_PORTAL_SECONDS) : 0;
    const progress = smoothstep(0, 1, raw);
    const frame = Object.freeze({
      id: SOURCE_LANDING_PORTAL_DOOR_ID,
      requested,
      closing,
      progress,
      passable: requested && (raw >= .58 || state.firstLiftCompleted),
      complete: requested && raw >= 1,
      locksMovement: false,
      sealed,
      redPressure: requested ? .28 + progress * .72 : 0,
      depth: requested ? progress * 7 : 0,
    });
    portalFrameCache = { key: cacheKey, frame };
    return frame;
  }

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
    // THE DOCK BEGINS AT THE PAGE, AND ONLY IN FRONT OF IT.
    //
    // Two wrong answers came before this one, and they were wrong in opposite
    // directions.
    //
    // The first put the dock at a fixed point twenty-eight cells past the end of
    // the hall and TELEPORTED the body into it. That is what made "behind you" a
    // place the player no longer occupied, so the corridor at their back had to
    // be reconstructed — and every reconstruction was a second corridor standing
    // where the first one wasn't.
    //
    // The second anchored it to the body. That fixed the teleport but built an
    // eleven-metre-wide room centred on a player standing in a six-metre
    // corridor: the dock's side walls flared out beside and behind them and the
    // result was a room INSIDE a corridor, which is not a place.
    //
    // Seating the dock at the fixed end line was visually plausible and
    // physically wrong: the still sheet can lie four to twelve metres before
    // that line, so after the rear corridor became render-only the player could
    // be left standing in non-walkable scenery with the room several cells away.
    //
    // The player's current y is the honest hinge. Put the dock's rear aperture
    // on that line: every cell in front belongs to the room, every cell behind
    // remains the Wile E. Coyote corridor, and the body is standing on the one
    // traversable threshold shared by both pictures. Align the aperture to the
    // body on x as well: the still sheet can sit at either corridor edge, and a
    // room centred elsewhere would leave that valid interaction point inside
    // the new rear wall.
    return {
      x: player.x - SOURCE_LANDING_REAR_LOCAL.x,
      // The '+' aperture occupies two sampled rows. Seat the body on its outer
      // row so the first step forward enters the room and the first step back is
      // refused, rather than granting one stray cell inside the painted hall.
      y: player.y - (SOURCE_LANDING_REAR_LOCAL.y + 1),
    };
  }

  function inLandscape(x, y) {
    if (![CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return false;
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    const progress=state.phase===CHUNK_SURF_PHASE.TRANSFORMING?clamp01(transformElapsed/SOURCE_TRANSFORM_SECONDS):1;
    const revealedDepth=LANDSCAPE_H*clamp01((progress-.12)/.88);
    const halfWidth = ly >= SOURCE_APPROACH_STAIR_FOOT_Y ? SOURCE_VOID_HALF_WIDTH : LANDSCAPE_W / 2;
    return lx >= -halfWidth && lx <= halfWidth && ly <= LANDSCAPE_FRONT && ly >= -revealedDepth;
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

  // ── THE WALK OUT OF THE FIELD ─────────────────────────────────────────────
  //
  // The field used to stop and the recording used to start in the same step, so
  // the tape was somewhere he was PUT rather than somewhere he got to, and it
  // had nothing to arrive out of. Two stretches stand between them now: the
  // outskirts, where the field's own structures thin out and stop, and the
  // nothing, which is what the source runs out into.
  //
  // Same phase as the horizon on purpose. The tape's playhead is
  // sourceHorizonDepth, which clamps to zero for anybody standing short of the
  // seam — so all three hundred and sixty metres of this play at second zero,
  // which is silence, and the piece starts on the step that crosses in. The
  // audio contract needed no change at all.
  function inPreTape(x, y) {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return false;
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    if (ly > SOURCE_PRE_TAPE.from || ly < SOURCE_PRE_TAPE.to) return false;
    return Math.abs(lx) <= SOURCE_PRE_TAPE.halfWidth;
  }

  function preTapeCell(x, y) {
    if (!inPreTape(x, y)) return null;
    // Flat, open, and lit by nothing, which is the whole of it.
    return {
      floor: SOURCE_TIER_BY_ID.outskirts?.height ?? 15.2,
      ceil: null,
      solid: false,
      zone: ZONE.sourceSpace,
    };
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

  // Returned by landscapeCell for a cell the Scene Dock owns and has walled.
  // Distinct from null, which means "nothing here — ask the next provider".
  const OWNED_SOLID = Object.freeze({ owned: true, solid: true });

  function landscapeCell(x, y) {
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    if (![CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE,
      CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return null;
    // The sheet covers an instantaneous ROOM swap. The wider field may keep its
    // authored reveal clock, but the Scene Dock itself must be complete on the
    // first uncovered frame — especially the rear threshold under the body.
    const landing = sourceLandingCellAt(lx, ly, { portalOpen: landingPortalFrame().passable });
    if (landing?.owned) {
      if (landing.solid) return OWNED_SOLID;
      return {
        floor: landing.floor,
        ceil: landing.ceil,
        flags: landing.flags,
        zone: landing.zone,
        material: landing.material,
        sourceLanding: true,
      };
    }
    // The whole opened field is one walkable ground — free roam, Oblivion-style,
    // no invisible causeway walls carving the space into corridors. The routes
    // survive only as brighter path material for wayfinding, not as the edges of
    // the floor. The only wall is the field's own perimeter (rendered as visible
    // code, see perimeterWallInstances); beyond it is sky.
    if (!inLandscape(x, y)) return null;
    // Only the room itself may project behind the field edge. Without this
    // shared terrain carve-out, the otherwise open Source ground wraps around
    // both side walls and reaches the rear of the get-in.
    //
    // The corridor is the exception, and it is not generic terrain: past the
    // rear plane the hall takes over (visualHallCell), which is bounded to its
    // own six-cell half width and cannot wrap anything.
    if (ly > SOURCE_LANDING_FIELD_EDGE_LOCAL_Y) return null;
    if (ly >= SOURCE_APPROACH_DESTINATION.y) return {
      floor: 0,
      ceil: 22,
      flags: F.SKY,
      zone: ZONE.sourceSpace,
      material: MATERIAL.sourceVoid,
      sourceVoid: true,
    };
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
    // BODY: the sheet is the boundary. As soon as it is taken, the corridor at
    // the player's back is a painted continuation only; it must never remain a
    // temporary escape route for the 5.5-second TRANSFORMING phase.
    return [CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase);
  }

  // THE CORRIDOR DOES NOT STOP EXISTING BECAUSE THE PHASE CHANGED.
  //
  // The player walks the haystack corridor, the room transforms around them, and
  // they are standing in the Scene Dock — with the corridor they arrived through
  // immediately behind them. Gating the hall on phase alone deleted it the
  // instant the landscape began, so the dock had nothing behind it and the beat
  // lost the one thing that made it a threshold instead of a room.
  //
  // The BODY contract is untouched: physicalHallCell still refuses every cell
  // past the phase change, so there is no walking back. This is the eye's, and
  // visualHallCell was already written for it — "there is deliberately no
  // forward bound".
  function hallRenderableInPhase() {
    if (hallVisibleInPhase()) return true;
    return [CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE].includes(state.phase)
      && !state.firstLiftCompleted;
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
    if (!hallRenderableInPhase()) return null;
    if (Math.abs(x) > HALL_HALF_WIDTH || y > 3) return null;
    // EYE CONTRACT: there is deliberately no forward bound. The finite render
    // plan/far plane is the only limit, so the hall appears to continue beyond
    // the physical line without creating navigation, collision, or objectives.
    return hallCellDescriptor();
  }

  // A WALL IS NOT AN ABSENCE OF OPINION.
  //
  // landscapeCell signals "solid" by returning null — but these were `||`
  // chains, where null does not mean WALL, it means "not my cell, ask the next
  // provider". The next provider is the hall. So every solid cell the Scene Dock
  // owns that happens to fall inside the hall's six-cell lateral band was being
  // answered by visualHallCell as open hall floor, and BOTH the FOH wall and the
  // rear plane rendered see-through — the dock drawn as a room with no walls
  // along its centre line.
  //
  // It only surfaced when the corridor was kept alive past the phase change
  // (hallRenderableInPhase): before that the hall answered null in the landscape
  // and the bug had nothing to leak through. The body never saw it because
  // physicalHallCell still refuses in this phase.
  //
  // So ownership is explicit. OWNED_SOLID means "the landing owns this cell and
  // it is a wall" — the chain stops there, for the eye and the body alike.
  function resolveSourceCell(x, y, hallCell) {
    const bells = bellsCell(x, y);
    if (bells) return bells;
    const preTape = preTapeCell(x, y);
    if (preTape) return preTape;
    const horizon = horizonCell(x, y);
    if (horizon) return horizon;
    const landscape = landscapeCell(x, y);
    if (landscape === OWNED_SOLID) return null;
    if (landscape) return landscape;
    return hallCell(x, y);
  }

  function physicalCellAt(x, y) {
    return resolveSourceCell(x, y, physicalHallCell);
  }

  function renderCellAt(x, y) {
    return resolveSourceCell(x, y, visualHallCell);
  }

  // Internal navigation/pathfinding keeps using this alias. Rendering does not.
  const cellAt = physicalCellAt;

  function sourceLayerAtWorld(x,y,cell){
    if(!cell||cell.material<MATERIAL.sourceField||cell.material===MATERIAL.sourceVoid)return 0;
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
      if (horizonBustBlocks(toX, toY)) return { ok: false, why: 'horizon pedestal' };
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
        if(fromFeature?.kind==='chute'||toFeature?.kind==='chute'){
          const chuteFeature=fromFeature?.kind==='chute'?fromFeature:toFeature;
          const chute=sourceChuteById(chuteFeature.id);
          // A staircase is ordinary ground. Its ramp already rises well inside
          // the step limit, so it falls through to the same rule every other
          // cell in Source is walked by — up, down, or across.
          if(chute?.ascendable)return{ok:Math.abs(to.floor-from.floor)<=.45,floor:to.floor,why:'too high'};
          const along=chute
            ? (Number(toX)-Number(fromX))*chute.dir.x+(Number(toY)-Number(fromY))*chute.dir.y
            : 0;
          // One-way means no climbing. It does not mean the final ramp cell is
          // a cage: once the remaining drop is an ordinary step, continuing
          // downhill or stepping sideways onto the lower tier must work.
          if(along>=-0.001&&Math.abs(to.floor-from.floor)<=.45)return{ok:true,floor:to.floor};
          return{ok:false,why:'one-way chute'};
        }
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
      // THE PORTAL AND FIRST LIFT ARE NOT PART OF THIS KEY.
      //
      // It used to be — three states, so opening the FOH leaf rebuilt the whole
      // plan twice (closed -> opening -> open). At 768x768 that is 589,824 cells
      // recomputed to change an aperture two cells wide, and the stall landed
      // right on top of the door's own animation: the swing read as taking many
      // seconds because the frame stopped twice during it.
      //
      // FIRST LIFT used to do the same full rebuild in the exact frame that also
      // creates the Source glyph atlas and switches compositors. Its only plan
      // change is the twelve-cell-wide painted rear corridor, so both mutations
      // are narrow retained-plan patches below. Full rebuilds happen only when
      // phase, page stage, field origin or plan origin changes.
      const key = `${state.phase}:${state.pageStage}:${o.x}:${o.y}:${originX}:${originY}`;
      if (lastPlan?.key === key) return withRetainedPlanPatch(lastPlan);
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
      lastPortalPlanState = null;
      lastPlanFirstLiftCompleted = !!state.firstLiftCompleted;
      return withRetainedPlanPatch(lastPlan);
    },
  };

  // The leaf's own rect in plan space, recomputed only when its state changes.
  // `patch` on the returned plan is consumed by the caller and cleared, so an
  // unchanged door costs one string comparison a frame.
  let lastPortalPlanState = null;
  let lastPlanFirstLiftCompleted = null;
  function withRetainedPlanPatch(plan) {
    let dirty = null;
    const include = (x0, y0, x1, y1) => {
      if (x1 < 0 || y1 < 0 || x0 > plan.w - 1 || y0 > plan.h - 1) return;
      const next = {
        x0: Math.max(0, Math.min(plan.w - 1, x0)),
        y0: Math.max(0, Math.min(plan.h - 1, y0)),
        x1: Math.max(0, Math.min(plan.w - 1, x1)),
        y1: Math.max(0, Math.min(plan.h - 1, y1)),
      };
      if (next.x1 < next.x0 || next.y1 < next.y0) return;
      dirty = dirty ? {
        x0: Math.min(dirty.x0, next.x0),
        y0: Math.min(dirty.y0, next.y0),
        x1: Math.max(dirty.x1, next.x1),
        y1: Math.max(dirty.y1, next.y1),
      } : next;
    };
    const portalState = landingPortalFrame().passable ? 'open'
      : state.landingDoorOpen ? 'opening' : 'closed';
    if (portalState !== lastPortalPlanState) {
      lastPortalPlanState = portalState;
      const o = landscapeOrigin();
      // A generous box around the aperture: leaf, jamb and one cell of slack.
      const half = 6;
      const cx = Math.round(o.x + SOURCE_LANDING_PORTAL_LOCAL.x);
      const cy = Math.round(o.y + SOURCE_LANDING_PORTAL_LOCAL.y);
      include(cx - half - plan.originX, cy - half - plan.originY,
        cx + half - plan.originX, cy + half - plan.originY);
    }

    const firstLiftCompleted = !!state.firstLiftCompleted;
    if (lastPlanFirstLiftCompleted !== firstLiftCompleted) {
      lastPlanFirstLiftCompleted = firstLiftCompleted;
      // The lift changes only the eye's painted corridor. It spans the retained
      // plan in depth, but is twelve cells wide; rebuilding the other 98% is the
      // transition spike this patch exists to prevent.
      const hallHalf = Math.ceil(HALL_HALF_WIDTH) + 1;
      include(-hallHalf - plan.originX, 0,
        hallHalf - plan.originX, plan.h - 1);
    }

    if (!dirty) { plan.patch = null; return plan; }
    for (let py = dirty.y0; py <= dirty.y1; py += 1) for (let px = dirty.x0; px <= dirty.x1; px += 1) {
      const c = renderCellAt(plan.originX + px + 0.5, plan.originY + py + 0.5);
      const i = py * plan.w + px;
      plan.rgba[i * 4] = c ? encodeH(c.floor) : 0;
      plan.rgba[i * 4 + 1] = c ? encodeH(c.ceil) : 0;
      plan.rgba[i * 4 + 2] = c ? c.flags : F.SOLID;
      plan.rgba[i * 4 + 3] = c ? c.zone : 0;
      plan.material[i] = c ? c.material : 0;
      plan.sourceLayer[i] = c ? sourceLayerAtWorld(plan.originX + px + .5, plan.originY + py + .5, c) : 0;
    }
    plan.patch = {
      x: dirty.x0,
      y: dirty.y0,
      w: dirty.x1 - dirty.x0 + 1,
      h: dirty.y1 - dirty.y0 + 1,
    };
    return plan;
  }

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
    // Eight cells past the tier's own start, derived rather than typed: these
    // were literals (-48, -128, -228) matching the old boundaries, and the
    // approach extension moved every one of them.
    const tier = SOURCE_TIER_BY_ID[tierId];
    if (tier?.field) return { x: o.x, y: o.y + tier.from - 8, facing: 0 };
    // Just over the seam, facing in. Far enough that the field is behind him and
    // he cannot walk back out of it by accident.
    if (tierId === 'horizon') return { x: o.x, y: o.y + SOURCE_HORIZON.from - SOURCE_HORIZON.entryStandoff, facing: 0 };
    // And the same again for the bell passage: over its own seam, facing in.
    if (tierId === 'bells') return { x: o.x, y: o.y + SOURCE_BELLS.from - SOURCE_BELLS.entryStandoff, facing: 0 };
    return landingWorld();
  }

  function checkpointPosition(id = state.checkpoint?.id || state.checkpointId) {
    if (id === 'hall-entry') return { x: SOURCE_ENTRY.x, y: SOURCE_ENTRY.y, facing: 0 };
    if (id === 'haystack-entry' || state.phase === CHUNK_SURF_PHASE.HAYSTACK) return haystackCheckpoint();
    if (id === 'landscape-entry' || id === 'landing-arrival') return landingWorld();
    if (id === 'landing-approach') return landingWorld(SOURCE_APPROACH_DESTINATION);
    if (id === 'landing-fork') return tierCheckpoint('fork');
    if (id === 'landing-trace') return tierCheckpoint('trace');
    if (id === 'landing-return') return tierCheckpoint('return');
    if (id === 'landing-horizon') return tierCheckpoint('horizon');
    // A RELOAD IN THE PASSAGE RESUMES IN THE PASSAGE.
    //
    // Without this the id fell through to landmarkPoint, found nothing, and
    // returned the hall entry — so closing the app four hundred metres down the
    // bell road put the body back at the start of the chapter with the route
    // already committed and no way back to it.
    if (id === 'bells-entry') return tierCheckpoint('bells');
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
      const voidFrame = sourceVoidFrame();
      objective = !state.landingDoorOpen && !state.landingDoorSealed
        ? { id: 'open-foh-door', label: 'OPEN THE FOH DOOR', target: landingWorld(SOURCE_LANDING_PORTAL_LOCAL), bearingEligible: true }
        : voidFrame.approach
        ? { id: 'white-walk', label: 'WALK INTO THE WHITE', target: null, bearingEligible: false, progress: voidFrame.progress }
        : state.sourceApproachComplete
        ? { id: 'first-stair', label: 'ENTER SOURCE SPACE', target: landingWorld(SOURCE_APPROACH_DESTINATION), bearingEligible: true }
        : outside
        ? { id: 'white-threshold', label: 'STEP INTO THE WHITE', target: landingWorld(SOURCE_LANDING_OPENING_LOCAL), bearingEligible: false }
        : { id: 'leave-get-in', label: `LEAVE THE ${SCENE_DOCK_LABEL}`, target: landingWorld(SOURCE_LANDING_OPENING_LOCAL), bearingEligible: true };
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
    // THE ONE BEHIND YOU DOES NOT MOVE WHEN THE ROOM DOES.
    //
    // This was a fixed authored point inside the reconstructed room, which made
    // sense only while the player was being teleported into that room. With the
    // dock built around the body instead, the same local point lands in FRONT of
    // them — and the whole beat is that the thing behind you is still behind you.
    //
    // So it holds the bracket's own rear gap, in the corridor, at the player's
    // own x. The body that paced them down the haystack is standing where it was
    // standing; nothing about the room arriving in front of them touches it.
    const point = {
      x: player.x,
      y: player.y + SOURCE_BRACKET.rearGapEndMetres / CELL,
    };
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

  function sourceSensoryFrame() {
    const transitionProgress = state.phase === CHUNK_SURF_PHASE.TRANSFORMING
      ? clamp01(transformElapsed / SOURCE_TRANSFORM_SECONDS)
      : state.phase === CHUNK_SURF_PHASE.HALL || state.phase === CHUNK_SURF_PHASE.HAYSTACK ? 0 : 1;
    return Object.freeze({
      phase: state.phase,
      transitionProgress,
      settled: sourceSensorySettled,
      mix: sourceSensoryMix({ phase: state.phase, transitionProgress, settled: sourceSensorySettled }),
    });
  }

  function settleSourceSensory() {
    sourceSensorySettled = true;
    return sourceSensoryFrame();
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
      approach: onApproach(),
      movementMultiplier: state.phase === CHUNK_SURF_PHASE.HORIZON
        ? HORIZON_PACE
        : onApproach() ? APPROACH_PACE : 1,
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
    // AT THE FIELD'S EDGE, NOT AT THE HEAD OF THE TAPE. The walk out is his to
    // make; the tape begins three hundred and sixty metres later, on its own.
    const o = landscapeOrigin();
    const entry = {
      x: o.x,
      y: o.y + SOURCE_PRE_TAPE.from - SOURCE_PRE_TAPE.entryStandoff,
      facing: 0,
    };
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

  function horizonBustBlocks(x, y) {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return false;
    const point = horizonBustPoint();
    // The asset is 5.2 tape metres wide. Horizon lateral is compressed by 2/3
    // in the renderer, so its truthful body-space footprint is just under four
    // cells either side of the authored anchor. The shallow depth keeps the
    // monument solid without turning it into a wall across the walk.
    return Math.abs(Number(x) - point.x) < 4.15 && Math.abs(Number(y) - point.y) < 2.35;
  }

  // How much of the audience has been heard. The offer is deliberately held
  // until identity, history, route, and consequence have each had a beat;
  // a secret door should feel conferred, not sold from an interaction prompt.
  //
  // Deliberately not persisted: a reload restarts the audience, while the route
  // decision itself remains durable and cannot be offered twice.
  let horizonBustBeat = 0;
  let horizonBustRefusalOffered = false;
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
      // Preserve the durable route decision on first contact for old saves and
      // callers. The refusal tree below is presentation only: it gives the
      // player posture, never another route.
      dispatch({ type: 'HORIZON_BUST_DECIDED', decision: 'declined' }, { immediate: true });
      if (horizonBustBeat < HORIZON_BUST_REFUSAL.length) {
        horizonBustBeat += 1;
        return {
          handled: true,
          eligible: false,
          evidence,
          beat: horizonBustBeat,
          line: HORIZON_BUST_REFUSAL[horizonBustBeat - 1],
          offers: false,
          offersRefusal: false,
        };
      }
      if (!horizonBustRefusalOffered) {
        horizonBustRefusalOffered = true;
        return {
          handled: true,
          eligible: false,
          evidence,
          beat: horizonBustBeat,
          line: null,
          offers: false,
          offersRefusal: true,
        };
      }
      return {
        handled: true, eligible: false, evidence, beat: horizonBustBeat,
        line: null, offers: false, offersRefusal: false,
      };
    }
    dispatch({ type: 'HORIZON_BUST_RECOGNIZED', eligible: true }, { immediate: true });
    const lines = horizonBustAudience(evidence.mode);
    horizonBustBeat = Math.min(lines.length, horizonBustBeat + 1);
    const last = horizonBustBeat >= lines.length;
    return {
      handled: true,
      eligible: true,
      evidence,
      beat: horizonBustBeat,
      line: lines[horizonBustBeat - 1],
      offers: last && !state.finale?.bust?.decision,
      offersRefusal: false,
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
  // HOW THE RECORDING'S OWN BRIGHTNESS BECOMES THE TAPE'S EXPOSURE.
  //
  // `lum` is measured off the bake and runs about 0.83 at the head to 0.25 at
  // the tail, with the recording's own texture in between. Floor plus gain maps
  // that onto roughly 1.24 down to 0.69 — a picture that halves over the
  // crossing, which reads as a tape wearing out, without ever going so dark
  // that the middle act cannot be walked. The floor is what stops a dim slice
  // becoming an unlit room; the gain is how much of the decline you feel.
  const HORIZON_EXPOSURE_FLOOR = 0.45;
  const HORIZON_EXPOSURE_GAIN = 0.95;
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
  //
  // The "roughly double speed" above is the number this wanted, not the number
  // it produces: 259.375s of tape over ~70s of walking is 3.75x, so a little
  // over a quarter of the piece is heard. Left at three deliberately — the
  // crossing's length is set by feel, and the rest the piece was missing is now
  // authored by the engine (see horizon-score.js) rather than waited for.
  const HORIZON_PACE = 3;

  // THE APPROACH IS AN AUTHORED WALK, SO IT OWNS ITS LEGS.
  //
  // The multiplier is derived at module load from the actual portal-to-stair
  // span and MOVE_MS. Changing either endpoint cannot silently turn a thirty
  // second scene back into a sprint.
  const APPROACH_PACE = SOURCE_APPROACH_PACE;

  const sourcePhaseActive = () => [CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE,
    CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase);

  // Past the physical leaf, before Source proper resolves. Progress is body
  // distance, not southward distance, so the sea cannot be defeated by walking
  // sideways or in circles.
  function onApproach() {
    if (!sourcePhaseActive() || state.sourceApproachComplete) return false;
    const ly = player.y - landscapeOrigin().y;
    return ly < SOURCE_LANDING_PORTAL_LOCAL.y - 1;
  }

  function sourceVoidFrame() {
    const sourcePhase = sourcePhaseActive();
    const portal = landingPortalFrame();
    const localY = player.y - landscapeOrigin().y;
    const distance = clamp(state.sourceApproachDistance, 0, SOURCE_APPROACH_TRAVEL_CELLS);
    const progress = clamp01(distance / SOURCE_APPROACH_TRAVEL_CELLS);
    const elapsedSeconds = progress * SOURCE_APPROACH_TARGET_SECONDS;
    const approach = sourcePhase && onApproach();
    // This boundary is spatial even after the journey completes. A god warp or
    // migrated save inside the Scene Dock must still never receive Source red.
    const sceneDock = sourcePhase && localY >= SOURCE_LANDING_PORTAL_LOCAL.y - 1;
    const redProgress = smoothstep(
      SOURCE_APPROACH_RED_ONSET_SECONDS,
      SOURCE_APPROACH_RED_ONSET_SECONDS + 3,
      elapsedSeconds,
    );

    // Opening the real leaf peaks as a blinding intrusion, then settles into a
    // visibly impossible white aperture if the player hesitates in the room.
    const thresholdRise = smoothstep(.08, .82, portal.progress);
    const thresholdSettle = 1 - .58 * smoothstep(
      SOURCE_LANDING_PORTAL_SECONDS,
      SOURCE_LANDING_PORTAL_SECONDS + 3.4,
      landingRevealElapsed,
    );
    const thresholdWhiteout = sceneDock && portal.progress > 0
      ? thresholdRise * thresholdSettle
      : 0;
    // In the sea, white owns the exposure until the maintained red circuit
    // arrives ten authored seconds in and takes the frame away from it.
    const whiteout = approach
      ? .92 - redProgress * .62
      : thresholdWhiteout * .92;
    return Object.freeze({
      phase: state.phase,
      sourcePhase,
      active: sourcePhase && !state.sourceApproachComplete,
      sceneDock,
      approach,
      complete: !!state.sourceApproachComplete,
      proper: sourcePhase && !!state.sourceApproachComplete,
      localY,
      distance,
      targetDistance: SOURCE_APPROACH_TRAVEL_CELLS,
      progress,
      elapsedSeconds,
      targetSeconds: SOURCE_APPROACH_TARGET_SECONDS,
      redOnsetSeconds: SOURCE_APPROACH_RED_ONSET_SECONDS,
      redProgress,
      whiteout: clamp01(whiteout),
      thresholdLight: sceneDock ? thresholdRise : (approach ? 1 : 0),
      horizonDistanceMetres: 145 - smoothstep(0, 1, progress) * 125,
      horizonScale: .035 + smoothstep(.04, 1, progress) * .965,
    });
  }

  // ONE AUTHORITATIVE RED BOUNDARY.
  //
  // The compositor is a full-frame post effect; architectural occlusion and
  // lamp penetration cannot keep it out of the Scene Dock. The player position
  // therefore owns a hard semantic boundary: on or behind the FOH threshold is
  // the neutral physical room, beyond it is Source's emergency circuit. Local
  // lamps, the post wash and the torch all consume this same answer.
  // THE ONE TIER WITH NOTHING LIT IN IT.
  //
  // Source is a void lit entirely by its own lamps, so its ambient is 0.012 —
  // near enough to nothing, which is correct everywhere it has lamps. The bell
  // passage has none: every source-side emitter is filtered out here because
  // `sourceEmergencyLightingFrame` is inactive outside the tape. Measured in the
  // harness, that left forty-seven submitted bell meshes at litPct 0 — the whole
  // passage was rendering black on black, and the ground truth was the same
  // frame in the building reading litPct 92.
  //
  // NOTHINGNESS IS NOT DARKNESS. The place is meant to have no world in it, not
  // no light: bronze standing in nothing, with nothing behind it. So the tier
  // carries a flat ambient of its own and no lamps at all — no falloff to read
  // distance by, no cast shadows, nothing to tell you where the light is coming
  // from, because there is nowhere for it to come from. Cool, so the bells read
  // warm against it.
  const BELLS_AMBIENT = Object.freeze({ color: Object.freeze([0.52, 0.56, 0.64]), intensity: 0.085 });
  const SOURCE_AMBIENT = Object.freeze({ color: Object.freeze([0.12, 0.13, 0.12]), intensity: 0.012 });

  // The walk out is lit like the bell passage at the field's edge — there are
  // structures out there and they have to be visible — and goes down toward the
  // dark across the nothing. Never all the way to Source's 0.012: that is the
  // value that rendered forty-seven bells black, and an empty space still has to
  // read as empty rather than as a frame that failed.
  const PRE_TAPE_AMBIENT_FLOOR = 0.030;

  function sourceAmbient() {
    if (state.phase === CHUNK_SURF_PHASE.BELLS) return BELLS_AMBIENT;
    if (state.phase === CHUNK_SURF_PHASE.HORIZON) {
      const local = player.y - landscapeOrigin().y;
      if (local > SOURCE_HORIZON.from) {
        const t = sourcePreTapeProgress(local);
        return {
          color: BELLS_AMBIENT.color,
          intensity: BELLS_AMBIENT.intensity
            + (PRE_TAPE_AMBIENT_FLOOR - BELLS_AMBIENT.intensity) * t,
        };
      }
    }
    return SOURCE_AMBIENT;
  }

  function sourceEmergencyLightingFrame({
    time = phaseElapsed,
    reducedMotion = false,
    flashMode = 'full',
  } = {}) {
    const sourcePhase = sourcePhaseActive();
    const voidFrame = sourceVoidFrame();
    const localY = voidFrame.localY;
    // THE RED IS THE APPROACH, AND THE APPROACH ENDS AT THE FIRST LIFT.
    //
    // `sourceApproachComplete` used to be enough on its own, which latched the
    // wash on for the whole rest of Source — the fork, the trace, the return,
    // the HUSH beats and the final page all played under a permanent red
    // contactor pulse, because nothing ever turned it off again.
    //
    // The lamps themselves always knew where to stop: sourceApproachSpan clamps
    // the emitter run to the foot of the chute-fork stair, and there is a spec
    // pinning that none burn past it. It was only the full-frame compositor wash
    // that ran on. So this costs no authored light at all — past the stair there
    // was never a lamp to lose.
    //
    // Bounded by the MILESTONE rather than a coordinate, so it reads the same
    // way the objective does: the red stops on the step that finishes the climb.
    // What the player carries onward is the torch's own red, which is the
    // authored intent (see source-landing.js, "the only red the player carries
    // onward is the torch's") and is why sourceFlashlightFrame is left alone.
    const approachRed = state.sourceApproachComplete && !state.firstLiftCompleted;
    const active = sourcePhase && !voidFrame.sceneDock && (approachRed
      || (voidFrame.approach && voidFrame.elapsedSeconds >= SOURCE_APPROACH_RED_ONSET_SECONDS));
    const emergency = sourceEmergencyFrame(time, {
      reducedEffects: reducedMotion || flashMode !== 'full',
    });
    return Object.freeze({
      active,
      sceneDock: voidFrame.sceneDock,
      approach: voidFrame.approach,
      localY,
      boundaryY: SOURCE_LANDING_PORTAL_LOCAL.y - 1,
      cycle: emergency.cycle,
      lightScale: emergency.lightScale,
      strength: active
        ? emergency.wash * (approachRed ? 1 : Math.max(.28, voidFrame.redProgress))
        : 0,
    });
  }

  // The torch changes at the BODY boundary, not at the delayed room-light
  // onset. Everything up to and including the Scene Dock is read as an x-ray
  // negative. The instant the player walks into the white sea it becomes the
  // emergency-red torch, already following the contactor duty cycle even while
  // the first ten seconds of the room itself remain white.
  function sourceFlashlightFrame(options = {}) {
    const voidFrame = sourceVoidFrame();
    const emergency = sourceEmergencyLightingFrame(options);
    const inNothingness = voidFrame.approach
      || (!!state.sourceApproachComplete && !voidFrame.sceneDock);
    return Object.freeze(inNothingness
      ? { mode: 'emergency', active: true, xray: false, cycle: emergency.cycle }
      : { mode: 'xray', active: false, xray: true, cycle: 1 });
  }
  // How far ahead the floor samples the corridor, in cells.
  const HORIZON_BAND_LOOKAHEAD = 110;
  const progress01 = (depth) => Math.max(0, Math.min(1, depth / SOURCE_HORIZON.length));

  function horizonFrame() {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return { active: false };
    const o = landscapeOrigin();
    const local = player.y - o.y;
    const slice = sourceHorizonSlice(local);
    const depth = sourceHorizonDepth(local);
    const bandHere = horizonBand(local);
    return {
      // `active` still means PAST THE PERIMETER, which is what everything
      // outside the renderer asks it (horizonUnderfoot, the presence despawn).
      // The walk out of the field is past the perimeter too.
      active: true,
      // THE TAPE ITSELF, which is a narrower question and a newer one. The splat
      // pass returns before props, marks and the march, so if it claimed the
      // whole phase the outskirts would be rendered as a recording of somewhere
      // else and the structures standing in them would never be drawn.
      onTape: local <= SOURCE_HORIZON.from,
      preTape: local > SOURCE_HORIZON.from,
      preTapeProgress: sourcePreTapeProgress(local),
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
      band: bandHere,
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
      //
      // AND IT IS THE RECORDING THAT DECIDES, NOT A CONSTANT. `lum` is measured
      // off the bake slice by slice and runs 0.83 at the head down to 0.25 at
      // the tail — a recording that visibly wears out. Pinned at 1 it rendered
      // flat, so the collapse at 0.88 arrived as a cliff out of a picture that
      // had not changed since the first metre. Mapped, the tail is the end of a
      // long decline instead of a surprise, and the last act is dark because
      // the tape is nearly gone rather than because a ramp switched on.
      exposure: HORIZON_EXPOSURE_FLOOR + HORIZON_EXPOSURE_GAIN * bandHere.lum,
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

  function focusAt(px, py, facing, presence = null) {
    const candidates = [];
    if ([CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE].includes(state.phase)
        && !state.firstLiftCompleted && !landingPortalFrame().complete) {
      candidates.push({
        kind: 'source-landing-door', id: SOURCE_LANDING_PORTAL_DOOR_ID,
        ...landingWorld(SOURCE_LANDING_PORTAL_LOCAL),
        open: !!state.landingDoorOpen,
        sealed: !!state.landingDoorSealed,
        focusPriority: 12, focusRadius: 9,
      });
    }
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
      // THE BODY IS A THING YOU CAN WALK UP TO.
      //
      // Contact follows behind at three quarters of the player's walking speed.
      // It never resolves by collision: the meeting is the player's move. Turn,
      // acquire the body, and interact. A wider focus radius keeps that readable
      // while clean forward walking is slowly opening the gap.
      if (hushMode().colliding && presence?.active
          && Number.isFinite(presence.x) && Number.isFinite(presence.y)) {
        candidates.push({
          kind: 'hush', id: 'source-hush', x: presence.x, y: presence.y,
          focusPriority: 11, focusRadius: 12,
        });
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

  // ARRIVING ON A TIER IS THE EVENT NOW, BECAUSE NOTHING IS RIDDEN ANY MORE.
  //
  // firstLiftCompleted and the per-tier checkpoints were both raised by a lift
  // ride completing. With the lifts gone and every connector a staircase there
  // is no ride to complete, so the same two things are raised by the body
  // reaching the tier — which is what the ride was standing in for.
  //
  // The flag keeps its name and its id ('lift-fork'): it is load-bearing
  // narrative state, gating the text architecture, the landing tableau and the
  // hush stage, and every one of those means "the player has climbed out of the
  // arrival", not "a lift ran".
  let lastTierId = null;
  function noteTierArrival(to) {
    if (![CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase)) return;
    const o = landscapeOrigin();
    const tier = sourceTierAt(Number(to.y) - o.y);
    if (!tier?.field || tier.id === lastTierId) return;
    lastTierId = tier.id;
    if (tier.id === 'arrival') return;
    const checkpointId = tierCheckpointId(tier.id);
    if (!state.firstLiftCompleted) {
      dispatch({ type: 'SOURCE_LIFT_COMPLETED', id: 'lift-fork', checkpointId }, { immediate: true });
      return;
    }
    if (state.checkpointId !== checkpointId) {
      dispatch({ type: 'CHECKPOINT_SET', id: checkpointId }, { immediate: true });
    }
  }

  function onStep(from, to) {
    player = { ...player, ...to };
    const voidBeforeStep = sourceVoidFrame();
    if (voidBeforeStep.approach && !state.sourceApproachComplete) {
      const travelled = Math.min(1, Math.hypot(
        Number(to.x) - Number(from.x),
        Number(to.y) - Number(from.y),
      ));
      if (travelled > 0) {
        // Main commits the complete runtime state after every accepted movement
        // frame, so this additive counter does not need to dispatch (and force a
        // second save) on every footstep.
        const distance = Math.min(
          SOURCE_APPROACH_TRAVEL_CELLS,
          Math.max(0, Number(state.sourceApproachDistance) || 0) + travelled,
        );
        state = { ...state, sourceApproachDistance: distance };
        if (distance >= SOURCE_APPROACH_TRAVEL_CELLS) {
          dispatch({ type: 'SOURCE_APPROACH_COMPLETED', distance }, { immediate: true });
          const relocate = landingWorld(SOURCE_APPROACH_DESTINATION);
          player = { ...relocate };
          return { handled: true, event: 'source-approach-completed', relocate };
        }
      }
      return { handled: true, event: 'source-approach-advanced', progress: sourceVoidFrame().progress };
    }
    noteTierArrival(to);
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

  function inspectFocused(px, py, facing, presence = null) {
    // Use the same candidate set the HUD just drew. Source Contact is carried
    // by the live Presence body, not by static world geometry; dropping this
    // fourth argument produced a visible SPEAK prompt whose key did nothing.
    const focus = focusAt(px, py, facing, presence);
    if (!focus) return { handled: false };
    if (focus.kind === 'source-landing-door') {
      if (state.landingDoorSealed) {
        return { handled: true, event: 'landing-door-locked', text: '' };
      }
      if (!state.landingDoorOpen) {
        landingPortalElapsed = 0;
        landingRevealElapsed = 0;
        dispatch({ type: 'SOURCE_LANDING_DOOR_OPENED' }, { immediate: true });
        protectMoment(SOURCE_LANDING_PORTAL_SECONDS + .4);
        return { handled: true, event: 'landing-door-opened', text: '' };
      }
      return { handled: true, event: 'landing-door-opening', text: '' };
    }
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
      sourceSensorySettled = false;
      // NO LINE HERE. This used to answer with 'One sheet does not move…', which
      // the caller spoke — so the hardest walk in the game ended on a caption.
      // The caller cuts to black on this event instead: a door, and then the
      // field. Anything said here would be said over the top of that.
      // The Source field has one authored axis: north through the Scene Dock.
      // A player may approach the still sheet from either side, so tell the
      // presenter which bearing the opaque page must hand back. Otherwise a
      // south-facing read faithfully builds the room north — behind the camera.
      return { handled: true, text: '', event: 'page-found', revealFacing: 0 };
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
        event: talk.offers
          ? 'horizon-bust-offer'
          : talk.offersRefusal
            ? 'horizon-bust-refusal-offer'
            : 'horizon-bust',
        line: talk.line,
        eligible: talk.eligible,
        evidence: talk.evidence,
        beat: talk.beat,
        text: '',
      };
    }
    if (focus.kind === 'hush') {
      // Main owns the scene, the flash and the relocation — the same path a
      // catch takes. This only says the player asked for it.
      return { handled: true, event: 'hush-contact', text: '' };
    }
    if (focus.kind === 'normal-exit') {
      // THE MACHINE COMES FIRST, AND IT IS THE SAME MACHINE ON BOTH ROADS.
      //
      // This used to be a bare press: with Contact available it opened the
      // warning, and without it — which is most runs — it dropped the body
      // straight into a two-minute walk with no text on it anywhere. The
      // transport is the door now. Threading it is what makes the tape exist
      // out past the field, and only then does the road fork.
      if (!horizonTransport.threaded) {
        return { handled: true, event: 'horizon-transport', text: '' };
      }
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
    if (state.landingDoorOpen && landingPortalElapsed < SOURCE_LANDING_PORTAL_SECONDS) {
      landingPortalElapsed = Math.min(SOURCE_LANDING_PORTAL_SECONDS, landingPortalElapsed + elapsed);
      // The leaf is a dynamic prop. The collision aperture changes once, at the
      // passable threshold, and withPortalPatch updates only that retained-plan
      // rectangle; invalidating the whole field here was the frame-zero stall.
    } else if (state.landingDoorSealed && landingPortalElapsed > 0) {
      landingPortalElapsed = Math.max(0, landingPortalElapsed - elapsed);
    }
    if (state.landingDoorOpen) landingRevealElapsed += elapsed;
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
    // The arrival tableau is a HUSH beat in its own right: the body that walked
    // the haystack corridor behind the player is still behind them in the dock.
    // It carries no hushStage — the stage machine does not start until the
    // landscape does — so gating only on the stage left the one beat the wake
    // was written for with nothing in it.
    const landingBeat = sourceLandingHushFrame().active;
    if (!landingBeat && !runtimeHush.searchActive
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
    const portal = landingPortalFrame();
    const ordinary = [...sourceLandingPropPlacements(landscapeOrigin()),
      ...sourceLandingDoorPlacements(landscapeOrigin(), { portalProgress: portal.progress })].map((placement) => ({
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
    if (!portal.requested) return ordinary;
    // Nothing is fabricated behind the leaf any more. What is back there is the
    // haystack corridor itself (visualHallCell / hallRenderableInPhase), which
    // is the corridor the player actually walked, standing where it actually
    // is. A hand-built stand-in here is how this went wrong twice.
    return ordinary;
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
    // The FOH leaf opens onto the absence itself. The former red tower_bulkhead
    // was literally a wall two cells behind the door, so a correct swing still
    // revealed masonry. There is deliberately no threshold prop here.
    const out = [];

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
      // THE WAY UP HAS TO LOOK LIKE A WAY UP.
      //
      // The lift was a flat catwalk plate at floor level with two louvre panels
      // beside it. That is what a landing looks like, not what a route looks
      // like — so the only thing in the arrival tier that read as "climb me" was
      // the chute beside it, which is one-way DOWN and can never be climbed. The
      // report was "can't climb up stairs, they don't let me go up them", and it
      // was true of the object the player was looking at: the traversal volume
      // was here, on the plate, unmarked.
      //
      // So the lift gets a real flight. plant_grated_steps is the building's own
      // service tread unit; four of them carry the tier gap at roughly 45
      // degrees, which fits the volume's four metres of depth exactly and reads
      // as a companionway rather than as scenery.
      const riseTotal = upper - lower;
      if (riseTotal > 0.5) {
        const flights = 4;
        const runEach = (lift.depth * 2 * CELL) / flights;
        for (let tread = 0; tread < flights; tread += 1) {
          out.push({
            id: `source-connector-${lift.id}-flight-${tread}`,
            mesh: 'plant_grated_steps',
            matrix: sourceMatrix({
              x: worldX,
              y: lower + (riseTotal / flights) * tread,
              z: worldZ + (lift.depth * CELL) - runEach * (tread + 0.5),
              scaleX: Math.max(0.4, lift.halfWidth * 2 * CELL / 3),
              scaleY: (riseTotal / flights) / 1.1,
              scaleZ: runEach / 1.49,
            }),
            // The circuit pays for the route, so the route carries its colour.
            emissive: [1, 0.02, 0.006, 0.34],
            zone: ZONE.sourceSpace, structural: true, sourceConnector: lift.id,
          });
        }
      }
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
      // TREADS, BECAUSE THESE ARE STAIRS AND THEY HAVE TO LOOK CLIMBABLE.
      //
      // The pitched deck alone is a ramp, and a ramp beside a handrail is what
      // used to advertise an ascent that did not exist. Now the ascent DOES
      // exist on every one of them, so the run is stepped: plant_grated_steps is
      // the building's own service tread and reads as "walk up me" from across
      // the field, which is the whole reason to build it rather than tell the
      // player about it.
      const flights = Math.max(3, Math.round(chute.run / 4));
      const riseTotal = top - bottom;
      for (let tread = 0; tread < flights; tread += 1) {
        const along = (tread + 0.5) / flights;
        const localX = chute.x + chute.dir.x * chute.run * along;
        const localY = chute.y + chute.dir.y * chute.run * along;
        out.push({
          id: `source-connector-${chute.id}-tread-${tread}`,
          mesh: 'plant_grated_steps',
          matrix: sourceMatrix({
            x: (o.x + localX) * CELL,
            y: top - riseTotal * along,
            z: (o.y + localY) * CELL,
            scaleX: Math.max(0.4, chute.halfWidth * 2 * CELL / 3),
            scaleY: (riseTotal / flights) / 1.1,
            scaleZ: (length / flights) / 1.49,
            yaw: deckYaw,
          }),
          emissive: [1, 0.02, 0.006, 0.30],
          zone: ZONE.sourceSpace, structural: true, sourceConnector: chute.id,
        });
      }
      // ENCLOSURE, NOT HANDRAILS.
      //
      // These carried tower_loft_rail down both sides. A handrail at hand height
      // is a promise, and for as long as these were one-way slides it was a lie.
      // They are stairs now and the promise would be true — but slatted cheeks
      // read as a stairwell rather than as a catwalk, which is what this place
      // is made of, so they stay.
      for (const side of [-1, 1]) out.push({
        id: `source-connector-${chute.id}-cheek-${side}`,
        mesh: 'tower_louvres',
        matrix: sourceMatrix({
          x: centreX + side * chute.halfWidth * CELL,
          y: (top + bottom) * 0.5 + 0.55,
          z: centreZ,
          scaleX: Math.max(0.3, length / 6),
          scaleY: 0.34,
          scaleZ: 0.5,
          yaw: railYaw,
          roll: -pitch,
        }),
        emissive: [0.52, 0.025, 0.006, 0.2],
        zone: ZONE.sourceSpace, structural: true, sourceConnector: chute.id,
      });
    }
    return out;
  }

  // SOURCE PROPER IS A HORIZON BEFORE IT IS A PLACE.
  //
  // The proxy follows the body laterally and retreats from 145m to 20m as path
  // distance accumulates. It is assembled from the same meshes that stand in
  // Source proper, so the final full-red handoff replaces a small distant truth
  // with its navigable version rather than cutting to a different picture.
  function sourceVoidHorizonInstances() {
    const frame = sourceVoidFrame();
    if (!frame.approach || frame.complete) return [];
    const centreX = player.x;
    const centreZ = player.y - frame.horizonDistanceMetres / CELL;
    const scale = frame.horizonScale;
    const specs = [
      { id: 'frame', mesh: 'tower_frame', dx: 0, dz: 0, base: 8, yaw: .08 },
      { id: 'vault', mesh: 'chapel_vault', dx: -9, dz: 5, base: 5.4, yaw: -.18 },
      { id: 'piano', mesh: 'upright_piano', dx: 8, dz: 4, base: 4.8, yaw: .24 },
      { id: 'stand', mesh: 'music_stand', dx: -5, dz: -3, base: 5.2, yaw: -.4 },
      { id: 'bust', mesh: 'marble_bust_01', dx: 5, dz: -4, base: 5.8, yaw: Math.PI },
    ];
    return specs.map((spec) => ({
      id: `source-void-horizon-${spec.id}`,
      mesh: spec.mesh,
      matrix: sourceMatrix({
        x: (centreX + spec.dx * scale) * CELL,
        y: .04,
        z: (centreZ + spec.dz * scale) * CELL,
        scaleX: spec.base * scale,
        scaleY: spec.base * scale,
        scaleZ: spec.base * scale,
        yaw: spec.yaw,
      }),
      zone: ZONE.sourceSpace,
      structural: true,
      sourceVoidHorizon: true,
    }));
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
    const out = [...landingPropInstances()];
    if (state.phase === CHUNK_SURF_PHASE.TRANSFORMING) return out;
    if (!state.sourceApproachComplete) return [...out, ...sourceVoidHorizonInstances()];
    out.push(...connectorPropInstances());
    out.push(...structurePropInstances(px, py));
    for (let i = 0; i < SOURCE_LEAK_COUNT; i += 1) {
      const localX = (rand(state.seed, i, 71) - 0.5) * LANDSCAPE_W * 0.94;
      const depth = 8 + rand(state.seed, i, 131) * (LANDSCAPE_H - 16);
      const localY = -depth;
      // The drowned architecture surfaces more the deeper (nearer the end) you go.
      const resolution = 0.16 + 0.84 * smoothstep(40, LANDSCAPE_H - 30, depth);
      if (rand(state.seed, i, 199) > resolution) continue;
      const worldX = o.x + localX, worldZ = o.y + localY;
      // THE FAR SIDE HAS TO STAND ON THE HORIZON WHILE YOU WALK TOWARD IT.
      //
      // 108m hid everything past it, which was fine when the arrival was four
      // metres long. From the near end of a sixty-metre approach it would cut
      // the next part of Source out of the frame entirely, and watching it
      // resolve is the whole reason the approach is there.
      if (Math.hypot((worldX - px) * CELL, (worldZ - py) * CELL) > 150) continue;
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
    if (!state.sourceApproachComplete
        || ![CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase)) return [];
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
  const SOURCE_PRE_TAPE_PIECES = 90;

  // ── WHAT IS STILL STANDING ON THE WAY OUT ─────────────────────────────────
  //
  // The field's own drowned architecture, thinning. Same meshes it is made of
  // (SOURCE_LEAK_MESHES), because the outskirts are not a new place — they are
  // the last of the place he has been in all chapter, running out.
  //
  // The density falls to nothing across the outskirts and is exactly zero for
  // the whole of the nothing after it. There is no last landmark and no marker
  // for where one ends and the other starts: he notices at some point that it
  // has been a while since there was anything, and by then it has been a while.
  function preTapeInstances(px, py) {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return [];
    const o = landscapeOrigin();
    const local = player.y - o.y;
    if (local > SOURCE_PRE_TAPE.from || local < SOURCE_PRE_TAPE.to) return [];
    const out = [];
    const span = SOURCE_PRE_TAPE.from - SOURCE_PRE_TAPE.outskirtsTo;
    for (let i = 0; i < SOURCE_PRE_TAPE_PIECES; i += 1) {
      // Along the outskirts only. Nothing is placed past its far edge, so the
      // nothing is not thinly populated — it is empty.
      const along = rand(state.seed, i, 617);
      const localY = SOURCE_PRE_TAPE.from - along * span;
      // Cubed, so it is not a gentle fade: it is ordinary for a while, then
      // suddenly it has been a long time since the last one.
      if (rand(state.seed, i, 619) > Math.pow(1 - along, 3)) continue;
      const localX = (rand(state.seed, i, 631) - 0.5) * SOURCE_PRE_TAPE.halfWidth * 1.9;
      const worldX = o.x + localX, worldZ = o.y + localY;
      if (Math.hypot((worldX - px) * CELL, (worldZ - py) * CELL) > 190) continue;
      const piece = SOURCE_LEAK_MESHES[Math.floor(rand(state.seed, i, 641) * SOURCE_LEAK_MESHES.length)];
      const scale = 0.9 + rand(state.seed, i, 647) * 1.6;
      // Sunk deeper the further out they are: the ground is taking them back.
      const sink = 0.4 + along * 2.6 + rand(state.seed, i, 653) * 1.1;
      out.push({
        id: `source-outskirt-${i}`,
        mesh: piece,
        matrix: sourceMatrix({
          x: worldX * CELL,
          y: (SOURCE_TIER_BY_ID.outskirts?.height ?? 15.2) - sink,
          z: worldZ * CELL,
          scaleX: scale, scaleY: scale, scaleZ: scale,
          yaw: rand(state.seed, i, 659) * Math.PI * 2,
          roll: (rand(state.seed, i, 661) - 0.5) * 0.22,
          pitch: (rand(state.seed, i, 673) - 0.5) * 0.16,
        }),
        zone: ZONE.sourceSpace,
        structural: true,
        sourceStructure: 'outskirts',
      });
    }
    return out;
  }

  function bellPassageInstances(px, py, { time = phaseElapsed } = {}) {
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
          // ADDED to the authored roll, never replacing it: the inverted bell is
          // authored at roll PI and has to rock about being upside down rather
          // than snap upright on the first frame.
          roll: (entry.roll || 0) + bellSwingAt(entry, time),
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
    if (state.phase === CHUNK_SURF_PHASE.HORIZON) return preTapeInstances(px, py);
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
    // THE DOCK BEAT WANTS THE WAKE, NOT THE ARCHITECTURE.
    //
    // The HUSH in Source is densityWakeTextInstances, and it is built in here —
    // which is why this is called during the landing beat at all. But
    // cachedArchitecture() assembles the whole text field for a five-by-five
    // block of 128-cell tiles, and calling it at the dock ran that enormous
    // build somewhere it had never run before: the door's two-second swing
    // became a multi-second stall.
    //
    // The text architecture is textSpaceActive()'s business and stays gated on
    // it. Before that, the scene is the wake and nothing else.
    const architecture = textSpaceActive();
    const cached = architecture
      ? cachedArchitecture(px, py)
      : landingSceneCache;
    const dynamicInstances = [
      ...interactionTextInstances(),
      ...resolvedIntervalTextInstances(),
      ...densityWakeTextInstances(presence?.active ? presence : null, reducedMotion ? 0 : time),
    ];
    return {
      schema: 1,
      key: cached.key,
      // The landing submits the HUSH wake before Text Space exists. Do not hand
      // that empty scene the real corpus identity: the renderer would otherwise
      // believe the atlas was initialized and reject the populated scene at the
      // first-lift boundary because both scenes share the same key.
      atlasKey: architecture
        ? `${SOURCE_ATLAS.schemaVersion}:${SOURCE_ATLAS.corpusHash || Object.keys(SOURCE_ATLAS.entries || {}).length}`
        : '',
      corpus: architecture ? sourceCorpus() : [],
      staticInstances: cached.instances,
      staticBatches: cached.batches,
      dynamicInstances,
      look: sourceLook(),
      objective: sourceObjective(),
      weather: {
        rain: pressureFrame({ reducedMotion }).rain,
        moon: 1,
        clouds: 1,
        // LEAVES GET INTO SOURCE, ON THE TIERS.
        //
        // Not in the hall and not in the haystack: the page storm owns the air
        // in there, and leaves would be a second kind of paper fighting the
        // first. Out on the open tiers — and on the horizon past the last page —
        // there is nothing in the air at all, and something dry blowing through
        // is the one detail that says this place is not sealed. The field is a
        // recording; what gets in belongs to the recording, so they are drawn
        // OF it rather than in front of it (see uLeaves in r3d).
        // Only the phases the text-space shader actually draws. `uLeaves` lives
        // in that shader, and textSpaceActive() is LANDSCAPE/FINAL/COMPLETED
        // past the first lift — the hall, the haystack and the horizon are the
        // raymarcher's, so asking for leaves there would set a uniform nothing
        // reads. The horizon would need the yard's prop-instance flurry.
        leaves: [CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase) ? 0.85 : 0,
      },
      landing: sourceLandingContract(),
    };
  }

  function textInstances({ px = player.x, py = player.y, presence = null, time = 0, reducedMotion=false } = {}) {
    const scene = sourceScene({ px, py, presence, time, reducedMotion });
    return [...scene.staticInstances, ...scene.dynamicInstances];
  }

  const navigation = {
    canOccupy: (x, y) => !!cellAt(x, y),
    // WHERE THE BODY IS ALLOWED TO BE STANDING WHEN YOU FIND IT.
    //
    // Source had no sampler at all, so the one spawn it got was spawnBehind's
    // compatibility stub: twenty-two cells at +y, unchecked against any cell,
    // which out here is back DOWN the slope the player has just climbed. The
    // body was behind him, below him, on a tier he had finished with, and since
    // it prowls at a fifth of his speed and Source never gives it a target, it
    // stayed there for the rest of the chapter.
    //
    // The caller supplies the authored bearing. Source Contact supplies the
    // player's REAR bearing so the body enters as a pursuit, while other callers
    // may still use the sampler's forward arc. Same floor because a tier boundary
    // is a climb, and a body across one is a body behind glass.
    sampleSpawn({ player, forward, minDistance = 30, maxDistance = 48, random = Math.random } = {}) {
      if (!player) return null;
      const here = cellAt(player.x, player.y);
      if (!here) return null;
      const bearing = Math.atan2(Number(forward?.y) || -1, Number(forward?.x) || 0);
      const span = Math.max(0.001, maxDistance - minDistance);
      for (let attempt = 0; attempt < 64; attempt += 1) {
        // A wide arc in front of him rather than a point: he must be able to
        // come upon it, not be issued with it.
        const angle = bearing + (random() - 0.5) * Math.PI * 1.15;
        const reach = minDistance + random() * span;
        const x = player.x + Math.cos(angle) * reach;
        const y = player.y + Math.sin(angle) * reach;
        const cell = cellAt(x, y);
        if (!cell) continue;
        if (Math.abs((cell.floor ?? 0) - (here.floor ?? 0)) > 0.05) continue;
        return { x, y };
      }
      return null;
    },
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
      } else if (feature?.kind === 'chute' && !sourceChuteById(feature.id)?.ascendable) {
        // Standing on a slide is not a position, so the body is returned to the
        // last stable one. A staircase IS a position — yanking the player back
        // to a checkpoint for the crime of standing on the stairs is exactly the
        // bug this normalizer exists to prevent everywhere else.
        const stable=checkpointPosition();
        candidate.x=stable.x;candidate.y=stable.y;candidate.facing=stable.facing;
      }
    }
    player = candidate;
    // THE THRESHOLD IS THE EVENT, SO THE BODY CROSSING IT IS THE TRIGGER.
    // Not the prompt, not the animation finishing: the leaf shuts when the
    // player is on the Source side of it, which is the only moment that cannot
    // be faked by standing in the doorway and changing your mind.
    if (state.landingDoorOpen && !state.landingDoorSealed) {
      const o = landscapeOrigin();
      if (candidate.y - o.y < SOURCE_LANDING_PORTAL_LOCAL.y - 1) {
        // Preserve the fully open pose as the start of the real closing swing;
        // collision seals immediately, but the leaf no longer snaps shut.
        landingPortalElapsed = Math.max(landingPortalElapsed, SOURCE_LANDING_PORTAL_SECONDS);
        dispatch({ type: 'SOURCE_LANDING_DOOR_SEALED' }, { immediate: true });
      }
    }
    if(captureMovementRequired&&!captureMovementAnchor){
      captureMovementAnchor={x:candidate.x,y:candidate.y};
    }
  }

  function textSpaceActive() {
    return state.firstLiftCompleted
      && [CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase);
  }

  // WHAT IS BEHIND THE LEAF DOES NOT LIGHT THE LEAF.
  //
  // Two of these three lamps stand on the Source side of the FOH door — the
  // opening two cells past it, the first lift beyond that — and they were burning
  // at full intensity from the moment the player walked into the Scene Dock. So
  // the closed door was already red, which spent the reveal before it happened
  // and made the red read as a property of the door rather than of the place
  // behind it.
  //
  // They begin after the BODY crosses the leaf. Door progress is not enough:
  // even a correctly occluded wide-radius light can reach back through an open
  // aperture and tint the room. The observer boundary below is categorical.
  // How many of the approach run are submitted at once. See localLights().
  const SOURCE_APPROACH_LAMPS_LIT = 3;
  const SOURCE_SIDE_LIGHT_IDS = new Set([
    'source-landing:opening-emergency',
    'source-landing:first-lift-emergency',
  ]);
  // The approach run is on the far side of the leaf too, and it is the loudest
  // thing in the chapter — hall-strength lamps at ninety-six cells of reach.
  const onSourceSide = (id) => SOURCE_SIDE_LIGHT_IDS.has(id)
    || String(id).startsWith('source-approach-emergency-');
  // ── LIGHT IN A PLACE WITH NOTHING IN IT TO LIGHT IT ───────────────────────
  //
  // The bell passage and the walk out are the two tiers with no authored lamps,
  // and both rendered black: forty-seven bell meshes and twenty-eight drowned
  // structures at litPct 0. Ambient was the obvious answer and it is the wrong
  // one — measured, raising it from 0.012 to 0.45 moved the frame's luma from
  // 2.1 to 7.96 out of 255 and never lit a single pixel. Props here are lit by
  // local lights or they are not lit.
  //
  // So: ONE LAMP, AND IT IS WHERE THE OBSERVER IS. Not a torch, which is a cone
  // he aims and a battery he spends; an omnidirectional glow centred on him with
  // no fitting, no shadow and no falloff to read a room by. In a void with no
  // ground plane and no horizon that reads exactly the way a void should — a
  // thing becomes visible because you came near it, and stops when you leave —
  // and it needs no fiction about where the light is coming from, because there
  // is nowhere for it to come from.
  //
  // Ambient stays, low, doing the other half: it keeps the far shapes from being
  // absolutely nothing so the space has depth rather than a hard edge of dark.
  const VOID_LAMP = Object.freeze({
    bells: Object.freeze({ radius: 44, intensity: 4.2 }),
    // Dimmer and shorter out here, and it fades with the walk: by the nothing
    // there is barely enough to see your own hands by.
    preTape: Object.freeze({ radius: 40, intensity: 3.6 }),
  });

  function voidLamp() {
    const bells = state.phase === CHUNK_SURF_PHASE.BELLS;
    const local = player.y - landscapeOrigin().y;
    const preTape = state.phase === CHUNK_SURF_PHASE.HORIZON && local > SOURCE_HORIZON.from;
    if (!bells && !preTape) return null;
    const tuning = bells ? VOID_LAMP.bells : VOID_LAMP.preTape;
    // Across the walk out it falls away with the structures it is there to show.
    const fade = preTape ? 1 - 0.45 * sourcePreTapeProgress(local) : 1;
    return {
      id: 'source-void-lamp',
      kind: LIGHT_KIND.FITTING,
      x: player.x * CELL,
      y: (bells ? (SOURCE_TIER_BY_ID.bells?.height ?? 15.2) : (SOURCE_TIER_BY_ID.outskirts?.height ?? 15.2)) + 2.4,
      z: player.y * CELL,
      color: [0.74, 0.79, 0.88],
      intensity: tuning.intensity * fade,
      radius: tuning.radius,
      // It is not in a building and there is nothing for it to be occluded by.
      penetration: 1,
      castsShadow: false,
    };
  }

  function localLights({ time = phaseElapsed, reducedMotion = false, flashMode = 'full' } = {}) {
    const voidLight = voidLamp();
    if (voidLight) return [voidLight];
    const understood=normalizeSourceContactState(state.sourceContacts).insights.length;
    const emergency=sourceEmergencyLightingFrame({time,reducedMotion,flashMode});
    const voidFrame=sourceVoidFrame();
    // ONLY THE LAMPS THAT ARE ACTUALLY REACHING HIM.
    //
    // Each local light costs an architectural visibility raymarch PER PIXEL —
    // up to eight cell lookups each (architecturalLightVisibility). Adding the
    // approach run took Source from three lights to nine and tripled that cost
    // across the whole frame; measured, it moved the frame time from ~113ms to
    // ~161ms in the harness.
    //
    // The falloff is quadratic, so a lamp at forty of its forty-eight metres is
    // contributing under three percent — it is paying a full raymarch to be
    // invisible. Keeping the nearest few loses nothing that can be seen: at ten
    // metres' spacing the player is always well inside the nearest three.
    const lamps = sourceLandingLights(landscapeOrigin())
      // No red emitter is submitted while the observer is inside the Scene
      // Dock. This is stricter than hoping a wide-radius source happens to be
      // occluded, and it also avoids paying the per-pixel visibility raymarch
      // for lights whose authored contribution here is zero.
      .filter((light)=>light.id===SOURCE_THRESHOLD_LIGHT_ID
        ? voidFrame.thresholdLight>.01
        : !onSourceSide(light.id)||emergency.active)
      .map((light)=>{
        const sourceSide=onSourceSide(light.id);
        const threshold=light.id===SOURCE_THRESHOLD_LIGHT_ID;
        return{
          ...light,
          // The dock's sodium seam is not on the emergency contactor and never
          // pulses or receives Source-insight power boosts.
          intensity:threshold
            ?light.intensity*voidFrame.thresholdLight
            :sourceSide
            ?(light.intensity+understood*.18)*emergency.lightScale
            :light.intensity,
          penetration:sourceSide
            ?Math.min(1,light.penetration+understood*.025)
            :light.penetration,
        };
      });
    const approach = lamps.filter((light)=>String(light.id).startsWith('source-approach-emergency-'));
    if (approach.length <= SOURCE_APPROACH_LAMPS_LIT) return lamps;
    const px = player.x * CELL, pz = player.y * CELL;
    const nearest = new Set(approach
      .map((light)=>({ id: light.id, d: Math.hypot(light.x - px, light.z - pz) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, SOURCE_APPROACH_LAMPS_LIT)
      .map((entry) => entry.id));
    return lamps.filter((light)=>!String(light.id).startsWith('source-approach-emergency-') || nearest.has(light.id));
  }

  return {
    geometry,
    active: () => !!state.active,
    state: () => state,
    setPlayerPosition,
    textSpaceActive,
    localLights,
    sourceVoidFrame,
    sourceAmbient,
    sourceEmergencyLightingFrame,
    sourceFlashlightFrame,
    landingPortalFrame,
    landingContract: sourceLandingContract,
    sourceLandingHushFrame,
    sourceSensoryFrame,
    settleSourceSensory,
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
    // THE MACHINE. Main owns the slate and the window cue; this owns the dials.
    horizonTransport: () => ({ ...horizonTransport }),
    horizonTransportOptions: () => HORIZON_TRANSPORT_OPTIONS,
    horizonTransportReadings: () => horizonTransportReadings(),
    horizonTransportStatus: () => horizonTransportThreaded(horizonTransport),
    setHorizonTransportDial: (dial, value) => {
      if (!HORIZON_TRANSPORT_OPTIONS[dial]?.includes(value)) return { ...horizonTransport };
      horizonTransport = { ...horizonTransport, [dial]: value };
      return { ...horizonTransport };
    },
    runHorizonTransport: () => {
      const result = threadHorizonTransport(horizonTransport);
      horizonTransport = result.state;
      return { ...result, state: { ...result.state } };
    },
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
      sensory: sourceSensoryFrame(),
      traversal: traversalFrame(),
      horizonFrame: horizonFrame(),
      landing: {
        ...sourceLandingContract(),
        tableau: sourceLandingHushFrame(),
        portal: landingPortalFrame(),
        void: sourceVoidFrame(),
        flashlight: sourceFlashlightFrame(),
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
