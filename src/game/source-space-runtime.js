import { SOURCE_HANGING_SHORE, SOURCE_SHORE_DIRECT_SECONDS, sourceShoreBounds, sourceShoreContains, sourceShoreDistance } from '../data/source-hanging-shore.js';
import { sourceStrataCollisionAt, sourceStrataEntryAt } from '../data/source-exposed-strata.js';
import { createSourceHangingShore } from './source-hanging-shore.js';
import { SOURCE_BRAIDED_DIVIDE, sourceDivideFloorAt, sourceDivideSupportAt, sourceDivideCollisionAt, sourceDivideGeometry, sourceDividePropPlacements, sourceDivideProbe } from '../data/source-braided-divide.js';
import { divideMeshName, dividePieceBounds } from '../render/source-divide-meshes.js';
import SOURCE_ATLAS from '../../content/chunk-surf/source-atlas.json' with { type: 'json' };
import { MOVE_MS } from '../config.js';
import { createSourceDockDoor, sourceDockDoorBlocks, SOURCE_DOCK_DOOR_OPEN_SECONDS } from './source-dock-door.js';
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
  normalizeSourceStation,
  normalizeSourceDivide,
  pageStageForDistance,
  reduceChunkSurf,
  sourceBossAvailable,
} from './chunk-surf-state.js';
import { chunkSurfRoom } from '../data/chunk-surf-script.js';
import { SOURCE_PAGES, sourcePageFor } from '../data/source-pages.js';
import {
  SOURCE_HALL, sourceHallCellIntervalMs, sourceHallRegime, sourceHallSheet,
  sourceHallStillPage, sourceHallInStillPatch, sourceHallPropPlacements, sourceHallLightPlacements,
} from '../data/source-hall.js';
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
import { LIGHT_KIND, resolveLightingContext } from '../data/conservatory-lights.js';
import {
  sourceRoomMemoryForProp, sourceRoomFixtureInstances,
  resolveSourceRoomMemoryLights, sourceRoomMemorySnapshot,
} from '../data/source-room-memories.js';
import {
  SOURCE_APPROACH_CELLS, SOURCE_CHUTES, SOURCE_HORIZON, SOURCE_LIFTS, SOURCE_TIER_BY_ID,
  SOURCE_PRE_TAPE, sourcePreTapeProgress,
  sourceChuteById, sourceFeatureAt, sourceHorizonDepth, sourceHorizonSeconds,
  sourceHorizonSlice, sourceLiftById, sourceTierAt,
  sourceTierHeightAt, sourceTraversal,
  SOURCE_BELLS,
  SOURCE_BELL_PASSAGE,
  inSourceBellsRoom,
  sourceBellsDepth,
  bellSwingAt,
  bellAssemblyPoseAt,
  SOURCE_CHAPEL_OUTSKIRTS,
  sourceBellsRoomResolve,
} from '../data/source-level.js';
import {
  SOURCE_LANDING_ENTRY_LOCAL,
  SOURCE_LANDING_PORTAL_MAX_ANGLE,
  sourceLandingPropCollisionAt,
  sourceLandingRecognitions,
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
  sourceContactChoice,
  sourceBossExposed,
  recordSourceRadioTalk,
  sourceContactTalksReady,
} from './source-contact.js';
import {
  HORIZON_BUST_REFUSAL,
  horizonBustAudience,
} from './horizon-bust.js';
import { sourceSensoryMix } from './source-sensory.js';
import { sectorErrorLines } from '../render/sector-error.js';
import { sourceTowerPath, sourceTowerPathDistance, SOURCE_TOWER_PATH_HALF_WIDTH } from './source-tower-path.js';
import { createSourceBellField } from './source-bell-field.js';
import { towerPersonalRecordingLevel } from '../audio/tower-personal-recording.js';
import { TOWER_PERSONAL_JOURNEY, towerPersonalPlacement, towerPersonalSupportAt, towerPersonalWorld } from '../data/tower-personal-journey.js';
import { normalizeTowerPersonalJourney, beginTowerPersonalJourney, towerPersonalJourneyFrame,
  tickTowerPersonalJourney, leaveTowerPersonalJourney, consumeTowerPersonalReward, crossTowerPersonalJourney } from './tower-personal-journey.js';
import { towerPersonalWorldPieces, towerPersonalWorldLights, towerPersonalHandoverPieces, TOWER_PERSONAL_WORLD_SOURCES } from '../render/tower-personal-worlds.js';
import { towerPersonalPiecePresent } from './tower-personal-visibility.js';

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
export const SOURCE_LANDING_PORTAL_SECONDS = SOURCE_DOCK_DOOR_OPEN_SECONDS;
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
export const SOURCE_APPROACH_TARGET_SECONDS = SOURCE_SHORE_DIRECT_SECONDS;
// Compatibility export only: the first nothingness has no emergency interval.
export const SOURCE_APPROACH_RED_ONSET_SECONDS = Infinity;
const SOURCE_FIRST_STAIR = SOURCE_CHUTES.find((chute) => chute.id === 'chute-fork');
const SOURCE_APPROACH_STAIR_FOOT_Y = SOURCE_HANGING_SHORE.lift.maxZ / CELL;
export const SOURCE_APPROACH_TRAVEL_CELLS = Math.abs(SOURCE_LANDING_PORTAL_LOCAL.y - SOURCE_APPROACH_STAIR_FOOT_Y);
export const SOURCE_APPROACH_PACE = CELL * 1000 / (SOURCE_HANGING_SHORE.walkMetresPerSecond * MOVE_MS);
const SOURCE_APPROACH_DESTINATION = Object.freeze({ x: 0, y: SOURCE_HANGING_SHORE.lift.maxZ / CELL + 2, facing: 0 });

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
// The band the fault material reads from — see sourceLayerAtWorld, which sends
// MATERIAL.sourceFault here, and sourceSyntaxTint, which paints it red.
const SOURCE_FAULT_LAYER = SOURCE_LAYER_BY_SECTOR.hush;

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

// ── THE OUTSKIRTS, AND THE DOORS STANDING IN THEM ───────────────────────────
//
// Things that are neither furniture nor rooms: what grew outside the building,
// what was set into its walls, what broke off its busts. (It used to be
// SOURCE_LEAK_MESHES, which includes the concert hall's whole shell and seating
// bank; drawn solid in the void, walking out of the field was floating through
// the entire hall.)
// As dense as the field LOOKS at its edge, not as dense as its scatter list:
// measured 2026-09-12, 96-107 model instances within 80 m of a body standing at
// the field's edge (leaks, cathedral, giants, drift, tribunal, shelves), against
// seven out here. Spread across the whole view, because the field it thins out
// of fills the whole view.
const OUTSKIRT_EDGE_INSTANCES = 100;
const OUTSKIRT_VIEW_RADIUS = 160;
const OUTSKIRT_VIEW_HALF_WIDTH = 160;

// The things out there that look back. When you turn around they have turned too.
const OUTSKIRT_WATCHER_MESHES = Object.freeze(['marble_bust_01', 'source_bust_broken_head', 'source_bust_broken_torso', 'horse_head']);

// A BODY THAT IS NOT WALKING WELL. The pace drags a little on two slow waves,
// and now and then a foot catches: the step hitches, the eye dips a few
// centimetres and comes back up slower than it went down. Deterministic in time,
// so it can be tested and replayed. Reduced motion keeps the pace changes and
// loses everything the eye would have to ride.
//
// IT USED TO LUNGE. The surge swung the pace a quarter either way, a stumble
// came most windows and threw the eye 22 cm down and the body 30 cm sideways in
// one symmetric swell, so each one read as a deliberate stretch — a lunge, a
// yoga pose — rather than a foot catching on something in the dark.
const GAIT_WINDOW_SECONDS = 9;
const GAIT_STUMBLE_SECONDS = 0.9;
const GAIT_STUMBLE_ATTACK = 0.18;
export function outskirtsGaitAt(timeSec = 0, seed = 1, { reducedMotion = false } = {}) {
  const t = Math.max(0, Number(timeSec) || 0), s = (Number(seed) || 1) * 0.001;
  const noise = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233 + s * 137) * 43758.5453; return x - Math.floor(x); };
  const surge = Math.sin(t * 0.73 + s * 3) * 0.04 + Math.sin(t * 1.91 + s * 7) * 0.02;
  const window = Math.floor(t / GAIT_WINDOW_SECONDS);
  const local = t - window * GAIT_WINDOW_SECONDS - (1.5 + noise(window, 3) * 6);
  const stumbling = !reducedMotion && noise(window, 5) < 0.55 && local >= 0 && local < GAIT_STUMBLE_SECONDS;
  // Fast down, slow back: a catch, not a swell.
  const phase = local / GAIT_STUMBLE_SECONDS;
  const stumble = !stumbling ? 0
    : phase < GAIT_STUMBLE_ATTACK ? Math.sin((phase / GAIT_STUMBLE_ATTACK) * Math.PI / 2)
      : Math.pow(1 - (phase - GAIT_STUMBLE_ATTACK) / (1 - GAIT_STUMBLE_ATTACK), 2);
  return {
    pace: 1.35 * (1 + surge) * (1 + stumble * 1.1),
    stumble,
    sway: reducedMotion ? 0 : Math.sin(t * 0.61 + s) * 0.9 + Math.sin(t * 1.37 + s * 2) * 0.45,
    eyeDropM: reducedMotion ? 0 : stumble * 0.07,
    lurch: reducedMotion ? 0 : stumble * (noise(window, 9) < 0.5 ? -1 : 1),
  };
}

// A tired torch. Most of the time it is simply on. Now and then, a burst: short
// dips inside half a second, then steady again. Never a regular strobe.
export function torchFlickerAt(timeSec = 0, seed = 1) {
  const t = Math.max(0, Number(timeSec) || 0), windowSec = 2.4;
  const window = Math.floor(t / windowSec);
  const noise = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233 + (Number(seed) || 1) * 0.0137) * 43758.5453; return x - Math.floor(x); };
  if (noise(window, 1) > 0.42) return 1;
  const local = t - window * windowSec - noise(window, 2) * 1.8;
  if (local < 0 || local > 0.55) return 1;
  const dip = noise(window * 3.1, Math.floor(local / 0.07) + 17);
  return dip < 0.55 ? 0.12 + dip * 0.5 : 1;
}

const SOURCE_OUTSKIRT_MESHES = Object.freeze([
  'opening_street_tree_small', 'opening_street_tree_small_b', 'opening_street_tree_small_c',
  'academic_dead_tree', 'academic_dead_tree_b', 'opening_park_laurel',
  'yard_hedge_run', 'yard_hedge_corner', 'vegetation_nettle_cluster', 'vegetation_weed_cluster',
  'vegetation_grass_edge', 'vegetation_leaf_scatter', 'academic_leaf_litter',
  'door_head_tympanum', 'door_sealed_scar',
  'marble_bust_01', 'horse_head', 'power_box_01',
  'source_bust_broken_torso', 'source_bust_broken_head',
]);
// Every door out here is a door, and one of two kinds. OPEN: the opening shows
// somewhere that is not here, and walking through it does nothing except that
// the door stops having been there. SHUT: its leaves stay in the frame, block
// like a door and refuse when tried. Neither goes anywhere.
//
// Each is one of the building's own door assemblies (src/data/source-door-fields.js):
// frame, head and leaves at their own size, hinged the way main.js hinges them.
// A door field is sixteen doors deep, and ends at its road's own door.
const ROUTE_DOOR_FIELD_COUNT = 16;
// How many seeded doors in the tower's field must be walked through first.
const TOWER_KEY_DOORS = 2;
const TOWER_DOOR_LOCKED_LINE = 'Locked.';
// THE DOOR FIELDS ARE CORRIDORS, hedged both sides the way the yard is, street
// trees behind the hedges, a hedge across the end behind the road's door.
const DOOR_CORRIDOR_HALF_WIDTH = 12;
// A route door's plane stands just short of a cell line. The first cell past it
// puts the eye .245 m inside, which is where St Brendan's own tower door stands
// behind the belfry arrival (brendanTowerDoor in main.js).
const ROUTE_DOOR_PLANE_OFFSET = 0.99;
const OUTSKIRT_SHUT_SHARE = 0.4;
// THE GREY DOORS at the far edge of the field stand just short of a cell line,
// like the road doors, so the step through them is one clean crossing.
const EDGE_DOOR_PLANE_OFFSET = 0.99;
const EDGE_DOOR_SPACING = 20.8; // cells: 10.4 metres, leaving 7.4 metres of void between pairs
const EDGE_DOOR_APRON = 8; // unbounded lateral walk on the final four-metre level edge
const EDGE_DOOR_ROW_REACH_M = 200;
const EDGE_DOOR_ZAP_SECONDS = 0.18;
// How far past the doors he is before they swing shut behind him, in cells.
const EDGE_DOOR_CLOSE_BEHIND = 5;
const OUTSKIRT_SHUT_LINES = Object.freeze([
  'It won’t open.',
  'Locked. From whichever side this is.',
  'There’s no handle on this side.',
]);

function segmentsCross(p, q, a, b) {
  const side = (o, u, v) => (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x);
  const d1 = side(a, b, p), d2 = side(a, b, q), d3 = side(p, q, a), d4 = side(p, q, b);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
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
  const fieldDepth = 340;
  const fieldEnd = 340 + SOURCE_APPROACH_CELLS;
  const marginY = (SOURCE_PLAN_WINDOW - fieldDepth) / 2;
  return {
    x: Math.floor((Number(origin.x || 0) - SOURCE_VOID_HALF_WIDTH - marginX) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP,
    y: Math.floor((Number(origin.y || 0) - fieldEnd - marginY) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP,
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
  if (ly * CELL <= -390 && ly * CELL >= -540) return sourceDivideFloorAt(lx * CELL, ly * CELL);
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

import { CHAPEL_WORLD_SET, ELSEWHERE_CROSSING, ELSEWHERE_CROSSING_SECONDS, ELSEWHERE_WORLDS, TOWER_WORLD_SET, ROUTE_DOOR_LEAK, elsewhereCrossingFrame, lockedDoorAnswer } from '../data/elsewhere-worlds.js';
import { DOOR_FIELD_ARCHETYPES, ROUTE_DOOR_ASSEMBLIES, doorAssembly, doorFieldPlanting, doorLeafLocalMatrix } from '../data/source-door-fields.js';
import { DOOR_ARCHETYPE } from '../data/conservatory-doors.js';
import {
  OUTSKIRT_BEATS, OUTSKIRT_ELEVATION, OUTSKIRT_LAMP_OFF_BEHIND, OUTSKIRT_ROAD_END, OUTSKIRT_WALKABLE_MESHES,
  OUTSKIRT_STRETCH_COUNT, OUTSKIRT_STRETCH_METRES, OUTSKIRT_STRETCH_START,
  OUTSKIRT_LAST_LIGHT, OUTSKIRT_LAST_MARK, OUTSKIRT_PASSES,
  OUTSKIRT_BUS_ENCOUNTER, OUTSKIRT_FOLD_ENCOUNTER, OUTSKIRT_CORRIDOR,
  outskirtBeatAlong, outskirtsArrivalLayout,
} from '../data/source-outskirts-arrival.js';
import { PROP_BOUNDS } from '../data/generated/prop-geometry.js';
import { createOutskirtsExperience } from './outskirts-experience.js';
import { outskirtsCollisionBoxes } from './outskirts-geometry.js';
import { createStationRealm, normalizeStationRealmHomeState,
  stationRealmSeed, stationRealmFrame as realmFrame, moveStationRealm as moveRealm,
  beginStationRealmReturn, stationRealmAtWindow } from './station-realms.js';
import {
  advanceSourceUnravelling, normalizeSourceUnravelling, sourceUnravellingFrame,
  sourceStreetRemnantVisible, SOURCE_UNRAVELLING_HALF_WIDTH_CELLS,
} from './source-unravelling.js';

export function createSourceSpaceRuntime({
  initialState,
  difficulty = 'contract',
  onState = () => {},
  onComplete = () => {},
  onScare = () => {},
} = {}) {
  let state = normalizeChunkSurfState(initialState);
  let stationClockSeconds = state.station.time;
  let stationEntries = state.station.entries;
  let stationWalk = state.station.walk;
  let doorCrossing = state.station.crossing;
  let stationRealm = state.phase === CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS ? state.station.realm : null;
  let stationHomeDiscovered = state.station.homeDiscovered;
  let stationHomeResolved = state.station.homeResolved;
  let stationLastReturn = state.station.lastReturn;
  let towerPersonal = normalizeTowerPersonalJourney(state.station.personal);
  let towerPersonalMonitorSeconds = 0;
  let towerPersonalMonitorHeld = false;
  let towerPersonalWorldSignal = { world: null, offset: 0, active: false };
  let doorTakenAt = new Map(state.station.takeBacks.map(({ id, at }) => [id, at]));
  let stationSavedSecond = Math.floor(stationClockSeconds);
  const shore = createSourceHangingShore(state.sourceShore);
  let divide = normalizeSourceDivide(state.sourceDivide);
  let dividePositionEstablished = false;
  const streetExperience = createOutskirtsExperience(state.outskirtsExperience);
  const bellField = createSourceBellField({initialState:state.bellField,difficulty});
  let sourceDialogue = normalizeSourceDialogueState(state.haystackDialogue, {
    seed: state.seed,
    facts: state.profile?.sourceMemoryFacts || {},
  });
  let player = { x: SOURCE_ENTRY.x, y: SOURCE_ENTRY.y, facing: SOURCE_ENTRY.facing };
  if (towerPersonal.active) player = { ...player, ...towerLandWorld(towerPersonal.pose) };
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
  let hushMeetingPosition = null;
  let horizonUnravelling = normalizeSourceUnravelling(state.horizon.unravelling);
  // A committed Contact resumes at the fight, never at the warning. Exact turns
  // are deliberately not persisted; the branch commitment is.
  let bossRequested = state.finale?.route === SOURCE_FINALE_ROUTE.CONTACT
    && state.finale?.stage === SOURCE_FINALE_STAGE.CONTACT_COMMITTED;
  let landingRainRemaining = state.landingWeatherSpent ? 0 : 12;
  const landingDoor = createSourceDockDoor({ open: state.landingDoorOpen, sealed: state.landingDoorSealed });
  let pendingStillPage = false;
  const dockInspected = new Set();
  let phaseElapsed = 0;
  // SEARCH begins in the final quarter of the tunnel. It is a continuous
  // dramatic span, so this clock does not reset at HALL -> HAYSTACK.
  let searchElapsed = state.hallExperience?.searchElapsed ?? (state.phase === CHUNK_SURF_PHASE.HAYSTACK ? 12 : 0);
  // The pressure floor belongs to the whole hall/search event, not to a phase.
  // It is monotonic until the real page is taken.
  let standingPressure = Math.max(state.hallExperience?.pressure || 0, sourceStandingPressure({
    hallMaxDistance: state.hallMaxDistance,
    searchElapsed,
  }));
  // A resumed haystack is already past the point at which weather has arrived.
  let rainLatched = !!state.hallExperience?.rainLatched || state.phase === CHUNK_SURF_PHASE.HAYSTACK;
  let hallSnapshotElapsed = 0;
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
  const structures = sourceDividePropPlacements().map(p => ({
    id:p.id, kind:p.kind || p.mesh, hero:true, x:p.x/CELL, y:p.z/CELL, yaw:0,
    colliders:[], components:[{mesh:p.mesh,scale:p.scale,scaleX:p.scaleX,scaleY:p.scaleY,scaleZ:p.scaleZ,yaw:p.yaw,pitch:p.pitch,roll:p.roll,baseY:p.y}],
  }));
  let sourceCorpusCache = null;

  const searchSpanActiveFor = (snapshot = state) => snapshot.phase === CHUNK_SURF_PHASE.HAYSTACK
    || (snapshot.phase === CHUNK_SURF_PHASE.HALL
      && (Number(snapshot.hallMaxDistance) || 0) >= SOURCE_SEARCH_START_METRES);

  function setState(next, { immediate = false, recordCausal = true } = {}) {
    const previousPhase = state.phase;
    const previousSearchSpan = searchSpanActiveFor(state);
    const persistedUnravelling = normalizeSourceUnravelling(next.horizon?.unravelling);
    horizonUnravelling = normalizeSourceUnravelling({
      active: persistedUnravelling.active || horizonUnravelling.active,
      furthestMetres: Math.max(persistedUnravelling.furthestMetres, horizonUnravelling.furthestMetres),
      elapsedSeconds: Math.max(persistedUnravelling.elapsedSeconds, horizonUnravelling.elapsedSeconds),
      amount: Math.max(persistedUnravelling.amount, horizonUnravelling.amount),
      markers: [...persistedUnravelling.markers, ...horizonUnravelling.markers],
    });
    state = normalizeChunkSurfState({ ...next, sourceDivide:divide, horizon: { ...next.horizon, unravelling: horizonUnravelling }, outskirtsExperience: outskirtsExperienceSnapshot(), hallExperience: {
      searchElapsed, pressure: standingPressure, rainLatched,
    } });
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
    onState(state, { immediate, recordCausal });
    return state;
  }

  function dispatch(event, options) { return setState(reduceChunkSurf({...state,sourceDivide:divide,sourceShore:shore.snapshot(),station:stationSnapshot()}, event), options); }

  function divideLocation(x, z) { const s=SOURCE_BRAIDED_DIVIDE;return x>=s.minX&&x<=s.maxX&&z<=s.frontZ&&z>=s.backZ; }
  function divideActiveAt(x=player.x,y=player.y) {
    const o=landscapeOrigin();
    return state.firstLiftCompleted && [CHUNK_SURF_PHASE.LANDSCAPE,CHUNK_SURF_PHASE.FINAL,CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)
      && divideLocation((x-o.x)*CELL,(y-o.y)*CELL);
  }
  function divideSupport(x=player.x,y=player.y) {
    const o=landscapeOrigin(),mx=(x-o.x)*CELL,mz=(y-o.y)*CELL;
    return sourceDivideSupportAt(mx,mz,{feet:divide?.feet??sourceDivideFloorAt(mx,mz),maxStep:.45});
  }
  function updateDivideBody(dt=0) {
    if(!divideActiveAt())return;
    const o=landscapeOrigin(),x=(player.x-o.x)*CELL,z=(player.y-o.y)*CELL;
    divide ||= {version:1,feet:sourceDivideFloorAt(x,z),fallVelocity:0,falling:false};
    const support=divideSupport();
    const floor=typeof support==='number'?support:(support?.floor??support?.height??sourceDivideFloorAt(x,z));
    if(floor>=divide.feet-.45 && floor<=divide.feet+.45) {
      divide={version:1,feet:floor,fallVelocity:0,falling:false};
    } else if(floor<divide.feet-.45) {
      let remaining=Math.min(.25,Math.max(0,dt));
      divide.falling=true;
      while(remaining>0){const step=Math.min(remaining,1/60);divide.fallVelocity=Math.min(40,divide.fallVelocity+12*step);divide.feet=Math.max(floor,divide.feet-divide.fallVelocity*step);remaining-=step;}
      if(divide.feet<=floor+.001)divide={version:1,feet:floor,fallVelocity:0,falling:false};
    }
    state={...state,sourceDivide:{...divide}};
  }

  function landingPortalFrame() {
    const motion = landingDoor.frame();
    const sealed = !!state.landingDoorSealed;
    const requested = !!state.landingDoorOpen && !sealed;
    return Object.freeze({
      id: SOURCE_LANDING_PORTAL_DOOR_ID,
      requested,
      closing: motion.phase === 'closing',
      ...motion,
      // An honest clear width, rather than a timer that deletes a wall.
      passable: 1 - .95 * Math.cos(motion.progress * SOURCE_LANDING_PORTAL_MAX_ANGLE) >= .56,
      complete: motion.phase === 'open',
      locksMovement: false,
      sealed,
      redPressure: requested ? .28 + motion.progress * .72 : 0,
      depth: motion.progress * 7,
    });
  }

  function commitStillPageReveal() {
    if (!pendingStillPage || ![CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) return { handled: false };
    pendingStillPage = false;
    dispatch({ type: 'HAYSTACK_PAGE_FOUND', landscapeOrigin: sourceLandscapeOriginAfterHaystack() }, { immediate: true });
    transformElapsed = 0;
    sourceSensorySettled = false;
    return { handled: true };
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
    const page = sourceHallStillPage(state.seed, state.interactivePageSlot);
    return { x: page.x / CELL, y: page.z / CELL };
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
    if (![CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)
      && !(state.phase === CHUNK_SURF_PHASE.HORIZON && !state.finale.bust.decision)) return false;
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
  // The image can drift and lose substance while the body's ground remains
  // broad and continuous. The measured picture profile affects the image,
  // never the amount of dependable floor left under the player.
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
    return { centre: 0, reach: SOURCE_UNRAVELLING_HALF_WIDTH_CELLS,
      profileCentre: lerp(HORIZON_PROFILE.com) / HORIZON_LATERAL_SCALE,
      mosh: lerp(HORIZON_PROFILE.mosh), lum: lerp(HORIZON_PROFILE.lum) };
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
    if (onTowerPath(lx, ly)) return true;
    if (ly > SOURCE_HORIZON.from || ly < SOURCE_HORIZON.to) return false;
    return Math.abs(lx) <= SOURCE_UNRAVELLING_HALF_WIDTH_CELLS;
  }

  function onTowerPath(lx, ly) {
    return state.finale.bust.decision === 'accepted'
      && sourceTowerPathDistance(lx, ly, sourceTowerPath(horizonBustLateral())) <= SOURCE_TOWER_PATH_HALF_WIDTH;
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
    if (![CHUNK_SURF_PHASE.HORIZON, CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase)) return false;
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    if (ly > SOURCE_PRE_TAPE.from || ly < SOURCE_PRE_TAPE.to) return false;
    const overlap = 1 - smoothstep(SOURCE_HORIZON.from, SOURCE_HORIZON.from + 100, ly);
    return Math.abs(lx) <= SOURCE_PRE_TAPE.halfWidth
      + (SOURCE_UNRAVELLING_HALF_WIDTH_CELLS - SOURCE_PRE_TAPE.halfWidth) * overlap;
  }

  // Past the end of the tape on the chapel road: flat, open, lit by nothing.
  function chapelOutskirtsCell(x, y) {
    if (state.phase !== CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS) return null;
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    if (ly > SOURCE_CHAPEL_OUTSKIRTS.from || ly < SOURCE_CHAPEL_OUTSKIRTS.to || Math.abs(lx) > SOURCE_UNRAVELLING_HALF_WIDTH_CELLS) return null;
    return {
      floor: SOURCE_TIER_BY_ID.horizon?.height ?? 15.2,
      ceil: null,
      flags: F.SKY,
      material: MATERIAL.sourceVoid,
      solid: false,
      zone: ZONE.sourceSpace,
    };
  }

  function preTapeCell(x, y) {
    if (!inPreTape(x, y)) return null;
    // Flat, open, and lit by nothing, which is the whole of it.
    return {
      floor: (SOURCE_TIER_BY_ID.outskirts?.height ?? 15.2) + outskirtsFloorOffset(x, y),
      ceil: null,
      flags: F.SKY,
      material: MATERIAL.sourceVoid,
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
      ceil: null,
      flags: F.SKY,
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

  function shoreLocation(x,z) {
    if (!state.firstLiftCompleted) return true;
    const e=SOURCE_HANGING_SHORE.entry,b=SOURCE_HANGING_SHORE.bank;
    return z >= b.frontZ ||
      (x>=b.minX&&x<=b.maxX&&z>=e.turnZ&&!sourceStrataEntryAt(x,z)) ||
      (shore.frame().bodyFloor < 3.5 && z >= SOURCE_HANGING_SHORE.bank.backZ-20);
  }

  function shoreSurfaceFloor(x,z) {
    const motion=shore.frame(), b=SOURCE_HANGING_SHORE.bank;
    if(sourceShoreContains(SOURCE_HANGING_SHORE.lift,x,z)) {
      if(motion.boarded || (!motion.falling && Math.abs(motion.bodyFloor-motion.floor)<=.45))return motion.floor;
      return 0;
    }
    if(motion.bodyFloor>=b.floor-.45 && !motion.falling &&
      (sourceShoreContains(SOURCE_HANGING_SHORE.ledge,x,z) ||
        (x>=b.minX&&x<=b.maxX&&z<=b.frontZ&&z>=b.backZ)))return b.floor;
    return 0;
  }

  function shoreWallHit(ax,az,bx,bz,floor) {
    // The cut faces remain solid on both sides of the release. Rendering and
    // collision share the finite convex prisms, including their chipped ends.
    const steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/.12));
    for(let i=1;i<=steps;i++) {
      const x=ax+(bx-ax)*i/steps,z=az+(bz-az)*i/steps;
      if(sourceStrataCollisionAt(x,z,{feet:floor,height:EYE,radius:.25}))return true;
    }
    const l=SOURCE_HANGING_SHORE.lift,m=shore.frame();
    // A deck between step height and head clearance is a solid slab. The
    // operator can pass below an upper deck or board one at ground level, but
    // cannot walk into its moving edge midway through the descent.
    if(!m.boarded&&m.floor>floor+.45&&floor+EYE>m.floor-l.thickness&&
      sourceShoreContains(l,bx,bz,-.25))return true;
    if(m.boarded&&m.floor<l.top-.3&&az>=l.minZ&&bz<l.minZ+.32&&bx>l.minX&&bx<l.maxX)return true;
    return false;
  }

  function shoreCell(lx,ly,{renderOnly=false}={}) {
    const x=lx*CELL,z=ly*CELL;
    if(!shoreLocation(x,z))return null;
    // Retain the real rear hall, rather than painting void through its mouth.
    if(ly>=SOURCE_LANDING_REAR_LOCAL.y-1&&Math.abs(lx)<=HALL_HALF_WIDTH)return null;
    const floor=renderOnly?0:shoreSurfaceFloor(x,z);
    const b=SOURCE_HANGING_SHORE.bank,l=SOURCE_HANGING_SHORE.lift;
    let ceil=floor+64;
    if(floor<.5&&x>=b.minX&&x<=b.maxX&&z<=b.frontZ&&z>=b.backZ)ceil=b.underside;
    if(floor<.5&&sourceShoreContains(l,x,z)&&shore.frame().floor>2)ceil=shore.frame().floor-l.thickness;
    return {floor,ceil,flags:F.SKY,zone:ZONE.sourceSpace,material:MATERIAL.sourceVoid,sourceVoid:true,sourceShore:true};
  }

  function updateShorePosition({from=null}={}) {
    if(!sourcePhaseActive())return;
    const o=landscapeOrigin(),x=(player.x-o.x)*CELL,z=(player.y-o.y)*CELL;
    const wasRoom=from&&sourceLandingCellAt(from.x-o.x,from.y-o.y,{portalOpen:true})?.owned;
    const nowRoom=sourceLandingCellAt(x/CELL,z/CELL,{portalOpen:true})?.owned;
    const firstCrossing=!!wasRoom&&!nowRoom&&z<SOURCE_HANGING_SHORE.portal.z&&Math.abs(x-SOURCE_HANGING_SHORE.portal.x)<1;
    shore.updatePosition({x,z,surfaceFloor:shoreSurfaceFloor(x,z),outside:shoreLocation(x,z),firstCrossing});
    state={...state,sourceShore:shore.snapshot()};
  }

  function sourceShoreFrame() {
    const o=landscapeOrigin(),x=(player.x-o.x)*CELL,z=(player.y-o.y)*CELL;
    const phase=[CHUNK_SURF_PHASE.TRANSFORMING,CHUNK_SURF_PHASE.LANDSCAPE,CHUNK_SURF_PHASE.FINAL,CHUNK_SURF_PHASE.COMPLETED].includes(state.phase);
    const location=shoreLocation(x,z);
    const active=phase&&location;
    const cell=sourceLandingCellAt(x/CELL,z/CELL,{portalOpen:true});
    const room=!!cell?.owned;
    const hall=z>=SOURCE_LANDING_REAR_LOCAL.y*CELL-.5&&Math.abs(x/CELL)<=HALL_HALF_WIDTH;
    const outside=active&&!room&&!hall;
    const motion=shore.frame(),bounds=sourceShoreBounds(o);
    const t=motion.exposureElapsed;
    const recovery=motion.adapted?smoothstep(SOURCE_HANGING_SHORE.blindSeconds,SOURCE_HANGING_SHORE.adaptationSeconds,t):0;
    const rise=smoothstep(0,1.3,t);
    const whiteout=outside&&motion.adapted?rise*(1-recovery):0;
    const surface=room||hall?'room':motion.boarded?'lift':shoreSurfaceFloor(x,z)>3.7?'ledge':'void';
    return Object.freeze({
      ...bounds,active,visible:phase&&(active||sourceShoreDistance(SOURCE_HANGING_SHORE.bank,x,z)<100),outside,proper:phase&&!active,surface,bodyFloor:motion.bodyFloor,
      lift:{...bounds.lift,...motion,gateClosed:motion.boarded&&motion.floor<4,
        distanceMetres:sourceShoreDistance(SOURCE_HANGING_SHORE.lift,x,z)},
      distanceFromRoomMetres:sourceShoreDistance(SOURCE_HANGING_SHORE.room,x,z),
      distanceToBankMetres:sourceShoreDistance(SOURCE_HANGING_SHORE.bank,x,z),
      distanceToLiftMetres:sourceShoreDistance(SOURCE_HANGING_SHORE.lift,x,z),
      whiteout,recovery,adapted:motion.adapted,exposureElapsed:t,
      targetSeconds:SOURCE_APPROACH_TARGET_SECONDS,walkMetresPerSecond:4.8,
    });
  }

  function landscapeCell(x, y, { renderOnly = false } = {}) {
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    if (![CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE,
      CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)
      && !(state.phase === CHUNK_SURF_PHASE.HORIZON && !state.finale.bust.decision)) return null;
    // The sheet covers an instantaneous ROOM swap. The wider field may keep its
    // authored reveal clock, but the Scene Dock itself must be complete on the
    // first uncovered frame — especially the rear threshold under the body.
    const landing = sourceLandingCellAt(lx, ly, { portalOpen: true, renderOnly });
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
    const firstShore = shoreCell(lx, ly, { renderOnly });
    if (firstShore) return firstShore;
    // The whole opened field is one walkable ground — free roam, Oblivion-style,
    // no invisible causeway walls carving the space into corridors. The routes
    // survive only as brighter path material for wayfinding, not as the edges of
    // the floor. Visible code bounds the side perimeter until the door horizon,
    // where the ground and its repeating pairs continue left and right.
    // At the door horizon the field has no left or right endpoint. Only this
    // shallow apron extends: it cannot be used to walk around the crossing line.
    if (edgeDoorPhase() && ly >= SOURCE_PRE_TAPE.from && ly <= SOURCE_PRE_TAPE.from + EDGE_DOOR_APRON) return {
      floor: outskirtsHeight(), ceil: outskirtsHeight() + 22, flags: F.SKY,
      zone: ZONE.sourceSpace, material: MATERIAL.sourceField, sourceEdgeApron: true,
    };
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
    if(divideLocation(lx*CELL,ly*CELL)) {
      const support=renderOnly?null:sourceDivideSupportAt(lx*CELL,ly*CELL,{feet:divide?.feet??sourceDivideFloorAt(lx*CELL,ly*CELL),maxStep:.45});
      const floor=renderOnly?sourceDivideFloorAt(lx*CELL,ly*CELL):(typeof support==='number'?support:(support?.floor??support?.height??sourceDivideFloorAt(lx*CELL,ly*CELL)));
      return {floor,ceil:floor+64,flags:F.SKY,zone:ZONE.sourceSpace,material:MATERIAL.sourceField,sourceDivide:true};
    }
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
    return [CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase);
  }

  // The room opens back onto the real corridor. Sight and movement retain it
  // until the first ascent, so the open rear mouth never hides a body barrier.
  function hallRenderableInPhase() {
    if (hallVisibleInPhase()) return true;
    return [CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE].includes(state.phase)
      && !state.firstLiftCompleted;
  }

  function physicalHallCell(x, y) {
    const backtracking = [CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE].includes(state.phase)
      && !state.firstLiftCompleted && y >= landscapeOrigin().y + SOURCE_LANDING_REAR_LOCAL.y + 1;
    if (!hallVisibleInPhase() && !backtracking) return null;
    if (Math.abs(x) > HALL_HALF_WIDTH || y > 3) return null;
    if (hallVisibleInPhase() && y < SOURCE_HALL_END_Y) return null;
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
  function resolveSourceCell(x, y, hallCell, renderOnly = false) {
    if (towerPersonal.active) return towerLandCell(x, y, renderOnly);
    if (!state.firstLiftCompleted && [CHUNK_SURF_PHASE.TRANSFORMING,CHUNK_SURF_PHASE.LANDSCAPE].includes(state.phase)) {
      const first=landscapeCell(x,y,{renderOnly});
      if(first===OWNED_SOLID)return null;
      return first||hallCell(x,y);
    }
    const chapelOutskirts = chapelOutskirtsCell(x, y);
    if (chapelOutskirts) return chapelOutskirts;
    const bells = bellsCell(x, y);
    if (bells) return bells;
    const preTape = preTapeCell(x, y);
    if (preTape) return preTape;
    const horizon = horizonCell(x, y);
    if (horizon) return horizon;
    const landscape = landscapeCell(x, y, { renderOnly });
    if (landscape === OWNED_SOLID) return null;
    if (landscape) return landscape;
    return hallCell(x, y);
  }

  function physicalCellAt(x, y) {
    return resolveSourceCell(x, y, physicalHallCell);
  }

  function renderCellAt(x, y) {
    return resolveSourceCell(x, y, visualHallCell, true);
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
      if (towerPersonal.active) return { ok: !!to && !towerLandRefuses(toX, toY), why: !to ? 'wall' : towerLandRefuses(toX, toY) ? 'furniture' : undefined };
      if (!to) return {
        ok: false,
        why: hallVisibleInPhase() && Math.abs(toX) <= HALL_HALF_WIDTH && toY < SOURCE_HALL_END_Y
          ? 'source-hall-boundary'
          : 'wall',
      };
      if (sourceVoidFrame().sceneDock || sourceVoidFrame().approach) {
        const o = landscapeOrigin();
        const local = { x: toX - o.x, y: toY - o.y };
        const hit = sourceLandingPropCollisionAt(local.x, local.y);
        if (hit) return { ok: false, why: 'furniture', id: hit.id };
        const centre = { x: SOURCE_LANDING_PORTAL_LOCAL.x * CELL, y: SOURCE_LANDING_PORTAL_LOCAL.y * CELL };
        if (sourceDockDoorBlocks(
          { x: (fromX - o.x) * CELL, y: (fromY - o.y) * CELL },
          { x: local.x * CELL, y: local.y * CELL },
          { centre, progress: landingPortalFrame().progress, maxAngle: SOURCE_LANDING_PORTAL_MAX_ANGLE },
        )) return { ok: false, why: 'door leaf' };
      }
      if (horizonBustBlocks(toX, toY)) return { ok: false, why: 'horizon pedestal' };
      if (outskirtDoorBlocks(toX, toY) || routeDoorThresholdRefuses(fromX, fromY, toX, toY) || edgeDoorRefuses(fromX, fromY, toX, toY)) return { ok: false, why: 'shut door' };
      if (phoneBoxRefuses(fromX, fromY, toX, toY)) return { ok: false, why: 'phone box' };
      // While the recording under the last light plays, he stays in its light.
      // Playback has no invisible cage. The recording continues if he retreats.
      if (outskirtPieceRefuses(toX, toY) || towerLandRefuses(toX, toY)) return { ok: false, why: 'in the way' };
      if (doorCorridorRefuses(toX, toY)) return { ok: false, why: 'hedge' };
      if (to.ceil != null && to.ceil - to.floor < EYE + 0.2) return { ok: false, why: 'headroom' };
      if (sourcePhaseActive()) {
        const o = landscapeOrigin();
        const ax=(fromX-o.x)*CELL, az=(fromY-o.y)*CELL;
        const bx=(toX-o.x)*CELL, bz=(toY-o.y)*CELL;
        const bodyFloor=sourceShoreFrame().active?shore.frame().bodyFloor:(from?.floor??0);
        if (shoreWallHit(ax,az,bx,bz,bodyFloor)) return {ok:false,why:'bank hull'};
        if (shoreLocation(bx,bz)) {
          const rise=to.floor-bodyFloor;
          return {ok:rise<=.45,floor:to.floor,why:rise>.45?'too high':undefined};
        }
        if (state.firstLiftCompleted && divideLocation(bx,bz) && !from?.sourceEdgeApron && !to.sourceEdgeApron) {
          const feet=divide?.feet??from?.floor??sourceDivideFloorAt(ax,az);
          const steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/.12));
          let height=feet;
          for(let step=1;step<=steps;step++) {
            const x=ax+(bx-ax)*step/steps,z=az+(bz-az)*step/steps;
            const support=sourceDivideSupportAt(x,z,{feet:height,maxStep:.45});
            const floor=typeof support==='number'?support:(support?.floor??support?.height??sourceDivideFloorAt(x,z));
            if(floor>height+.45)return {ok:false,why:'source bank',floor};
            const joined=sourceStrataEntryAt(x,z)&&Math.abs(height-SOURCE_HANGING_SHORE.ledge.floor)<=.45;
            const collision=sourceDivideCollisionAt(x,z,{feet:Math.max(height,floor),height:EYE,radius:.22,
              frontSupport:joined?(sx,sz)=>sourceShoreContains(SOURCE_HANGING_SHORE.ledge,sx,sz):null});
            if(collision)return {ok:false,why:'source structure',id:collision.id};
            // Falling belongs to the vertical clock, never to this planar query.
            height=Math.max(height,floor);
          }
          return {ok:true,floor:to.floor};
        }
      }
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
    renderedFloorAt: () => divideActiveAt() ? (divide?.feet??physicalCellAt(player.x,player.y)?.floor??4.2) : traversal?.floor ?? (sourceShoreFrame().outside ? shore.frame().bodyFloor : physicalCellAt(player.x, player.y)?.floor) ?? 0,
    ceilAt: (x, y) => physicalCellAt(x, y)?.ceil || HALL_CEIL,
    zoneAt: (x, y) => physicalCellAt(x, y)?.zone || ZONE.none,
    materialAt: (x, y) => physicalCellAt(x, y)?.material || MATERIAL.none,
    worldAt: () => 'source_space',
    areaLabelAt: () => 'source space',
    logicalToPhysical: (x, y) => ({ x, z: y, y: physicalCellAt(x, y)?.floor ?? 0, layer: 'source', spaceId: 'source-space', renderGroup: 'source-space' }),
    renderPlanFor(x, y) {
      const half = SOURCE_PLAN_WINDOW / 2;
      const anchored = state.firstLiftCompleted && [CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase);
      const landscapePlan = anchored ? sourceLandscapePlanOrigin(landscapeOrigin()) : null;
      const followsDoorRow = edgeDoorPhase() && y - landscapeOrigin().y <= SOURCE_PRE_TAPE.from + EDGE_DOOR_APRON
        && Math.abs(x - landscapeOrigin().x) > half - 100;
      const originX = (!followsDoorRow ? landscapePlan?.x : null) ?? Math.floor((x - half) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP;
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
      const key = `${state.phase}:${state.pageStage}:${o.x}:${o.y}:${originX}:${originY}:${towerPersonal.active ? 'personal' : 'road'}`;
      if (lastPlan?.key === key) return withRetainedPlanPatch(lastPlan);
      const size = SOURCE_PLAN_WINDOW;
      const rgba = new Uint8Array(size * size * 4);
      const material = new Uint8Array(size * size);
      const sourceLayer = new Uint8Array(size * size);
      for (let py = 0; py < size; py += 1) for (let px = 0; px < size; px += 1) {
        const c = renderCellAt(originX + px + 0.5, originY + py + 0.5), i = py * size + px;
        if (!c) { rgba[i * 4 + 2] = F.SOLID; continue; }
        rgba[i * 4] = encodeH(c.floor);
        rgba[i * 4 + 1] = encodeH(c.ceil ?? c.floor + 32);
        rgba[i * 4 + 2] = c.flags;
        rgba[i * 4 + 3] = c.zone;
        material[i] = c.material;
        sourceLayer[i] = sourceLayerAtWorld(originX+px+.5,originY+py+.5,c);
      }
      lastPlan = { rgba, material, sourceLayer, w: size, h: size, originX, originY, group: 'source-space', key };
      lastPlanFirstLiftCompleted = !!state.firstLiftCompleted;
      return withRetainedPlanPatch(lastPlan);
    },
  };

  // The physical aperture is permanent. Only the first-ascent corridor change
  // patches the retained plan; the moving leaf is submitted as its own mesh.
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
    if (towerPersonal.active) return towerLandFrame().pose;
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
    if (id === 'chapel-outskirts') return { x: landscapeOrigin().x,
      y: landscapeOrigin().y + SOURCE_CHAPEL_OUTSKIRTS.from - SOURCE_CHAPEL_OUTSKIRTS.entryStandoff, facing: 0 };
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
    if (towerPersonal.active) {
      const frame = towerLandFrame();
      return { schema: SOURCE_OBJECTIVE_CONTRACT_VERSION, id: `personal-${frame.stage}`, label: '',
        target: null, bearingEligible: false, bearing: null,
        distance: null, distanceMeters: null, alignmentPulse: false, knownLandmarks: [], coherentRoute: [],
        tier: null, altitude: SOURCE_TIER_BY_ID.bells?.height ?? 15.2, bossExposed: false };
    }
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
      // SHORT OF THE TAPE there IS a direction, and it is the one thing out there
      // to see: the head of the picture, standing on the horizon (sourceVoidBeacon).
      const preTape = localPlayer.y > SOURCE_HORIZON.from;
      const head = { x: o.x + horizonBand(SOURCE_HORIZON.from).centre, y: o.y + SOURCE_HORIZON.from };
      objective = {
        id: 'horizon-walk',
        label: state.finale.bust.decision==='accepted'?'FOLLOW THE OPEN PATH'
          :preTape?'WALK TO THE PICTURE ON THE HORIZON':'STAY WITH THE PICTURE',
        target: preTape ? head : null,
        bearingEligible: preTape,
        distance: preTape ? Math.hypot(head.x - player.x, head.y - player.y) : undefined,
        horizonDepth: depth,
        horizonProgress: Math.max(0, Math.min(1, depth / SOURCE_HORIZON.length)),
      };
    } else if (state.phase === CHUNK_SURF_PHASE.BELLS) {
      objective = {id:'bell-field',label:localPlayer.y<=SOURCE_BELLS.doors.from
          ?(towerDoorUnlocked()?'THE TOWER DOOR IS OPEN':'FIND WHAT OPENS THE TOWER DOOR')
          :'WALK BETWEEN THE BELLS — KEEP THEM QUIET',
        // Once it is open, the tower door is somewhere to walk to. Before that the
        // keys are the search, and nothing points at them.
        target:towerDoorUnlocked()?{x:o.x,y:o.y+SOURCE_BELLS.room.threshold}:null,
        bearingEligible:towerDoorUnlocked(),
        distance:Math.hypot(o.x-player.x,o.y+SOURCE_BELLS.room.threshold-player.y),
        bellNoise:bellField.frame().noise,bellNoiseLimit:bellField.frame().noiseLimit,
        horizonDepth:sourceBellsDepth(localPlayer.y),horizonProgress:sourceBellsDepth(localPlayer.y)/SOURCE_BELLS.length};
    } else if (state.phase === CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS) {
      const chapelDoor = { x: o.x, y: o.y + SOURCE_CHAPEL_OUTSKIRTS.doorAt };
      objective = {
        id: 'chapel-doors',
        label: localPlayer.y > SOURCE_CHAPEL_OUTSKIRTS.doorsFrom ? 'WALK ON — THE TAPE HAS RUN OUT' : 'FIND THE CHAPEL DOOR',
        target: chapelDoor, bearingEligible: true,
        // The tape is behind him and it has run out: the HUD reads it as played.
        horizonDepth: SOURCE_HORIZON.length, horizonProgress: 1,
        distance: Math.hypot(chapelDoor.x - player.x, chapelDoor.y - player.y),
      };
    } else if (state.phase === CHUNK_SURF_PHASE.HALL) {
      objective = state.hallMaxDistance >= SOURCE_SEARCH_START_METRES
        ? { id: 'still-page', label: 'FIND THE STILL PAGE', target: haystackPagePoint(), bearingEligible: true }
        : { id: 'long-hall', label: 'FOLLOW THE PAPER FIELD', target: { x: 0, y: -(SOURCE_HALL_END_METRES / CELL) }, bearingEligible: false };
    } else if (state.phase === CHUNK_SURF_PHASE.HAYSTACK) {
      objective = { id: 'still-page', label: 'FIND THE STILL PAGE', target: haystackPagePoint(), bearingEligible: true };
    } else if (sourceShoreFrame().outside) {
      objective = { id: 'shore-walk', label: '', target: null, bearingEligible: false };
    } else if (state.phase === CHUNK_SURF_PHASE.TRANSFORMING || !state.firstLiftCompleted) {
      const outside = localPlayer.y <= SOURCE_LANDING_OPENING_LOCAL.y + 2;
      const voidFrame = sourceVoidFrame();
      objective = !state.landingDoorOpen && !state.landingDoorSealed
        ? { id: 'open-foh-door', label: 'OPEN THE FOH DOOR', target: landingWorld(SOURCE_LANDING_PORTAL_LOCAL), bearingEligible: true }
        : voidFrame.approach
        ? { id: 'shore-walk', label: '', target: null, bearingEligible: false }
        : state.sourceApproachComplete
        ? { id: 'first-stair', label: 'ENTER SOURCE SPACE', target: landingWorld(SOURCE_APPROACH_DESTINATION), bearingEligible: true }
        : outside
        ? { id: 'white-threshold', label: 'STEP INTO THE WHITE', target: landingWorld(SOURCE_LANDING_OPENING_LOCAL), bearingEligible: false }
        : { id: 'leave-get-in', label: `LEAVE THE ${SCENE_DOCK_LABEL}`, target: landingWorld(SOURCE_LANDING_OPENING_LOCAL), bearingEligible: true };
    } else if (state.phase === CHUNK_SURF_PHASE.FINAL && state.finalEncounter.status !== SOURCE_FINAL_STATUS.RESOLVED) {
      objective = {
        id: sourceBossExposed(state.sourceContacts) ? 'return-paths' : 'normal-exit',
        label: 'THROUGH THE GREY DOORS AT THE EDGE',
        target: {x:o.x,y:o.y+SOURCE_PRE_TAPE.from},
        bearingEligible: false,
      };
    } else if (state.phase === CHUNK_SURF_PHASE.COMPLETED) {
      objective = state.finale.route === SOURCE_FINALE_ROUTE.CHAPEL
        ? { id: 'chapel-crossing', label: 'THROUGH THE CHAPEL DOOR', target: null, bearingEligible: false }
        : { id: 'tower-crossing', label: 'MOVE FORWARD INTO THE TOWER', target: landmarkPoint('final-page'), bearingEligible: false };
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
    const o = landscapeOrigin();
    const point = {
      x: o.x + SOURCE_LANDING_REAR_LOCAL.x,
      y: o.y + SOURCE_LANDING_REAR_LOCAL.y + 1 + SOURCE_BRACKET.rearGapEndMetres / CELL,
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
    if (state.phase === CHUNK_SURF_PHASE.TRANSFORMING) {
      transformElapsed = SOURCE_TRANSFORM_SECONDS;
      dispatch({ type: 'TRANSFORMATION_COMPLETED' }, { immediate: true });
    }
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
    const meeting = state.firstLiftCompleted && !state.finale.route && sourceBossAvailable(state)
      && [CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase);
    const laterPursuit = false;
    const present = bracket.active || landing.active || meeting;
    const colliding = false;
    return {
      mode: colliding ? 'pursuit' : present ? 'atmospheric' : 'absent',
      colliding,
      meeting,
      contactAvailable: meeting && Math.hypot((player.x-landscapeOrigin().x)*CELL+12,(player.y-landscapeOrigin().y)*CELL+465)<=5.5
        && Math.abs((divide?.feet??4.2)-4.2)<1 && !pendingContact && !traversal,
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

  // A patient human trace occupies the service edge of the listening court.
  // HUSH remains the nonverbal pressure of the surrounding space.
  function hushApproachFrame(dt = 0) {
    if (!hushMode().meeting) return { active: false };
    const o=landscapeOrigin();
    hushMeetingPosition={x:o.x-12/CELL,y:o.y-465/CELL};
    return {active:true,safe:true,meeting:true,rear:{visible:true,...hushMeetingPosition,strength:.96}};
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

  function pressureFrame({ reducedMotion = false, time = 0 } = {}) {
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
        cellIntervalMs: sourceHallCellIntervalMs(CELL) * (1.1 + pressureT * .12),
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
        cellIntervalMs: sourceHallCellIntervalMs(CELL) * (.9 + depth * .2),
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
      // The tired street cadence settles gradually with the same retained
      // deterioration as the picture. Crossing the old seam changes no gear.
      movementMultiplier: state.phase === CHUNK_SURF_PHASE.HORIZON
        ? horizonMovementMultiplier(time, reducedMotion)
        : onApproach() ? APPROACH_PACE : 1,
      fear: null,
      rain: sourceVoidFrame().sceneDock ? 0 : landingRain,
      rainLatched: !sourceVoidFrame().sceneDock && landingRain > 0,
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
    const roomMemoryActive = sourceRoomMemoryActive();
    return {
      roomMemoryActive,
      sunrise: roomMemoryActive ? 0 : resolved ? 1 : approach,
      chroma: Math.max(0.18, 1 - approach * 0.72 - understood * 0.1),
      paper: roomMemoryActive ? 0 : resolved ? 1 : smoothstep(286, 318, depth),
      intervalStability: understood / 3,
    };
  }

  function finalEncounterRequest() {
    if (state.phase !== CHUNK_SURF_PHASE.FINAL || state.finalEncounter.status !== SOURCE_FINAL_STATUS.READY) return null;
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
      // What the talks at the lift left him knowing. Small; see SOURCE_TELLS.
      tells: [...(state.sourceContacts?.tells || [])],
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
    if (![CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.LANDSCAPE].includes(state.phase)) return { handled: false, state };
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
    const entry = { ...player };
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
  // These belong to the whole deterioration, including its first stretch on
  // the familiar road. Durable receipts prevent a reload repeating them.
  const HORIZON_MARKERS = Object.freeze([
    { id: 'street-unravels', amount: .20 },
    { id: 'street-erased', amount: .7 },
  ]);
  const horizonMarkerQueue = [];
  // Read and clear: the caller speaks it, and it must not be spoken twice.
  function takeHorizonMarker() {
    return horizonMarkerQueue.shift() || null;
  }

  // The furthest whole slice the body has reached, so HORIZON_ADVANCED fires
  // once per slice instead of once per footstep. Runtime-only; the durable
  // figure is state.horizon.maxDepth, which this feeds.
  let horizonDepthSlice = Math.floor(state.horizon.maxDepth / SOURCE_HORIZON.sliceMetres);

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
    return { handled: true, state, pathOpened: true, path: sourceTowerPath(horizonBustLateral()) };
  }

  // Where he is on the tape, which is also when he is on it. The renderer, the
  // score and the bust all read this one frame.
  // Picture half-width over corridor half-width, mirroring the renderer: the
  // profile is in tape units and the runtime walks in cells.
  const HORIZON_LATERAL_SCALE = 64 / 96;
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
  // The multiplier preserves ordinary walking speed across the real 374m
  // threshold-to-deck span. Completion belongs to the receiving bank's turn.
  const APPROACH_PACE = SOURCE_APPROACH_PACE;

  const sourcePhaseActive = () => [CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE,
    CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase);

  // Outside the physical leaf, including an actual return from Source proper.
  // This is a spatial region; walking never earns a completion quota.
  function onApproach() { return sourceShoreFrame().outside; }

  function sourceVoidFrame() {
    const sourcePhase=sourcePhaseActive(),portal=landingPortalFrame(),first=sourceShoreFrame();
    const localY=player.y-landscapeOrigin().y;
    const distance=Math.max(0,Math.min(SOURCE_APPROACH_TRAVEL_CELLS,SOURCE_LANDING_PORTAL_LOCAL.y-localY));
    const localX=(player.x-landscapeOrigin().x)*CELL,localZ=localY*CELL;
    return Object.freeze({
      phase:state.phase,sourcePhase,active:sourcePhase&&!state.firstLiftCompleted,
      sceneDock:sourcePhase&&first.active&&!first.outside,
      approach:sourcePhase&&first.outside,complete:!!state.firstLiftCompleted,
      proper:sourcePhase&&first.proper,localY,distance,
      // Let the arrival reveal breathe. The surviving disk intrusion belongs
      // to pressure near the court, rather than hiding the first field view.
      windowIntrusionReady:sourcePhase&&first.proper&&state.firstLiftCompleted&&Math.hypot(localX+12,localZ+465)<26,
      targetDistance:SOURCE_APPROACH_TRAVEL_CELLS,progress:clamp01(distance/SOURCE_APPROACH_TRAVEL_CELLS),
      elapsedSeconds:first.exposureElapsed,targetSeconds:SOURCE_APPROACH_TARGET_SECONDS,
      redOnsetSeconds:Infinity,redProgress:0,whiteout:first.whiteout,
      thresholdLight:first.outside?0:smoothstep(.15,.95,portal.progress),
      horizonDistanceMetres:first.distanceToBankMetres,horizonScale:1,shore:first,
    });
  }

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
  const DOCK_AMBIENT = Object.freeze({ color: Object.freeze([.66, .67, .62]), intensity: .036, whitePointScale: .24, captureExposure: 3.8 });
  const HALL_AMBIENT = Object.freeze({ color: Object.freeze([0.60, 0.64, 0.61]), intensity: 0.028, whitePointScale: 0.22, captureExposure: 4.5 });
  const properLighting = resolveLightingContext({ zone: ZONE.none });
  const PROPER_AMBIENT = Object.freeze({
    color: Object.freeze(properLighting.ambientColor), intensity: Math.max(.05,properLighting.ambientIntensity),
    whitePointScale: properLighting.whitePointScale,
    captureExposure: 8,
  });

  // The walk out is lit like the bell passage at the field's edge — there are
  // structures out there and they have to be visible — and goes down toward the
  // dark across the nothing. Never all the way to Source's 0.012: that is the
  // value that rendered forty-seven bells black, and an empty space still has to
  // read as empty rather than as a frame that failed.
  const PRE_TAPE_AMBIENT_FLOOR = 0.030;

  function sourceAmbient() {
    // These rooms have surviving practicals. The void's acquisition gain burns
    // their desks and figures into paper white before the recorded ink pass.
    if (towerPersonal.active) return { color: towerPersonal.stage === 'ash-room' ? [.61, .59, .53] : [.57, .62, .63], intensity: ['tape-field','dead-broadcast'].includes(towerPersonal.stage) ? .12 : .055, whitePointScale: 1, captureExposure: 1.2 };
    if ([CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) return HALL_AMBIENT;
    if (sourceVoidFrame().sceneDock) return DOCK_AMBIENT;
    if (sourceShoreFrame().outside) return {color:[.60,.66,.74],intensity:.085,whitePointScale:.24,captureExposure:2.2};
    if (sourceRoomMemoryActive()) return PROPER_AMBIENT;
    if (state.phase === CHUNK_SURF_PHASE.BELLS || state.phase === CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS) return BELLS_AMBIENT;
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
    const voidFrame = sourceVoidFrame();
    const localY = voidFrame.localY;
    // The first nothingness uses neutral light and the carried physical torch.
    // Retain this frame API for the ordinary Source compositor and old saves.
    const emergency = sourceEmergencyFrame(time, {
      reducedEffects: reducedMotion || flashMode !== 'full',
    });
    return Object.freeze({
      active: false,
      sceneDock: voidFrame.sceneDock,
      approach: voidFrame.approach,
      localY,
      boundaryY: SOURCE_LANDING_PORTAL_LOCAL.y - 1,
      cycle: emergency.cycle,
      lightScale: emergency.lightScale,
      strength: 0,
    });
  }

  // The torch changes at the BODY boundary. The physical Scene Dock needs its
  // actual door, freight and walls legible under normal light. The first shore
  // keeps that physical beam. Source proper now records the same material and
  // physical beam as the building; surviving practicals supply its differences.
  function sourceFlashlightFrame({ time = 0, reducedMotion = false, flashMode = 'full' } = {}) {
    if (towerPersonal.active) {
      return Object.freeze({ mode: 'normal', profile: 'hall', active: false, xray: false, cycle: 1, flicker: 1 });
    }
    if ([CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) {
      return Object.freeze({ mode: 'normal', profile: 'hall', active: false, xray: false, cycle: 1, flicker: 1 });
    }
    if(sourceVoidFrame().sceneDock)return Object.freeze({mode:'normal',profile:'dock',active:false,xray:false,cycle:1,flicker:1});
    if(sourceShoreFrame().outside)return Object.freeze({mode:'normal',profile:'shore',active:false,xray:false,cycle:1,flicker:1});
    // OUT PAST THE FIELD the beam is the ordinary torch again, and it is not
    // happy about it. Steady whenever flashing is reduced.
    if (inDarkOutskirts()) return Object.freeze({
      mode: 'normal', active: false, xray: false, cycle: 1,
      flicker: reducedMotion || flashMode !== 'full' ? 1 : torchFlickerAt(time, state.seed),
    });
    if (sourceRoomMemoryActive()) return Object.freeze({ mode: 'normal', profile: 'proper', active: false, xray: false, cycle: 1, flicker: 1 });
    return Object.freeze({ mode: 'xray', active: false, xray: true, cycle: 1, flicker: 1 });
  }

  // Everywhere the physical void renderer draws: the walk out before the tape,
  // the bell passage, and the chapel's outskirts.
  function inDarkOutskirts() {
    if ([CHUNK_SURF_PHASE.BELLS, CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS].includes(state.phase)) return true;
    return state.phase === CHUNK_SURF_PHASE.HORIZON && player.y - landscapeOrigin().y > SOURCE_HORIZON.from;
  }

  // How much of the field's paper is still in the empty ground out there: 1 at
  // the field's edge, easing to 0 across the outskirts and the first half of the
  // nothing. It goes black slowly, not on the step past the perimeter.
  // THE PAPER STAYS IN THE FIELD. Past the grey doors it is night from the
  // first step; nothing out there was ever printed.
  function sourceVoidDawn() {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return 0;
    if (state.phase === CHUNK_SURF_PHASE.HORIZON) return 0;
    const local = player.y - landscapeOrigin().y;
    if (local > SOURCE_PRE_TAPE.from || local < SOURCE_HORIZON.from) return 0;
    return 1 - smoothstep(0, SOURCE_PRE_TAPE.length * 0.72, SOURCE_PRE_TAPE.from - local);
  }

  // WHERE THE PICTURE STARTS, seen from the dark short of it: the head of the
  // tape as a screen standing on the horizon, at its real width and a fixed
  // height, brighter the nearer it is. The renderer turns it into angles.
  // FURTHER OFF THAN IT STANDS, AND IT STILL ARRIVES. Sized at its real distance
  // it filled a sixth of the view from far back and then barely grew, so it read
  // as near and unreachable at once. Sized as if it stood BEACON_PUSHBACK_M
  // further on, it is small and low from the doors and grows by several times
  // across the walk, most of that in the last stretch — you can see it coming.
  const BEACON_PUSHBACK_M = 140;
  function sourceVoidBeacon() {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return null;
    const o = landscapeOrigin(), local = player.y - o.y;
    if (local <= SOURCE_HORIZON.from || local > SOURCE_PRE_TAPE.from) return null;
    const head = { x: o.x + horizonBand(SOURCE_HORIZON.from).centre, y: o.y + SOURCE_HORIZON.from };
    const dx = head.x - player.x, dy = head.y - player.y;
    const realDistanceM = Math.hypot(dx, dy) * CELL;
    return {
      bearing: Math.atan2(dx, -dy),
      distanceM: realDistanceM + BEACON_PUSHBACK_M,
      realDistanceM,
      halfWidthM: SOURCE_HORIZON.halfWidth * CELL,
      heightM: 24,
      strength: (0.45 + 0.55 * (1 - Math.max(0, Math.min(1, realDistanceM / (SOURCE_PRE_TAPE.length * CELL)))))
        * (1 - smoothstep(OUTSKIRT_ROAD_END - OUTSKIRT_STRETCH_METRES, OUTSKIRT_ROAD_END + 20, outskirtsAlong())),
    };
  }

  // The body's sway, lurch and drop in the dark stretches, for the camera.
  function outskirtsBodyFrame({ time = 0, reducedMotion = false } = {}) {
    const dark = state.phase === CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS || state.phase === CHUNK_SURF_PHASE.HORIZON;
    if (!dark) return null;
    const residue = sourceUnravellingFrame(horizonUnravelling).bodyResidue;
    if (residue <= .0001) return null;
    const gait = outskirtsGaitAt(time, state.seed, { reducedMotion });
    return { ...gait, sway: gait.sway * residue, lurch: gait.lurch * residue,
      stumble: gait.stumble * residue, eyeDropM: gait.eyeDropM * residue, residue };
  }
  function horizonMovementMultiplier(time = 0, reducedMotion = false) {
    const residue = sourceUnravellingFrame(horizonUnravelling).bodyResidue;
    const streetPace = outskirtsGaitAt(time, state.seed, { reducedMotion }).pace * (1 + .45 * outskirtsLosing());
    return streetPace * residue + HORIZON_PACE * (1 - residue);
  }
  // How far ahead the floor samples the corridor, in cells.
  const HORIZON_BAND_LOOKAHEAD = 110;
  // THE CHECKPOINT THE SCORE STANDS AT, this many cells on along the route.
  // Far enough that the route's bends show up as a turn of the head, near
  // enough that the sound is somewhere you are walking to, not the horizon.
  const HORIZON_GUIDE_AHEAD = 48;

  // Where the score stands: the next checkpoint on his route, in world cells.
  // On the tape it is the picture's own path, HORIZON_GUIDE_AHEAD on. Once the
  // bust has cut the tower road, it is that road, measured along its legs.
  // Short of the tape it is the head of the tape.
  function horizonGuide() {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return null;
    const o = landscapeOrigin(), lx = player.x - o.x, ly = player.y - o.y;
    if (ly > SOURCE_HORIZON.from) {
      const head = { x: o.x + horizonBand(SOURCE_HORIZON.from).centre, y: o.y + SOURCE_HORIZON.from };
      return { ...head, kind: 'head', distanceM: Math.hypot(head.x - player.x, head.y - player.y) * CELL };
    }
    if (state.finale.bust.decision === 'accepted') {
      const points = sourceTowerPath(horizonBustLateral());
      // The nearest point on the road, then HORIZON_GUIDE_AHEAD further along it.
      let best = { d: Infinity, seg: 0, t: 0 };
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((lx - a.x) * dx + (ly - a.y) * dy) / Math.max(1e-6, dx * dx + dy * dy)));
        const d = Math.hypot(lx - a.x - dx * t, ly - a.y - dy * t);
        if (d < best.d) best = { d, seg: i, t };
      }
      let left = HORIZON_GUIDE_AHEAD, seg = best.seg, t = best.t, point = points[points.length - 1];
      while (seg < points.length) {
        const a = points[seg - 1], b = points[seg], length = Math.hypot(b.x - a.x, b.y - a.y);
        const remaining = length * (1 - t);
        if (remaining >= left) { const u = t + left / Math.max(1e-6, length); point = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; break; }
        left -= remaining; seg += 1; t = 0;
      }
      const guide = { x: o.x + point.x, y: o.y + point.y };
      return { ...guide, kind: 'tower', distanceM: Math.hypot(guide.x - player.x, guide.y - player.y) * CELL };
    }
    const ahead = Math.max(SOURCE_HORIZON.to, ly - HORIZON_GUIDE_AHEAD);
    const guide = { x: o.x + horizonBand(ahead).centre, y: o.y + ahead };
    return { ...guide, kind: 'path', distanceM: Math.hypot(guide.x - player.x, guide.y - player.y) * CELL };
  }

  function horizonFrame() {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return { active: false };
    const o = landscapeOrigin(), local = player.y - o.y;
    const slice = sourceHorizonSlice(local), depth = sourceHorizonDepth(local);
    const bandHere = horizonBand(local), unravelling = sourceUnravellingFrame(horizonUnravelling);
    const groundY = SOURCE_TIER_BY_ID.horizon.height;
    return {
      active: true,
      onTape: local <= SOURCE_HORIZON.from,
      preTape: local > SOURCE_HORIZON.from,
      preTapeProgress: sourcePreTapeProgress(local),
      reason: state.horizon.reason,
      depth, progress: depth / SOURCE_HORIZON.length,
      seconds: sourceHorizonSeconds(local),
      slice: slice.index, sliceFraction: slice.fraction,
      lateral: player.x - o.x,
      // Both render passes use this same physical seam; crossing it does not
      // change the camera or start a new room around the body.
      worldOriginM: [(o.x + .5) * CELL, groundY, (o.y + SOURCE_HORIZON.from + .5) * CELL],
      seamY: o.y + SOURCE_HORIZON.from, endY: o.y + SOURCE_HORIZON.to,
      groundY, floorY: groundY, cellMetres: CELL,
      tapeLengthMetres: SOURCE_HORIZON.length * CELL,
      unravelling,
      towerPath: state.finale.bust.decision === 'accepted' ? sourceTowerPath(horizonBustLateral()).map(p => ({ x: p.x, depth: SOURCE_HORIZON.from - p.y })) : [],
      onTowerPath: onTowerPath(player.x - o.x, local),
      falling: 0,
      dream: smoothstep(70, 145, depth) * (1 - smoothstep(285, 365, depth)),
      collapsing: unravelling.loss > .7,
      collapse: unravelling.loss,
      edge: horizonEdge(player.x, player.y),
      band: bandHere, bandAhead: horizonBand(local - HORIZON_BAND_LOOKAHEAD),
      bandLookahead: HORIZON_BAND_LOOKAHEAD,
      guide: horizonGuide(),
      exposure: HORIZON_EXPOSURE_FLOOR + HORIZON_EXPOSURE_GAIN * bandHere.lum,
    };
  }

  function advanceHorizonUnravelling(dt = 0) {
    const metres = (SOURCE_HORIZON.from - (player.y - landscapeOrigin().y)) * CELL;
    horizonUnravelling = advanceSourceUnravelling(horizonUnravelling, { metres, dt });
    for (const marker of HORIZON_MARKERS) {
      if (horizonUnravelling.amount >= marker.amount && !horizonUnravelling.markers.includes(marker.id)) {
        horizonUnravelling = { ...horizonUnravelling, markers: [...horizonUnravelling.markers, marker.id] };
        horizonMarkerQueue.push(marker.id);
      }
    }
    // Commit before revealing the next visible amount bucket. Exact elapsed
    // time remains local between these writes and is included in state().
    if (horizonUnravelling.amount !== state.horizon.unravelling.amount
      || horizonUnravelling.markers.length !== state.horizon.unravelling.markers.length
      || Math.floor(horizonUnravelling.elapsedSeconds / 5) > Math.floor(state.horizon.unravelling.elapsedSeconds / 5)) {
      dispatch({ type: 'HORIZON_UNRAVELLING_ADVANCED', unravelling: horizonUnravelling });
    }
  }

  function tickHorizon(dt = 0) {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON || !(Number(dt) > 0)) return null;
    // Speech and listening are live time. The caller supplies zero only when
    // the world is paused; long suspension frames cannot spend minutes here.
    advanceHorizonUnravelling(dt);
    return null;
  }

  function chooseHorizonExit(exit) {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return { handled: false, state };
    dispatch({ type: 'HORIZON_EXIT_CHOSEN', exit }, { immediate: true });
    if (state.horizon.exit !== exit) return { handled: false, state };
    // THE TOWER ROAD DOES NOT END THE CHAPTER. It opens the bell passage, and
    // the chapter ends at the far room. Nothing is
    // reported to main.js yet — there is nothing to transition to.
    if ([CHUNK_SURF_PHASE.BELLS, CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS].includes(state.phase)) {
      return { handled: true, state, exit, entered: state.phase };
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
  // The body has walked across the revealed path's seam. Only the phase and
  // protection change here; this must never reposition or turn the player.
  function enteredBells() {
    if (state.phase !== CHUNK_SURF_PHASE.BELLS) return { handled: false, state };
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
      ...bellField.frame(),
    };
  }

  function tickBellField(dt=0,{difficulty:nextDifficulty=difficulty,reducedMotion=false,paused=false}={}) {
    if(state.phase!==CHUNK_SURF_PHASE.BELLS||paused||towerPersonal.active)return null;
    const o=landscapeOrigin();
    const result=bellField.step({x:player.x-o.x,y:player.y-o.y,dt,difficulty:nextDifficulty,reducedMotion});
    if(result.moved)player={...player,x:o.x+result.position.x,y:o.y+result.position.y};
    state={...state,bellField:bellField.snapshot()};
    phaseElapsed=state.bellField.elapsed;
    return {...result,position:{x:player.x,y:player.y}};
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
  // solid. The belfry is not built out here any more: it is through its door.
  function bellPassageBlockedAt(lx, ly) {
    for (const entry of SOURCE_BELL_PASSAGE) {
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
      flags: F.SKY,
      material: MATERIAL.sourceVoid,
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
    for (let i = 0; i < count; i += 1) {
      const sheet = sourceHallSheet(state.seed, i, { slot: state.interactivePageSlot });
      if (!sheet?.readable) continue;
      const candidate = {
        kind: 'source-sheet',
        id: `source-sheet-${i}`,
        index: i,
        x: sheet.x / CELL,
        y: sheet.z / CELL,
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
        && !state.firstLiftCompleted && !landingPortalFrame().complete
        && (!state.landingDoorSealed || landingPortalFrame().phase === 'closed')) {
      candidates.push({
        kind: 'source-landing-door', id: SOURCE_LANDING_PORTAL_DOOR_ID,
        ...landingWorld(SOURCE_LANDING_PORTAL_LOCAL),
        open: !!state.landingDoorOpen,
        sealed: !!state.landingDoorSealed,
        focusPriority: 12, focusRadius: 5,
      });
    }
    if (sourceVoidFrame().sceneDock) candidates.push(...sourceLandingRecognitions(landscapeOrigin()).map((entry) => ({
      ...entry, kind: 'source-dock-inspect', focusPriority: 4, focusRadius: 4,
    })));
    if ([CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) candidates.push({
      kind: 'haystack-page', id: 'source-page', ...haystackPagePoint(), focusPriority: 10, focusRadius: 7,
    });
    candidates.push(...readablePages());
    candidates.push(...outskirtDoorFocus(), ...doorExtraFocus(), ...doorScarFocus(), ...stationEdgeFocus(px, py), ...stationServiceFocus(), ...towerLandFocus());
    candidates.push(...edgeDoorFocus());
    candidates.push(...phoneBoxFocus(), ...flurryFocus());
    candidates.push(...outskirtInspectFocus());
    if (state.phase === CHUNK_SURF_PHASE.HORIZON) {
      const bust = horizonBustPoint();
      // Radius widened with him: he is a monument standing on the route now, and
          // needing to be within eight cells of a thing that size to notice it is
          // a reticle problem, not a staging one.
          candidates.push({ kind: 'horizon-bust', id: 'horizon-bust', ...bust, focusPriority: 9, focusRadius: 20 });
      return (lastFocus = focusedCandidate(px, py, facing, candidates, 8));
    }
    if ([CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase) && !sourceShoreFrame().outside) {
      // THE BODY IS A THING YOU CAN WALK UP TO.
      //
      // Contact follows behind at three quarters of the player's walking speed.
      // It never resolves by collision: the meeting is the player's move. Turn,
      // acquire the body, and interact. A wider focus radius keeps that readable
      // while clean forward walking is slowly opening the gap.
      if (hushMode().contactAvailable && presence?.active
          && Number.isFinite(presence.x) && Number.isFinite(presence.y)) {
        candidates.push({
          kind: 'hush', id: 'source-hush', x: presence.x, y: presence.y,
          focusPriority: 11, focusRadius: 12,
        });
      }
      if (state.phase === CHUNK_SURF_PHASE.FINAL) {
        const final = landmarkPoint('final-page');
        // The final sheet is a landmark, not a transport puzzle or fight menu.
        // Walking beyond the field is the exit; HUSH remains at the first ramp.
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
    if (!state.firstLiftCompleted) return;
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
    if (towerPersonal.active) {
      const before = { ...towerPersonal.pose, ...towerLandLocal(from.x, from.y) };
      const after = { ...towerPersonal.pose, ...towerLandLocal(to.x, to.y),
        yaw: Number.isFinite(to.yaw) ? to.yaw : towerPersonal.pose.yaw,
        pitch: Number.isFinite(to.pitch) ? to.pitch : towerPersonal.pose.pitch };
      const crossing = crossTowerPersonalJourney(towerPersonal, before, after);
      if (crossing) {
        towerPersonal = crossing.journey; towerLandCache = null; lastPlan = null;
        towerPersonalMonitorHeld = false; towerPersonalMonitorSeconds = towerPersonal.recordingOffsetSeconds || 0;
        towerPersonalWorldSignal = { world: null, offset: 0, active: false };
        doorCrossing = null; stationWalk = null;
        const pose = crossing.exit ? { ...crossing.pose } : towerLandWorld(crossing.pose);
        player = { ...player, ...pose };
        if (crossing.exit && towerPersonal.entryDoorId) {
          doorTakenAt.set(towerPersonal.entryDoorId, crossingClock());
          state = { ...state, routeDoorsErased: [...new Set([...(state.routeDoorsErased || []), towerPersonal.entryDoorId])].slice(-64) };
        }
        saveStation();
        return { handled: true, event: crossing.event, events: crossing.events, position: pose,
          transition: crossing.transition, frame: towerLandFrame() };
      }
      setPlayerPosition(to);
      return { handled: true, event: 'personal-walk', position: towerLandFrame().pose };
    }
    player = { ...player, ...to };
    updateShorePosition({from});
    updateDivideBody();
    if (!state.firstLiftCompleted && sourcePhaseActive()) {
      const o=landscapeOrigin(), x=(to.x-o.x)*CELL, z=(to.y-o.y)*CELL;
      if(shore.frame().bodyFloor>=4.1 && sourceStrataEntryAt(x,z)){
        dispatch({type:'SOURCE_APPROACH_COMPLETED',distance:Math.max(0,(SOURCE_LANDING_PORTAL_LOCAL.y-(to.y-o.y)))},{immediate:true});
        dispatch({type:'SOURCE_LIFT_COMPLETED',id:'lift-fork',checkpointId:'landing-fork'},{immediate:true});
        divide={version:1,feet:4.2,fallVelocity:0,falling:false};
        landingRainRemaining=0;
        dispatch({type:'SOURCE_LANDING_WEATHER_SPENT'},{immediate:true});
        return {handled:true,event:'source-shore-entered',position:{...player}};
      }
      return {handled:true,event:'source-shore-walk',progress:sourceVoidFrame().progress};
    }
    noteTierArrival(to);
    const localY=to.y-landscapeOrigin().y;
    if ([CHUNK_SURF_PHASE.LANDSCAPE,CHUNK_SURF_PHASE.FINAL].includes(state.phase)
      && localY<=SOURCE_PRE_TAPE.from && state.finale.route!==SOURCE_FINALE_ROUTE.CONTACT) {
      // Through the grey doors (edgeDoorRefuses let nobody else across).
      const result=completeNormalExit();
      edgeDoorClosesBehind=true;
      return {...result,event:'horizon',through:'edge-door'};
    }
    if(state.phase===CHUNK_SURF_PHASE.HORIZON && localY>SOURCE_PRE_TAPE.from && !state.finale.bust.decision){
      dispatch({type:'SOURCE_FIELD_RETURNED'},{immediate:true});
      edgeDoorClosesBehind=true;
      return {handled:true,event:'source-field-returned'};
    }
    closeEdgeDoorBehind(localY);
    const erasedEdgeDoor = touchEdgeDoorEcho(from, to);
    if (erasedEdgeDoor) return erasedEdgeDoor;
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
      advanceHorizonUnravelling();
      const slice = Math.floor(depth / SOURCE_HORIZON.sliceMetres);
      if (slice > horizonDepthSlice) {
        horizonDepthSlice = slice;
        dispatch({ type: 'HORIZON_ADVANCED', depth });
      }
      // THE DEFAULT EXIT IS DOING NOTHING. Walk far enough and the recording
      // runs out, and where it runs out is the nave. This is the exit that
      // cannot be missed, which is exactly why it is the one that costs nothing
      // and gives nothing — no bells, no advantage, just the way on.
      if(state.finale.bust.decision==='accepted' && localY<=SOURCE_BELLS.from
        && onTowerPath(to.x-landscapeOrigin().x,localY)) {
        chooseHorizonExit(HORIZON_EXIT.TOWER);
        return {handled:true,event:'bells-entered'};
      }
      if (depth >= SOURCE_HORIZON.length - 1 && state.finale.bust.decision!=='accepted') chooseHorizonExit(HORIZON_EXIT.CHAPEL);
      return;
    }
    if (state.phase === CHUNK_SURF_PHASE.BELLS) {
      eraseCrossedDoors(from, to);
      if (towerPersonal.active) return { handled: true, event: 'personal-entry', position: towerLandFrame().pose };
      // Only through the tower door, and only once it is unlocked.
      if (towerDoorUnlocked() && crossedRouteDoor(from, to)) enterBellsRoom();
      return;
    }
    if (state.phase === CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS) {
      eraseCrossedDoors(from, to);
      if (crossedRouteDoor(from, to)) enterChapelDoor();
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
        landingDoor.open();
        dispatch({ type: 'SOURCE_LANDING_DOOR_OPENED' }, { immediate: true });
        protectMoment(SOURCE_LANDING_PORTAL_SECONDS + .4);
        return { handled: true, event: 'landing-door-opened', text: '' };
      }
      return { handled: true, event: 'landing-door-opening', text: '' };
    }
    if (focus.kind === 'source-dock-inspect') {
      const again = dockInspected.has(focus.id);
      dockInspected.add(focus.id);
      return { handled: true, event: 'dock-inspect', id: focus.id, text: again ? focus.again : focus.first };
    }
    if (focus.kind === 'source-edge-door') return openEdgeDoor(focus.id);
    if (focus.kind === 'payphone') return { handled: true, event: 'payphone', text: '' };
    if (focus.kind === 'outskirt-piece') return { handled: true, event: 'outskirts-inspect', inspect: focus.inspect, stretch: focus.stretch, id: focus.id, text: '' };
    if (focus.kind === 'source-sheet') {
      const previouslyRead = !!sourceDialogue.assignments?.[focus.id];
      const assigned = assignSourceDialoguePage(sourceDialogue, SOURCE_PAGES, {
        sheetId: focus.id,
        hallStage: sourceHallSheet(state.seed, focus.index, { slot: state.interactivePageSlot })?.documentStage ?? state.pageStage,
      });
      if (assigned.assigned) commitDialogue(assigned.state, { immediate: true });
      const page = assigned.page;
      readSheets.add(focus.id);
      // Reading is not safety. The physical sheet is lazily assigned once and
      // persisted, so revisiting or reloading can never rewrite it; in the
      // haystack, stopping on a decoy still feeds the existing pressure field.
      if (searchSpanActiveFor(state) && !previouslyRead) {
        haystackWrongReads += 1;
        haystackReadImpulse = Math.min(1, haystackReadImpulse + 0.42);
      }
      return { handled: true, kind: 'page', page, text: '', event: 'page-read' };
    }
    if (focus.kind === 'haystack-page') {
      pendingStillPage = true;
      // The presenter commits only after the raised sheet fully covers the
      // frame. Neither taking it nor lowering it changes the body's bearing.
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
    if (focus.kind === 'outskirt-door') {
      const piece = doorFieldPieces().find((entry) => entry.id === focus.id);
      if (piece && homeDoorEligible(piece) && !homeDoorsLooked.has(piece.id)) {
        homeDoorsLooked.add(piece.id);
        return { handled: true, event: 'door-field-look', id: focus.id, archetype: piece.assembly.archetype,
          world: 'whiteout', home: true, opened: doorOpened(piece), shut: false, text: '' };
      }
      if (piece && (!piece.door.route || piece.door.route === 'chapel') && !doorsLooked.has(focus.id)) {
        doorsLooked.add(focus.id);
        return {
          handled: true, event: 'door-field-look', id: focus.id, archetype: piece.assembly.archetype,
          world: ELSEWHERE_WORLDS[piece.door.variant]?.id || null, opened: doorOpened(piece), shut: !!piece.door.shut, text: '',
        };
      }
      return { ...openDoorFieldDoor(focus.id), text: '' };
    }
    if (focus.kind === 'land-piece') return { handled: true, event: 'door-field-look', id: focus.id, land: focus.look, text: '' };
    if (focus.kind === 'land-door') return { handled: true, event: 'door-field-look', id: focus.id, land: focus.look, text: '' };
    if (focus.kind === 'station-service') return { handled: true, event: 'door-field-look', id: focus.id, service: focus.look, text: '' };
    if (focus.kind === 'station-edge') return { handled: true, event: 'door-field-look', id: focus.id, edge: focus.edge, text: '' };
    if (focus.kind === 'door-scar') return { handled: true, event: 'door-field-look', id: focus.id, scar: focus.world, text: '' };
    if (focus.kind === 'door-extra') return { handled: true, event: 'door-field-look', id: focus.id, extra: focus.extra, text: '' };
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
    player = { ...player, x: px, y: py, facing };
    const elapsed = Math.max(0, Number(dt) || 0);
    updateDivideBody(elapsed);
    phaseElapsed += elapsed;
    if (sourceShoreFrame().active) {
      const o=landscapeOrigin(), x=(px-o.x)*CELL, z=(py-o.y)*CELL;
      shore.tick(elapsed,{x,z,surfaceFloor:shoreSurfaceFloor(x,z),outside:sourceShoreFrame().outside});
      state={...state,sourceShore:shore.snapshot()};
    }
    const doorPoint = landingWorld(SOURCE_LANDING_PORTAL_LOCAL);
    const bodyClear = Math.hypot((px - doorPoint.x) * CELL - .5, (py - doorPoint.y) * CELL) > 1.2;
    landingDoor.tick(elapsed, { bodyClear });
    const searchActive = searchSpanActiveFor(state);
    if (searchActive) searchElapsed += elapsed;
    else if (state.phase === CHUNK_SURF_PHASE.HALL) searchElapsed = 0;
    if ([CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) refreshStandingPressure();
    // Save the continuous search envelope too, including when the body stays
    // still. Ordinary Source autosaves use this state without resetting rain.
    if ([CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) {
      hallSnapshotElapsed += elapsed;
      if (hallSnapshotElapsed >= 1) {
        hallSnapshotElapsed = 0;
        setState({ ...state, hallExperience: { searchElapsed, pressure: standingPressure, rainLatched } });
      }
    }
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
    const sheet=sourceHallSheet(state.seed,index,{slot:state.interactivePageSlot});
    const fallback=sourcePageFor(index,sheet?.documentStage ?? 0,state.seed);
    return fallback?`source-page:${fallback.id}`:ambientPaperDocumentId(state.seed,index);
  }

  function pageInstances(px, py, {time=0,reducedMotion=false,objectiveHints='full',flashMode='full'}={}) {
    if (!hallRenderableInPhase() || sourceShoreFrame().outside) return [];
    const count = pageCount(state.hallMaxDistance);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const sheet = sourceHallSheet(state.seed, i, { slot: state.interactivePageSlot });
      if (!sheet) continue;
      const r2 = rand(state.seed, i, 307);
      const rx = sheet.x, ry = sheet.z;
      let { y: elevation, pitch = 0, yaw = 0, roll = 0 } = sheet;
      // Addresses, layout and stock do not depend on maximum progress. Only
      // the loose edge flutters; the first form and answer remain flat.
      if (i > 0 && !reducedMotion && sheet.documentStage > 0) {
        const flutter = Math.sin(time * (1.1 + r2 * .9) + i * .73) * (.012 + sheet.documentStage * .004);
        elevation += flutter;
        roll += flutter * 2.4;
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
    const searchWind = !hallVisibleInPhase() ? 0 : state.phase === CHUNK_SURF_PHASE.HAYSTACK
      ? 1
      : clamp01(((state.hallMaxDistance || 0) - 48) / 52);
    const gustCount = reducedMotion
      ? Math.floor(searchWind * 18)
      : Math.floor(searchWind * (state.phase === CHUNK_SURF_PHASE.HAYSTACK ? 96 : 64));
    if (gustCount > 0) {
      const forward = [0, -1]; // authored hall axis: looking back cannot reverse the weather
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
        if (lift < 1 && sourceHallInStillPatch(wx, wz, {
          seed: state.seed, slot: state.interactivePageSlot, margin: .3,
        })) continue;
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

    if ([CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) {
      const correct = haystackPagePoint();
      const guidance = searchSpanActiveFor(state)
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
    if(state.firstLiftCompleted)return [];
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
        if (localY > 4 || localY < -LANDSCAPE_H || localY <= SOURCE_PRE_TAPE.from + EDGE_DOOR_APRON) continue;
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
    // The far edge belongs to the endless door row. No code wall can cover its
    // leaves, cap the view above them, or disclose a left/right endpoint.
    return out;
  }

  function interactionTextInstances() {
    if(state.firstLiftCompleted)return [];
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

  let hallPropsCache = null;
  function hallPropInstances() {
    if (hallPropsCache) return hallPropsCache;
    hallPropsCache = sourceHallPropPlacements({ seed: state.seed, slot: state.interactivePageSlot }).map((placement) => ({
      ...placement,
      matrix: sourceMatrix(placement),
      zone: ZONE.sourceSpace,
      structural: true,
    }));
    return hallPropsCache;
  }

  // The long hall is still the physical building: hundreds of authored sheet
  // meshes occupy its floor, walls and ceiling. Meshes disappear only after
  // the page opens into Source Space proper.
  // Cathédrale engloutie: real building meshes — chapel vaults, bells, pews, an
  // organ, the drowned furniture of the rooms — leak up through the open field.
  // They retain their GLB materials through the same recorded field as the
  // building. More survives above the code deeper in the field: small drowned
  // fragments near the entrance, recognisable architecture near the end.
  const SOURCE_LEAK_MESHES = Object.freeze([
    'chapel_vault', 'altar_table', 'lectern', 'hymn_board', 'pew', 'pew', 'chapel_inner_screen',
    'organ_console', 'organ_pipes', 'tower_organ_case', 'portrait_frame', 'hall_structure',
    'hall_seating', 'tower_bell_01', 'tower_bell_04', 'tower_frame', 'tower_wheel_01',
    'upright_piano', 'grand_piano', 'marimba', 'timpani',
  ]);
  const SOURCE_LEAK_COUNT = 120;

  function rememberedSourceProp(prop, options) {
    const roomMemory = sourceRoomMemoryForProp(prop, options);
    return roomMemory ? {
      ...prop, zone: roomMemory.zone, sourcePropId: roomMemory.sourcePropId, roomMemory,
    } : prop;
  }

  function landingPropInstances() {
    const portal = landingPortalFrame();
    const ordinary = [...sourceLandingPropPlacements(landscapeOrigin()),
      ...sourceLandingDoorPlacements(landscapeOrigin(), { portalProgress: portal.progress })].map((placement) => rememberedSourceProp({
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
      zone: placement.zone ?? ZONE.getIn,
      structural: true,
      lightMaintained: placement.lightMaintained,
      lightColor: placement.lightColor,
      sourcePropId: placement.sourcePropId,
      semantic: placement.semantic,
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
      if (chute.id === 'chute-fork') continue; // replaced by the physical receiving deck
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

  function structurePropInstances(px, py, { all = false } = {}) {
    const o = landscapeOrigin();
    const out = [];
    for (const placement of structures) {
      // The few authored giants retain their full bounds; the prop pass culls by extent.
      (placement.components || []).forEach((component, componentIndex) => {
        const offset = rotateOffset(component.dx, component.dz, placement.yaw || 0);
        const localX = placement.x + offset.x, localY = placement.y + offset.y;
        const worldX = o.x + localX, worldZ = o.y + localY;
        const floor = sourceLandscapeFloorAt(localX, localY);
        const scaleValue = Number(component.scale) || 1;
        out.push(rememberedSourceProp({
          id: `${placement.id}-${componentIndex}`,
          mesh: component.mesh,
          matrix: sourceMatrix({
            x: worldX * CELL,
            y: Number.isFinite(component.baseY) ? component.baseY : floor + (Number(component.elevation) || 0) - (Number(component.sink) || 0),
            z: worldZ * CELL,
            scaleX: component.scaleX??scaleValue,
            scaleY: component.scaleY??scaleValue,
            scaleZ: component.scaleZ??scaleValue,
            yaw: (placement.yaw || 0) + (component.yaw || 0),
            pitch: component.pitch || 0,
            roll: component.roll || 0,
          }),
          zone: ZONE.sourceSpace,
          structural: true,
          sourceStructure: placement.id,
        }, { structureKind: placement.kind }));
      });
    }
    return out;
  }

  function surfaceArchitectureInstances(px, py, { all = false } = {}) {
    if (![CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return [];
    const o = landscapeOrigin();
    const out = [...landingPropInstances()];
    if (state.phase === CHUNK_SURF_PHASE.TRANSFORMING) return out;
    if (!state.firstLiftCompleted) return out;
    for(const piece of sourceDivideGeometry()) {
      const {center,radius}=dividePieceBounds(piece);
      out.push({id:divideMeshName(piece.id),mesh:divideMeshName(piece.id),matrix:sourceMatrix({x:o.x*CELL+center[0],y:center[1],z:o.y*CELL+center[2]}),
        cullRadius:radius,zone:ZONE.sourceSpace,structural:true,sourceDivide:piece.id});
    }
    out.push(...structurePropInstances(px, py, { all }));
    out.push(...sourceRoomFixtureInstances(out, sourceMatrix));
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

  // ── THE GREY DOORS, AND THE NIGHT BEHIND THEM ───────────────────────────
  //
  // An endless row of grey goods pairs stands at the field's far edge. Copies
  // disappear at a touch; the pair on the road's axis is the only way through,
  // either way, and shuts behind him once he is through. Behind it is the
  // night he arrived on, emptied: one road straight out toward the picture, the
  // same stretch of it three times, a little more wrong each time
  // (src/data/source-outskirts-arrival.js).
  var outskirtCache, doorFieldCache, edgeDoorCache;
  var edgeDoorEchoCache = new Map(), edgeDoorEchoZappedAt = new Map();
  var edgeDoorWasOpen = null, edgeDoorMovedAt = null, edgeDoorClosesBehind = false;
  var outskirtsSeen = new Set(state.outskirtsExperience.seen), outskirtsQueue = [], outskirtLampsOff = new Set(state.outskirtsExperience.lampsOff);

  const edgeDoorClock = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;
  const edgeDoorPlaneY = () => SOURCE_PRE_TAPE.from + EDGE_DOOR_PLANE_OFFSET;
  const edgeDoorPhase = () => [CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.HORIZON].includes(state.phase)
    && state.finale?.route !== SOURCE_FINALE_ROUTE.CONTACT;
  const outskirtsHeight = () => SOURCE_TIER_BY_ID.outskirts?.height ?? 15.2;

  function edgeDoorPiece() {
    const o = landscapeOrigin(), key = `${o.x}:${o.y}`;
    if (edgeDoorCache?.key === key) return edgeDoorCache.piece;
    const piece = makeDoorPiece({
      id: 'source-edge-door', i: 0,
      assembly: doorAssembly(DOOR_ARCHETYPE.BAY_GOODS_PAIR, { activeLeaves: 'all' }),
      localX: 0.5, localY: edgeDoorPlaneY(), yaw: 0, height: outskirtsHeight(), door: { edge: true },
    });
    edgeDoorCache = { key, piece };
    return piece;
  }

  // One real assembly on the road's axis. All other indices are copies, made
  // around the eye rather than between two authored endpoints.
  function edgeDoorEcho(index) {
    if (index === 0) return edgeDoorPiece();
    const o = landscapeOrigin(), key = `${o.x}:${o.y}:${index}`;
    if (edgeDoorEchoCache.has(key)) return edgeDoorEchoCache.get(key);
    const piece = makeDoorPiece({
      id: `source-edge-echo:${index}`, i: index, assembly: edgeDoorPiece().assembly,
      localX: 0.5 + index * EDGE_DOOR_SPACING, localY: edgeDoorPlaneY(), yaw: 0,
      height: outskirtsHeight(), door: { edge: true, echo: true },
    });
    edgeDoorEchoCache.set(key, piece);
    if (edgeDoorEchoCache.size > 192) edgeDoorEchoCache.delete(edgeDoorEchoCache.keys().next().value);
    return piece;
  }

  const edgeDoorEchoGone = (index) => index !== 0 && (state.edgeDoorEchoesErased || []).includes(index);

  function edgeDoorRow(px = player.x, py = player.y) {
    if (!edgeDoorPhase()) return [];
    const o = landscapeOrigin();
    if (Math.abs(o.y + edgeDoorPlaneY() - py) * CELL > EDGE_DOOR_ROW_REACH_M) return [];
    const center = Math.round((px - o.x) / EDGE_DOOR_SPACING);
    const radius = Math.ceil(EDGE_DOOR_ROW_REACH_M / (EDGE_DOOR_SPACING * CELL));
    return Array.from({ length: radius * 2 + 1 }, (_, k) => edgeDoorEcho(center + k - radius));
  }

  function edgeDoorField(px = player.x, py = player.y) {
    return edgeDoorRow(px, py).map((piece) => {
      const [a, b] = piece.opening.threshold;
      return {
        id: piece.id, index: piece.i,
        real: !piece.door.echo, erased: !!piece.door.echo && edgeDoorEchoGone(piece.i),
        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        threshold: piece.opening.threshold.map((point) => ({ ...point })),
        corners: piece.opening.corners.map((corner) => [...corner]), normal: [...piece.opening.normal],
      };
    });
  }

  // Solid black at true depth: the torch can find steel and handles around it,
  // but there is no lit surface inside the doorway for it to find.
  function edgeDoorOpenings(px = player.x, py = player.y) {
    return edgeDoorRow(px, py).filter((piece) => !piece.door.echo || !edgeDoorEchoGone(piece.i)).flatMap((piece) => {
      const assembly = piece.assembly, fraction = piece.door.echo ? 0 : edgeDoorFraction();
      const out = [{
        id: `${piece.id}:absence`, absorbsLight: true,
        corners: piece.opening.corners.map((corner) => corner.map((value, axis) => value - piece.opening.normal[axis] * 0.14)),
        normal: [...piece.opening.normal], front: [0, 0, 0],
        back: !piece.door.echo && state.edgeDoorOpen ? [0.86, 0.8, 0.66] : [0, 0, 0],
      }];
      // Closed, each leaf has a lightless face inside a real steel perimeter.
      // These move on the actual hinge matrices, revealing the recessed throat
      // as the real pair opens rather than painting black over the whole frame.
      for (let leaf = 0; leaf < assembly.leafCount; leaf += 1) {
        const m = mul(piece.matrix, doorLeafLocalMatrix(assembly, leaf, fraction));
        const at = (x, y, z) => [
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        ];
        for (const side of [-1, 1]) out.push({
          id: `${piece.id}:leaf-absence-${leaf}-${side}`, absorbsLight: true,
          corners: [at(0.075, 0.12, side * 0.036), at(assembly.leaf.width - 0.075, 0.12, side * 0.036),
            at(assembly.leaf.width - 0.075, assembly.leaf.height - 0.12, side * 0.036), at(0.075, assembly.leaf.height - 0.12, side * 0.036)],
          normal: [m[8], m[9], m[10]], front: [0, 0, 0], back: [0, 0, 0],
        });
      }
      return out;
    });
  }

  function eraseEdgeDoorEcho(index) {
    if (!Number.isSafeInteger(index) || index === 0 || edgeDoorEchoGone(index)) return null;
    const piece = edgeDoorEcho(index), [a, b] = piece.opening.threshold;
    dispatch({ type: 'SOURCE_EDGE_DOOR_ECHO_ERASED', index }, { immediate: true });
    edgeDoorEchoZappedAt.set(index, edgeDoorClock());
    if (edgeDoorEchoZappedAt.size > 64) edgeDoorEchoZappedAt.delete(edgeDoorEchoZappedAt.keys().next().value);
    return { handled: true, event: 'edge-door-zapped', id: piece.id, index, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, text: '' };
  }

  // This runs only for an accepted body step. Geometry queries and camera/probe
  // warps cannot erase a door. Brushing a leaf or its frame is enough.
  function touchEdgeDoorEcho(from, to) {
    if (!edgeDoorPhase()) return null;
    const o = landscapeOrigin(), index = Math.round((to.x - o.x) / EDGE_DOOR_SPACING);
    if (index === 0 || edgeDoorEchoGone(index)) return null;
    const [a, b] = edgeDoorEcho(index).opening.threshold;
    if (distanceToSegment(to, a, b) > 0.9 || distanceToSegment(to, a, b) >= distanceToSegment(from, a, b)) return null;
    return eraseEdgeDoorEcho(index);
  }

  // How far the leaves have swung: over the assembly's own opening and closing times.
  // The swing starts when the doors are moved (markEdgeDoorMoved), on the page
  // clock. A state that arrived any other way — a reload, a god warp — is
  // simply where the doors already are.
  function markEdgeDoorMoved() { edgeDoorWasOpen = !!state.edgeDoorOpen; edgeDoorMovedAt = edgeDoorClock(); }
  function edgeDoorFraction(now = edgeDoorClock()) {
    const open = !!state.edgeDoorOpen;
    if (edgeDoorWasOpen === null || open !== edgeDoorWasOpen) { edgeDoorWasOpen = open; edgeDoorMovedAt = null; }
    if (edgeDoorMovedAt == null) return open ? 1 : 0;
    const assembly = edgeDoorPiece().assembly, t = Math.max(0, now - edgeDoorMovedAt);
    return open ? smoothstep(0, assembly.openSeconds, t) : 1 - smoothstep(0, assembly.closeSeconds, t);
  }

  function edgeDoorFrame(now = edgeDoorClock()) {
    if (!edgeDoorPhase()) return null;
    const piece = edgeDoorPiece(), fraction = edgeDoorFraction(now);
    return {
      id: piece.id, open: !!state.edgeDoorOpen, fraction,
      moving: (fraction > 0.001 && fraction < 0.999)
        || [...edgeDoorEchoZappedAt.values()].some((at) => now - at < EDGE_DOOR_ZAP_SECONDS),
      passable: !!state.edgeDoorOpen && fraction >= 0.6,
      side: state.phase === CHUNK_SURF_PHASE.HORIZON ? 'outskirts' : 'field',
      threshold: piece.opening.threshold.map((point) => ({ ...point })), normal: [...piece.opening.normal],
      corners: piece.opening.corners.map((corner) => [...corner]), width: piece.assembly.opening.width,
    };
  }

  function edgeDoorInstances(px, py, { reducedMotion = false } = {}) {
    const out = [], now = edgeDoorClock();
    const part = (id, mesh, matrix, extra = {}) => out.push({ id, mesh, matrix, zone: ZONE.sourceSpace, structural: true, sourceStructure: 'edge-door', ...extra });
    for (const piece of edgeDoorRow(px, py)) {
      const assembly = piece.assembly, gone = piece.door.echo && edgeDoorEchoGone(piece.i);
      if (gone) {
        const at = edgeDoorEchoZappedAt.get(piece.i), elapsed = at == null ? Infinity : now - at;
        if (reducedMotion || elapsed >= EDGE_DOOR_ZAP_SECONDS) continue;
        const q = Math.max(0, elapsed / EDGE_DOOR_ZAP_SECONDS), w = assembly.opening.width * (1 - q), h = assembly.opening.height;
        // No screen flash. The missing pair leaves one cold wire that pinches
        // shut in less than a footstep; collision and its black core are gone.
        for (const [k, x] of [[0, -w / 2], [1, w / 2]]) part(`${piece.id}:zap-${k}`, 'set_beam',
          mul(piece.matrix, sourceMatrix({ x, y: h / 2, z: 0.08, scaleX: 0.018, scaleY: h, scaleZ: 0.018 })),
          { noShadow: true, emissive: [0.32, 0.62, 0.76, 1.2 * (1 - q)] });
        continue;
      }
      const fraction = piece.door.echo ? 0 : edgeDoorFraction(now);
      part(piece.id, assembly.frameMesh, piece.matrix);
      // The free-standing goods pair keeps its own lintel, not a block of the
      // loading bay's masonry hanging unsupported above it.
      for (let k = 0; k < assembly.leafCount; k += 1) part(`${piece.id}:leaf-${k + 1}`, assembly.leafMesh,
        mul(piece.matrix, doorLeafLocalMatrix(assembly, k, fraction)));
      part(`${piece.id}:threshold`, 'door_threshold_slab', mul(piece.matrix, sourceMatrix({ y: 0.012, scaleX: assembly.opening.width + 0.45 })));
    }
    return out;
  }

  // Tried from either side: from the field, or from the outskirts until the
  // bust has had his answer and there is no going back.
  function edgeDoorFocus() {
    if (!edgeDoorPhase()) return [];
    const local = player.y - landscapeOrigin().y;
    if (state.phase === CHUNK_SURF_PHASE.HORIZON && (state.finale.bust.decision || local <= SOURCE_HORIZON.from)) return [];
    return edgeDoorField().filter((door) => !door.erased && (!door.real || !state.edgeDoorOpen))
      .map((door) => ({ kind: 'source-edge-door', id: door.id, x: door.x, y: door.y, focusPriority: 12, focusRadius: 8 }));
  }

  function openEdgeDoor(id = 'source-edge-door') {
    if (!edgeDoorPhase()) return { handled: false };
    if (id !== 'source-edge-door') {
      const match = /^source-edge-echo:(-?\d+)$/.exec(id);
      return (match && eraseEdgeDoorEcho(Number(match[1]))) || { handled: false };
    }
    if (state.phase === CHUNK_SURF_PHASE.HORIZON && state.finale.bust.decision) return { handled: true, event: 'edge-door-locked', text: '' };
    if (!state.edgeDoorOpen) {
      dispatch({ type: 'SOURCE_EDGE_DOOR_OPENED' }, { immediate: true });
      markEdgeDoorMoved();
      protectMoment(2);
    }
    return { handled: true, event: 'edge-door-opened', side: state.phase === CHUNK_SURF_PHASE.HORIZON ? 'outskirts' : 'field', text: '' };
  }

  // The edge refuses the body everywhere except through the open doors.
  function edgeDoorRefuses(fromX, fromY, toX, toY) {
    if (!edgeDoorPhase()) return false;
    const [a, b] = edgeDoorPiece().opening.threshold, lineY = (a.y + b.y) / 2;
    if ((fromY > lineY) === (toY > lineY)) return false;
    const x = fromX + (toX - fromX) * ((lineY - fromY) / ((toY - fromY) || 1));
    if (Math.abs(x - (a.x + b.x) / 2) > Math.abs(b.x - a.x) / 2 - 0.3) return true;
    if (state.phase === CHUNK_SURF_PHASE.HORIZON && state.finale.bust.decision) return true;
    return !edgeDoorFrame()?.passable;
  }

  // Once he is well clear of them, the doors shut behind him on their closer.
  function closeEdgeDoorBehind(localY) {
    if (!edgeDoorClosesBehind || !state.edgeDoorOpen) return;
    const clear = state.phase === CHUNK_SURF_PHASE.HORIZON
      ? localY < SOURCE_PRE_TAPE.from - EDGE_DOOR_CLOSE_BEHIND
      : localY > SOURCE_PRE_TAPE.from + EDGE_DOOR_CLOSE_BEHIND + 1;
    if (!clear) return;
    edgeDoorClosesBehind = false;
    dispatch({ type: 'SOURCE_EDGE_DOOR_CLOSED' }, { immediate: true });
    markEdgeDoorMoved();
    const [a, b] = edgeDoorPiece().opening.corners;
    outskirtsQueue.push({ id: 'edge-door-closed', cue: 'goods-door-shut', position: { x: (a[0] + b[0]) / 2, z: (a[2] + b[2]) / 2 } });
  }

  // Where the walk-onward choices put him: in front of the doors, facing them.
  function edgeDoorApproach() {
    const [a, b] = edgeDoorPiece().opening.threshold;
    return { x: Math.round((a.x + b.x) / 2), y: Math.ceil(a.y) + 4, facing: 0 };
  }

  // ── THE NIGHT, PIECE BY PIECE ─────────────────────────────────────────────
  // THE ROAD STARTS PAST THE STILL STRETCH. Pieces are authored in road metres
  // (source-outskirts-arrival.js); the still ground between the doors and the
  // road's first metre is SOURCE_PRE_TAPE.stillLength cells of nothing.
  const roadStartMetres = () => (SOURCE_PRE_TAPE.stillLength || 0) * CELL;
  function outskirtPieces() {
    const o = landscapeOrigin();
    if (outskirtCache && outskirtCache.ox === o.x && outskirtCache.oy === o.y) return outskirtCache.pieces;
    const planeZ = (o.y + edgeDoorPlaneY()) * CELL - roadStartMetres(), axisX = (o.x + 0.5) * CELL;
    const pieces = outskirtsArrivalLayout().map((piece, i) => ({
      ...piece, i, x: axisX + piece.across, z: planeZ - piece.along,
      localX: (axisX + piece.across) / CELL - o.x, localY: (planeZ - piece.along) / CELL - o.y,
    }));
    const vehicles = new Map();
    for (const p of pieces) {
      if (p.unfinished || !['bus', 'van'].includes(p.key)) continue;
      const entry = { ...p, cos: Math.cos(p.yaw), sin: Math.sin(p.yaw) };
      for (let k = Math.floor((p.z - 7) / OUTSKIRT_BUCKET_M); k <= Math.floor((p.z + 7) / OUTSKIRT_BUCKET_M); k++) {
        if (!vehicles.has(k)) vehicles.set(k, []);
        vehicles.get(k).push(entry);
      }
    }
    // The last street leaves familiar pieces across the physical seam. They
    // belong to this same world and disappear by retained decay thresholds.
    const seamZ = (o.y + SOURCE_HORIZON.from + .5) * CELL;
    const lamp = pieces.find(p => p.id === 'r28-lamp-0');
    const road = pieces.find(p => p.id === 'r0-road');
    const remnants = [
      ...[-32, -12, 10, 32, 48].map((metres, i) => ({ ...lamp, id: `source-street-remnant:lamp:${i}`, key: 'remnant-lamp',
        x: axisX + (i % 2 ? -6.4 : 6.4), z: seamZ - metres, dark: i === 4, faulty: false, inspect: null, remnant: true })),
      ...[-110, -80, -50, -24, 8, 40].map((metres, i) => ({ ...road, id: `source-street-remnant:road:${i}`, key: 'remnant-road',
        x: axisX, z: seamZ - metres, inspect: null, remnant: true })),
    ];
    outskirtCache = { ox: o.x, oy: o.y, pieces, remnants, solids: null, vehicles };
    return pieces;
  }

  const inOutskirtsView = () => {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return false;
    const local = player.y - landscapeOrigin().y;
    return local <= SOURCE_PRE_TAPE.from && local >= SOURCE_PRE_TAPE.to;
  };
  const outskirtsEye = (px = player.x, py = player.y) => ({ x: (px + 0.5) * CELL, z: (py + 0.5) * CELL });
  const inStreetRemnantView = () => state.phase === CHUNK_SURF_PHASE.HORIZON
    && player.y - landscapeOrigin().y <= SOURCE_PRE_TAPE.from
    && player.y - landscapeOrigin().y >= SOURCE_HORIZON.to;
  function streetPieceVisible(piece) {
    if (!horizonUnravelling.active) return true;
    if (/^last-guide|^last-rail|^last-service-stop/.test(piece.key)) return false;
    return sourceStreetRemnantVisible(piece.id, horizonUnravelling.amount);
  }
  function streetRenderPieces() {
    const pieces = outskirtPieces();
    return [...pieces, ...outskirtCache.remnants];
  }
  // Metres along the road from its first metre: negative on the still stretch.
  const outskirtsAlong = (py = player.y) => (landscapeOrigin().y + edgeDoorPlaneY()) * CELL - roadStartMetres() - (py + 0.5) * CELL;

  // WHAT YOU ARE NOT LOOKING AT DOES NOT HAVE TO STAY PUT — but only the things
  // the stretch says: a watcher turns to face where you were, the guard is gone
  // once you have looked away from him. The road and the lamps stay where they are.
  var outskirtUnseen = new Map(state.outskirtsExperience.observed.map(p => [p.id, { ...p, visible: null }]));
  function outskirtsExperienceSnapshot() {
    return streetExperience.snapshot({ seen: outskirtsSeen, lampsOff: outskirtLampsOff,
      observed: [...outskirtUnseen].filter(([, m]) => m.gone || m.epoch || m.seen)
        .sort((a, b) => (Number(!!a[1].gone) * 2 + Number(!!a[1].face)) - (Number(!!b[1].gone) * 2 + Number(!!b[1].face))).slice(-128)
        .map(([id, m]) => ({ id, seen: m.seen, gone: m.gone, epoch: m.epoch, face: m.face })) });
  }
  function outskirtMatrix(piece, { px, py, viewYaw = null, reducedMotion = false }) {
    const eye = outskirtsEye(px, py);
    let x = piece.x, z = piece.z, yaw = piece.yaw;
    // `visible` starts unknown, not true: a watcher that is out of view on the
    // first frame has not been looked away from, and must not turn to face a
    // body it was never seen by.
    const memo = outskirtUnseen.get(piece.id) || { visible: null, seen: false, gone: false, epoch: 0, face: null };
    if ((piece.watcher || piece.unwatched || piece.lamp) && Number.isFinite(Number(viewYaw))) {
      const bearing = Math.atan2(x - eye.x, -(z - eye.z));
      const away = Math.abs(Math.atan2(Math.sin(bearing - viewYaw), Math.cos(bearing - viewYaw)));
      const distance = Math.hypot(x - eye.x, z - eye.z);
      const visible = away < 0.95 && distance < 70 && outskirtsSightClear(eye, piece);
      if (visible && distance < 40) memo.seen = true;
      if (memo.visible && !visible) {
        memo.epoch += 1;
        if (piece.watcher) memo.face = Math.atan2(eye.x - x, eye.z - z) + (/^bus-woman/.test(piece.key) ? Math.PI : 0);
        if (piece.unwatched === 'vanish' && memo.seen) memo.gone = true;
      }
      memo.visible = visible;
      outskirtUnseen.set(piece.id, memo);
    }
    if (piece.watcher && memo.epoch) {
      if (memo.face != null) yaw = memo.face;
    }
    if (piece.stretch === OUTSKIRT_BUS_ENCOUNTER.pass && piece.key === OUTSKIRT_BUS_ENCOUNTER.womanKey) {
      const stage = streetExperience.busStage();
      // A small, retained movement inside the bus, never a collision mismatch.
      if (stage >= 3) z -= .18;
      // The shared woman's face is local -Z. Facing +Z at the player made the
      // intended acknowledgement turn her back toward the gap instead.
      if (stage >= 2) yaw = Math.atan2(eye.x - x, eye.z - z) + Math.PI;
    }
    return sourceMatrix({ x, y: outskirtsHeight() + (Number(piece.y) || 0), z, yaw });
  }

  function preTapeInstances(px, py, options = {}) {
    if (!inStreetRemnantView() && !recordedOutskirtsPresentation()) return [];
    const eye = outskirtsEye(px, py);
    const out = streetRenderPieces()
      .filter((piece) => streetPieceVisible(piece) && Math.hypot(piece.x - eye.x, piece.z - eye.z) <= 190 && !outskirtUnseen.get(piece.id)?.gone
        && !(piece.encounter === 'wrong-fold' && streetExperience.characterFrame().fold.phase === 'spent'))
      .flatMap((piece) => {
        let matrix = outskirtMatrix(piece, { ...options, px, py });
        if (piece.key === 'booth-hatch' && (streetExperience.hasAction(`r${piece.stretch}:phone`)
          || (piece.stretch === 6 && streetExperience.hasAction('r6:hatch-impact')))) matrix = mul(matrix, translate(1.14, 0, 0));
        // A set nobody finished building: the thing is only its timber frame.
        if (piece.unfinished) return unfinishedFrame(piece, matrix);
        const level = piece.faulty ? faultyLightLevel() : 1;
        const lamp = piece.lamp && !piece.dark && !outskirtLampsOff.has(piece.id) && level > 0.02;
        return [{
          id: piece.id, mesh: piece.key === 'booth-ledger' && (streetWorld.ledgerSigned || piece.stretch >= 15) ? 'outskirts_ledger_signed' : piece.mesh, matrix,
          ...(piece.glow ? { emissive: [...piece.glow] } : lamp ? { emissive: [1, 0.72, 0.42, piece.faulty ? 0.2 * level : 0.06] } : {}),
          zone: ZONE.sourceSpace, structural: !piece.character && piece.encounter !== 'wrong-fold', sourceStructure: piece.remnant ? 'street-remnant' : 'outskirts',
          ...(piece.encounter === 'wrong-fold' ? { character: foldCharacterFrame(options.reducedMotion) } : piece.character ? { character: piece.character } : {}),
        }];
      });
    // The building, off to the west, never nearer.
    const along = outskirtsAlong(py);
    if (along < OUTSKIRT_ROAD_END + 10 && !horizonUnravelling.active) {
      out.push({
        id: 'source-outskirt-elevation', mesh: OUTSKIRT_ELEVATION.mesh,
        matrix: sourceMatrix({ x: (landscapeOrigin().x + 0.5) * CELL + OUTSKIRT_ELEVATION.across, y: outskirtsHeight(), z: eye.z - OUTSKIRT_ELEVATION.ahead, yaw: OUTSKIRT_ELEVATION.yaw }),
        zone: ZONE.sourceSpace, structural: true, sourceStructure: 'outskirts',
      });
    }
    return [...out, ...streetDetailInstances(px, py, options, out), ...doubleInstances(px, py, options), ...(inOutskirtsView()
      ? [...edgeDoorInstances(px, py, options), ...phoneBoxInstances(px, py, options), ...flurryInstances(px, py, options), ...phantomInstances()] : [])];
  }

  // WHAT HAPPENS ON THE ROAD, ONCE EACH, and the lamps going out behind him.
  // Main reads this every frame out here and says the lines and plays the cues.
  function outskirtsBeatFrame({ viewYaw = null, reducedMotion = false } = {}) {
    const events = outskirtsQueue.splice(0);
    if (!inOutskirtsView()) return { events, along: null };
    const along = outskirtsAlong();
    const facingBack = Number.isFinite(Number(viewYaw)) && Math.cos(Number(viewYaw)) < -0.5;
    for (const beat of OUTSKIRT_BEATS) {
      if (outskirtsSeen.has(beat.id)) continue;
      const at = outskirtBeatAlong(beat);
      const fire = beat.trigger === 'reach' ? along >= at
        : beat.trigger === 'lookBack' ? along >= at && facingBack
        : beat.trigger === 'unseen' ? !!outskirtUnseen.get(`r${beat.stretch}-${beat.piece}`)?.gone
        : false;
      if (!fire) continue;
      outskirtsSeen.add(beat.id);
      events.push({ id: beat.id, line: beat.line });
    }
    for (const piece of outskirtPieces()) {
      if (!piece.lamp || piece.dark || piece.faulty || outskirtLampsOff.has(piece.id)) continue;
      if (along <= piece.along + OUTSKIRT_LAMP_OFF_BEHIND) continue;
      if (!reducedMotion && outskirtUnseen.get(piece.id)?.visible) continue;
      outskirtLampsOff.add(piece.id);
      events.push({ id: `lamp-off:${piece.id}`, cue: 'lamp-off', position: { x: piece.x, z: piece.z } });
    }
    return { events, along };
  }

  // THE LAST LIGHT, and the breaks that are played rather than laid out.
  // lastLightOut: the light has failed (the recording is over). lastLightHold:
  // the recording is playing, and he stays in the light.
  let lastLightOut = streetExperience.playback().done, lastLightHold = false;
  // A faulty sodium lamp: on, mostly, then catching, then gone for a moment.
  function faultyLightLevel(now = (globalThis.performance?.now?.() ?? Date.now()) / 1000) {
    if (lastLightOut) return 0;
    if (Math.sin(now * 13.1) * Math.sin(now * 3.3 + 0.7) > 0.82) return 0.12;
    if (Math.sin(now * 41) > 0.97) return 0.45;
    return 1;
  }
  function outskirtsLastLight() {
    if (!inOutskirtsView()) return null;
    const along = outskirtsAlong(), across = outskirtsEye().x - (landscapeOrigin().x + .5) * CELL;
    return { along, across, mark: OUTSKIRT_LAST_MARK.along, light: OUTSKIRT_LAST_LIGHT.along,
      reached: Math.hypot(along - OUTSKIRT_LAST_MARK.along, across - OUTSKIRT_LAST_MARK.across) < 1.25,
      out: lastLightOut, hold: lastLightHold, playback: streetExperience.playback() };
  }
  function setLastLightPlayback(value) { streetExperience.setPlayback(value); }
  function setLastLightOut(out = true) { lastLightOut = !!out; return lastLightOut; }
  function setLastLightHold(hold = true) { lastLightHold = !!hold; return lastLightHold; }
  // Where he stands once the light has gone: just onto the head of the tape.
  function outskirtsTapeHead() {
    const o = landscapeOrigin();
    return { x: o.x, y: o.y + SOURCE_PRE_TAPE.to - 4 };
  }
  // How the pass he is on breaks, when that is something to play rather than lay out.
  function outskirtsPassBreak() {
    if (!inOutskirtsView() || outskirtsAlong() > OUTSKIRT_ROAD_END) return null;
    const k = outskirtsPassAt();
    return k >= 0 ? OUTSKIRT_PASSES[k]?.break || null : null;
  }
  // A played-back pass turns its lamps back on, as if run in reverse.
  function relightPassLamps(k) {
    let lit = 0;
    for (const piece of outskirtPieces()) {
      if (piece.stretch === k && piece.lamp && outskirtLampsOff.delete(piece.id)) lit += 1;
    }
    return lit;
  }
  // LOSING HIMSELF. 0 on the first passes, rising steadily to 1 at the end of the
  // road: how far his sound has replaced the world's, how badly his tools and his
  // legs answer him (docs/plans/outskirts-losing-himself.md).
  function outskirtsLosing(py = player.y) {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return 0;
    const from = OUTSKIRT_STRETCH_START + OUTSKIRT_STRETCH_METRES * 2;
    const roadLosingAt = y => clamp01((outskirtsAlong(y) - from) / (OUTSKIRT_ROAD_END - from));
    const onsetY = landscapeOrigin().y + SOURCE_HORIZON.from + 50 / CELL;
    // Once the late-road depletion has been lived, the old tape boundary
    // cannot restore the torch, breath, steps or recorder to a clean state.
    if (horizonUnravelling.active || py <= landscapeOrigin().y + SOURCE_HORIZON.from) {
      return roadLosingAt(onsetY) * sourceUnravellingFrame(horizonUnravelling).bodyResidue;
    }
    return inOutskirtsView() ? roadLosingAt(py) : 0;
  }
  // Somebody the torch finds, for a moment, who is not there. Main places and clears it.
  let torchPhantom = null;
  function setTorchPhantom(next = null) {
    torchPhantom = next && Number.isFinite(next.x) && Number.isFinite(next.z) ? { x: next.x, z: next.z, yaw: Number(next.yaw) || 0 } : null;
    return !!torchPhantom;
  }
  function phantomInstances() {
    if (!torchPhantom || !inOutskirtsView()) return [];
    return [{
      id: 'outskirts-torch-phantom', mesh: 'ambient_awning_figure',
      matrix: sourceMatrix({ x: torchPhantom.x, y: outskirtsHeight(), z: torchPhantom.z, yaw: torchPhantom.yaw }),
      zone: ZONE.sourceSpace, structural: false, noReflection: true, noShadow: true, sourceStructure: 'outskirts',
    }];
  }

  let streetWorld = {}, streetReducedMotion = false, streetBusDoorAt = null;
  let recordedCharacterPresentation = null;
  function recordedOutskirtsPresentation() {
    return state.phase === CHUNK_SURF_PHASE.HORIZON ? recordedCharacterPresentation?.locomotion : null;
  }
  const streetActionAt = new Map();
  let characterCheckpointClock = streetExperience.characterFrame().clock;
  let characterCheckpointPass = streetExperience.characterFrame().locomotion?.pass ?? null;
  function setOutskirtsWorldState(value = {}) { streetWorld = { ...value }; }
  function streetAnchor(piece, lx = 0, lz = 0) {
    const c = Math.cos(piece.yaw), s = Math.sin(piece.yaw);
    return { x: piece.x + lx * c + lz * s, z: piece.z - lx * s + lz * c };
  }
  function foldCharacterFrame(reducedMotion = false) {
    const fold = streetExperience.characterFrame().fold;
    // Reduced motion retains the impossible endpoint without sustained writhing.
    const held = reducedMotion && fold.elapsed >= OUTSKIRT_FOLD_ENCOUNTER.forceStart;
    return { version: fold.version, seed: fold.seed, phase: fold.phase,
      clip: held || fold.elapsed <= OUTSKIRT_FOLD_ENCOUNTER.foldDuration ? 'fold' : 'writhe',
      time: held ? OUTSKIRT_FOLD_ENCOUNTER.foldDuration : fold.elapsed <= OUTSKIRT_FOLD_ENCOUNTER.foldDuration ? fold.elapsed : fold.elapsed - OUTSKIRT_FOLD_ENCOUNTER.foldDuration,
      loop: !held && fold.elapsed > OUTSKIRT_FOLD_ENCOUNTER.foldDuration,
      force: smoothstep(OUTSKIRT_FOLD_ENCOUNTER.forceStart, OUTSKIRT_FOLD_ENCOUNTER.forceStart + OUTSKIRT_FOLD_ENCOUNTER.forceDuration, fold.elapsed),
      contacts: { palm: [...OUTSKIRT_FOLD_ENCOUNTER.assetPalm], seat: [...OUTSKIRT_FOLD_ENCOUNTER.assetSeat],
        soles: OUTSKIRT_FOLD_ENCOUNTER.assetSoles.map(p => [...p]) } };
  }
  function outskirtsCharacterFrame() { return inOutskirtsView() ? streetExperience.characterFrame() : null; }
  function applyOutskirtsCharacterFrame(value) {
    // Recorded presentation is read-only: no cues, checkpoint, or history append.
    const applied = streetExperience.applyCharacterFrame(value);
    if (applied) recordedCharacterPresentation = streetExperience.characterFrame();
    return applied;
  }
  function tickOutskirtsCharacters(dt, { viewYaw = 0, pitch = 0, reducedMotion = false, suspended = false, moving, speed } = {}) {
    // A resumed live simulation takes its own position back. Suspended replay
    // ticks never replace the recorded operator with the observer's position.
    if (!suspended && dt > 0) recordedCharacterPresentation = null;
    if (!inOutskirtsView()) return null;
    const eye = outskirtsEye(), along = outskirtsAlong(), pass = outskirtsPassAt(), axisX = (landscapeOrigin().x + .5) * CELL;
    const lodge = outskirtPieces().find(p => p.stretch === OUTSKIRT_FOLD_ENCOUNTER.pass && p.key === 'booth');
    const guard = outskirtPieces().find(p => p.stretch === OUTSKIRT_FOLD_ENCOUNTER.pass && p.key === OUTSKIRT_FOLD_ENCOUNTER.guardKey);
    const at = guard ? streetAnchor(guard, ...OUTSKIRT_FOLD_ENCOUNTER.trigger) : {};
    const inFront = guard && -(eye.x - guard.x) * Math.sin(guard.yaw) - (eye.z - guard.z) * Math.cos(guard.yaw) > .20;
    const near = !!guard && inFront && pass === OUTSKIRT_FOLD_ENCOUNTER.pass
      && Math.hypot(eye.x - at.x, eye.z - at.z) < OUTSKIRT_FOLD_ENCOUNTER.reach;
    const across = eye.x - axisX, pavement = Math.abs(across) >= 3.78 && Math.abs(across) <= 6.20 ? .12 : 0;
    const result = streetExperience.tickCharacters(dt, { pass, along, across, yaw: viewYaw, pitch, moving, speed,
      floorOffset: Math.max(pavement, outskirtsFloorOffset(player.x, player.y)), foldNear: near, foldPosition: at,
      seed: state.seed, record: pass >= 0 && along <= OUTSKIRT_ROAD_END, suspended });
    let structuralChange = false;
    if (result.transition && result.frame.fold.phase !== 'armed') {
      structuralChange = streetExperience.action('r6:hatch-impact', 'hatch-impact', at);
      if (structuralChange) streetActionAt.set('r6:hatch-impact', result.frame.clock);
    }
    const passCheckpoint = !suspended && dt > 0 && pass >= 0 && along <= OUTSKIRT_ROAD_END && pass !== characterCheckpointPass;
    if (passCheckpoint) characterCheckpointPass = pass;
    const foldActive = ['force', 'pain'].includes(result.frame.fold.phase);
    const checkpoint = !suspended && dt > 0 && foldActive && lodge && Math.hypot(eye.x - lodge.x, eye.z - lodge.z) < 18
      && result.frame.clock - characterCheckpointClock >= 2;
    if (result.transition || checkpoint || passCheckpoint) {
      characterCheckpointClock = result.frame.clock;
      setState(state, { immediate: true, recordCausal: passCheckpoint || structuralChange });
    }
    streetReducedMotion = reducedMotion;
    return result.frame;
  }
  function outskirtsPerformAction({ action, pass = outskirtsPassAt() } = {}) {
    if (!inOutskirtsView() || pass !== outskirtsPassAt()) return { handled: false };
    const key = { knock: 'booth', phone: 'booth', sign: 'booth-ledger', post: 'postbox', ticket: 'bus-woman' }[action];
    const piece = outskirtPieces().find(p => p.stretch === pass && (action === 'ticket' ? p.inspect === 'woman' : p.key === key));
    if (!piece) return { handled: false };
    const at = streetAnchor(piece, ...(piece.interact || [0, 0]));
    const eye = outskirtsEye();
    if (Math.hypot(eye.x - at.x, eye.z - at.z) > 2.6 || !outskirtsSightClear(eye, { ...piece, ...at })) return { handled: false };
    const cue = { knock: 'glass-knock', phone: 'phone-ring', sign: 'pen', post: 'post-letter', ticket: 'ticket' }[action];
    const id = `r${pass}:${action}`;
    const handled = streetExperience.action(id, cue, at);
    if (handled) streetActionAt.set(id, edgeDoorClock());
    return { handled };
  }
  function outskirtsStreetFrame({ time = edgeDoorClock(), viewYaw = 0, reducedMotion = false } = {}) {
    if (inStreetRemnantView() && horizonUnravelling.active) {
      const eye = outskirtsEye(), decay = sourceUnravellingFrame(horizonUnravelling);
      outskirtPieces();
      const anchors = [outskirtCache.remnants[1], outskirtCache.remnants[2]];
      return { beds: anchors.filter(streetPieceVisible).map(piece => ({
        id: `${piece.id}:hum`, kind: 'lodge', x: piece.x, z: piece.z,
        distance: Math.hypot(piece.x - eye.x, piece.z - eye.z),
        gain: .10 * decay.street, pass: OUTSKIRT_STRETCH_COUNT - 1,
      })), events: [], encounter: null, along: outskirtsAlong(), pass: OUTSKIRT_STRETCH_COUNT - 1 };
    }
    if (!inOutskirtsView()) return { beds: [], events: [], encounter: null };
    streetReducedMotion = reducedMotion;
    const eye = outskirtsEye(), along = outskirtsAlong(), pass = outskirtsPassAt(), axisX = (landscapeOrigin().x + .5) * CELL;
    const local = along - OUTSKIRT_STRETCH_START - OUTSKIRT_BUS_ENCOUNTER.pass * OUTSKIRT_STRETCH_METRES;
    const woman = outskirtPieces().find(p => p.stretch === OUTSKIRT_BUS_ENCOUNTER.pass && p.key === OUTSKIRT_BUS_ENCOUNTER.womanKey);
    const bus = outskirtPieces().find(p => p.stretch === OUTSKIRT_BUS_ENCOUNTER.pass && p.key === OUTSKIRT_BUS_ENCOUNTER.busKey);
    if (woman && bus) {
      const bearing = Math.atan2(woman.x - eye.x, -(woman.z - eye.z)), away = Math.atan2(Math.sin(bearing - viewYaw), Math.cos(bearing - viewYaw));
      streetExperience.bus({ active: pass === OUTSKIRT_BUS_ENCOUNTER.pass,
        along: local, across: eye.x - axisX,
        visible: Math.abs(away) < .85 && Math.hypot(woman.x - eye.x, woman.z - eye.z) < 20 && outskirtsSightClear(eye, woman),
        near: Math.hypot(eye.x - axisX - (OUTSKIRT_BUS_ENCOUNTER.laneMinAcross + OUTSKIRT_BUS_ENCOUNTER.laneMaxAcross) / 2, local - OUTSKIRT_BUS_ENCOUNTER.along) < 2.25,
        crossed: local >= OUTSKIRT_BUS_ENCOUNTER.crossedAlong, position: { x: woman.x, z: woman.z } });
      if (streetExperience.busStage() >= 2 && streetBusDoorAt == null) streetBusDoorAt = time;
    }
    // The seventh lodge's hatch moves at reaching distance, after the guard has
    // been learned. It does not spend its event while the player watches afar.
    const lodge = outskirtPieces().find(p => p.stretch === 6 && p.key === 'booth');
    if (lodge && pass === 6) {
      const at = streetAnchor(lodge, -.45, -1.32);
      if (Math.hypot(eye.x - at.x, eye.z - at.z) < 1.65) {
        const id = 'r6:hatch-impact';
        if (streetExperience.action(id, 'hatch-impact', at)) streetActionAt.set(id, time);
      }
    }
    const losing = outskirtsLosing(), nearest = new Map();
    for (const p of outskirtPieces()) {
      const kind = p.key === 'bus' ? 'bus' : p.key === 'booth' ? 'lodge' : p.key === 'car' ? 'car' : null;
      if (!kind || p.unfinished) continue;
      const distance = Math.hypot(p.x - eye.x, p.z - eye.z);
      if (distance > 28 || nearest.get(kind)?.distance <= distance) continue;
      nearest.set(kind, { id: p.id, kind, x: p.x, z: p.z, distance, gain: Math.max(0, 1 - losing * 1.2) * (kind === 'lodge' ? .65 : .45), pass: p.stretch });
    }
    return { beds: [...nearest.values()], events: streetExperience.events(),
      encounter: { id: 'bus', stage: streetExperience.busStage(), pass: OUTSKIRT_BUS_ENCOUNTER.pass }, along, pass };
  }
  function busDoorAngle(piece, time = edgeDoorClock()) {
    if (piece.stretch !== OUTSKIRT_BUS_ENCOUNTER.pass) return 1.3;
    if (streetExperience.busStage() < 2) return 0;
    return streetReducedMotion ? 1.3 : 1.3 * smoothstep(0, .65, streetBusDoorAt == null ? 1 : time - streetBusDoorAt);
  }
  function streetDetailInstances(px, py, { time = edgeDoorClock(), reducedMotion = false } = {}, renderedParents = []) {
    const eye = outskirtsEye(px, py), height = outskirtsHeight(), out = [];
    const parentMatrices = new Map(renderedParents.map((instance) => [instance.id, instance.matrix]));
    const part = (piece, id, mesh, lx, ly, lz, { yaw = 0, scaleY = 1, emissive, parentMatrix } = {}) => {
      const at = streetAnchor(piece, lx, lz);
      const matrix = parentMatrix
        ? mul(parentMatrix, sourceMatrix({ x: lx, y: ly, z: lz, yaw, scaleY }))
        : sourceMatrix({ ...at, y: height + ly, yaw: piece.yaw + yaw, scaleY });
      out.push({ id: `${piece.id}:${id}`, mesh, matrix,
        zone: ZONE.sourceSpace, structural: true, sourceStructure: 'outskirts', ...(emissive ? { emissive } : {}) });
    };
    for (const p of outskirtPieces()) {
      if (!streetPieceVisible(p) || p.unfinished || Math.hypot(p.x - eye.x, p.z - eye.z) > 65) continue;
      if (p.key === 'bus' && p.mesh === 'outskirts_bus') {
        part(p, 'door', 'outskirts_bus_door', -1.245, .5, -3.7, { yaw: -busDoorAngle(p, time) });
      }
      if (p.key === 'booth') {
        if (p.stretch < 12) {
          const knocked = streetActionAt.get(`r${p.stretch}:knock`), pulse = knocked == null ? 0 : Math.max(0, 1 - (time - knocked) / 2);
          part(p, 'steam', 'outskirts_mug_steam', .42 + pulse * .04, 1.629, -.78, { scaleY: .9 + .1 * Math.sin((reducedMotion ? 0 : time * .7) + p.stretch) });
        }
      }
      if (p.key === 'van') {
        part(p, 'step', 'outskirts_van_step', 0, 0, 0);
        // Both real leaves belong to every van, not only the opening scene.
        part(p, 'door-l', 'yard_van_door_l', -1.1, .64, 2.34, { yaw: -1.72 });
        part(p, 'door-r', 'yard_van_door_r', 1.1, .64, 2.34, { yaw: Math.PI + 1.72 });
        if (!streetWorld.letterFound && p.stretch >= 6) part(p, 'letter', 'outskirts_letter', .25, 1.12, 1.5);
        if (streetWorld.letterPosted && p.stretch > Number(streetWorld.letterPostedAt || 0) + 1) part(p, 'returned-letter', 'outskirts_letter', .1, 1.13, .8, { yaw: .2 });
        if (streetWorld.ticketAsked && !streetWorld.ticketFound && p.stretch >= 8) part(p, 'ticket', 'outskirts_ticket', -.5, 1.33, 1.5);
      }
      if (/^bus-woman/.test(p.key) && streetWorld.ticketReturned && parentMatrices.has(p.id)) {
        // Carry the return half on the shared model's right glove. The actual
        // rendered parent includes aboard height, unseen turns and the small
        // close-encounter step, so neither duplicates nor turning lose it.
        part(p, 'return-half', 'outskirts_ticket', .28, .98, -.12, { yaw: .4, parentMatrix: parentMatrices.get(p.id) });
      }
      if (p.key === 'bin' && Math.floor(p.stretch / 5) === 1 && streetWorld.ticketAsked && !streetWorld.ticketFound) part(p, 'return-half', 'outskirts_ticket', 0, .95, 0);
    }
    return out;
  }

  // THE WET ROAD: what the renderer needs to mirror the scene in the puddles. The
  // road holds more water further down it; the pool under the last light is always there.
  function outskirtsReflection() {
    const presentation = recordedOutskirtsPresentation();
    if (!inOutskirtsView() && !presentation) return null;
    const along = presentation?.along ?? outskirtsAlong();
    const light = outskirtPieces().find((piece) => piece.faulty);
    const wear = Math.max(0, Math.min(1, (along - OUTSKIRT_STRETCH_START) / (OUTSKIRT_ROAD_END - OUTSKIRT_STRETCH_START)));
    return {
      active: true, groundY: outskirtsHeight() + 0.02,
      puddle: light ? [light.x + Math.cos(light.yaw) * 1.6, light.z - Math.sin(light.yaw) * 1.6, 3.4] : [0, 0, 0],
      wet: 0.35 + wear * 0.55,
    };
  }
  // THE DOUBLE. Him, a pass ahead, on his line and looking where he looks, seen
  // only in the wet: a reflection-only instance, drawn by the mirrored pass and
  // nowhere else. Within a pass of the last light it has already got there, and
  // stands in the pool under it facing away, until he is standing where it stood.
  function doubleInstances(px, py, { viewYaw = null } = {}) {
    const presentation = recordedOutskirtsPresentation();
    if ((!inOutskirtsView() && !presentation) || lastLightHold || lastLightOut) return [];
    const along = presentation?.along ?? outskirtsAlong(py);
    if (along < OUTSKIRT_STRETCH_START + OUTSKIRT_STRETCH_METRES) return [];
    const o = landscapeOrigin();
    const axisX = (o.x + 0.5) * CELL, planeZ = (o.y + edgeDoorPlaneY()) * CELL - roadStartMetres();
    const pass = presentation?.pass ?? outskirtsPassAt(py), localAlong = along - OUTSKIRT_STRETCH_START - pass * OUTSKIRT_STRETCH_METRES;
    const recorded = streetExperience.echo(pass, localAlong, OUTSKIRT_STRETCH_METRES, OUTSKIRT_STRETCH_START);
    if (!recorded && along < OUTSKIRT_LAST_MARK.along - OUTSKIRT_STRETCH_METRES) return [];
    const ahead = Math.min(OUTSKIRT_LAST_MARK.along, recorded?.along ?? along + OUTSKIRT_STRETCH_METRES);
    const eye = outskirtsEye(px, py);
    return [-.22, 0, .22].map((offset, index) => {
      const pose = offset === 0 ? recorded : streetExperience.echo(pass, localAlong, OUTSKIRT_STRETCH_METRES, OUTSKIRT_STRETCH_START, offset);
      const converged = ahead >= OUTSKIRT_LAST_MARK.along || pose?.along >= OUTSKIRT_LAST_MARK.along;
      const body = pose?.body || recorded?.body || { heading: 0, headYaw: 0, pitch: 0, gaitTime: 0, walkWeight: 0, clip: 'idle', clipTime: 0, floorOffset: 0, leftContact: 1, rightContact: 1 };
      const bodyYaw = converged ? 0 : body.heading;
      const head = (amount) => {
        const h = body.headYaw * amount * .5, p = -body.pitch * amount * .5;
        return [Math.cos(h) * Math.sin(p), Math.sin(h) * Math.cos(p), -Math.sin(h) * Math.sin(p), Math.cos(h) * Math.cos(p)];
      };
      const walkWeight = converged ? 0 : body.walkWeight, resting = body.clip === 'turn' ? 'turn' : 'idle';
      return {
        id: index === 1 ? 'outskirts-double' : `outskirts-double-${index === 0 ? 'before' : 'after'}`, mesh: 'outskirts_overprint_body',
        matrix: sourceMatrix({ x: converged ? axisX + OUTSKIRT_LAST_MARK.across : axisX + (pose?.across ?? recorded?.across ?? 0),
          y: outskirtsHeight() + (converged ? 0 : body.floorOffset), z: planeZ - (converged ? OUTSKIRT_LAST_MARK.along : pose?.along ?? ahead), yaw: bodyYaw }),
        character: { version: 1, clip: converged ? 'idle' : body.clip, time: converged ? 0 : body.clip === 'walk' ? body.gaitTime : body.clipTime,
          loop: converged || body.clip !== 'turn', recordedClock: pose?.recordedClock ?? recorded?.recordedClock ?? 0,
          clips: [{ name: 'walk', time: body.gaitTime, weight: walkWeight, loop: true }, { name: resting, time: converged ? 0 : body.clipTime, weight: 1 - walkWeight, loop: resting === 'idle' }],
          joints: converged ? {} : { neck: { rotation: head(.35) }, head: { rotation: head(.65) } },
          contacts: { left: converged ? 1 : body.leftContact, right: converged ? 1 : body.rightContact } },
        zone: ZONE.sourceSpace, structural: false, reflectionOnly: true, noShadow: true, sourceStructure: 'outskirts',
      };
    }).filter(instance => Math.hypot(instance.matrix[12] - eye.x, instance.matrix[14] - eye.z) <= 190);
  }

  // The twelve edges of a piece's box, as raw timber.
  function unfinishedFrame(piece, matrix) {
    const b = PROP_BOUNDS[piece.mesh];
    if (!b) return [];
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, t = 0.14;
    const beams = [];
    for (const y of [y0, y1]) for (const z of [z0, z1]) beams.push([cx, y, z, x1 - x0, t, t]);
    for (const x of [x0, x1]) for (const z of [z0, z1]) beams.push([x, cy, z, t, y1 - y0, t]);
    for (const x of [x0, x1]) for (const y of [y0, y1]) beams.push([x, y, cz, t, t, z1 - z0]);
    return beams.map(([bx, by, bz, sx, sy, sz], i) => ({
      id: `${piece.id}:frame-${i}`, mesh: 'set_beam',
      matrix: mul(matrix, mul(translate(bx, by, bz), scale(sx, sy, sz))),
      zone: ZONE.sourceSpace, structural: true, sourceStructure: 'outskirts',
    }));
  }

  // THE PHONE BOX (src/game/payphone.js), and anything main needs to place a
  // sound at: pieces by key in the first stretch, in world metres.
  function outskirtsPiece(key) {
    const piece = outskirtPieces().find((entry) => entry.id === key);
    return piece ? { id: piece.id, x: piece.x, z: piece.z, yaw: piece.yaw } : null;
  }
  // THINGS ON THE ROAD TO LOOK AT. Anything the layout gives an `inspect` key,
  // near enough and not vanished. What he makes of it lives in the studio
  // document source-space.outskirts, and main picks the node.
  function outskirtInspectFocus() {
    if (!inOutskirtsView()) return [];
    const eye = outskirtsEye();
    // A bus is nine metres long and the lodges stand eight metres off the road:
    // measured from its middle, a fixed radius meant standing on the road was
    // too far to look at either. Each piece reaches as far as its own footprint
    // does, and about six metres more — across the road, not across the field.
    const reachM = (piece) => {
      const b = PROP_BOUNDS[piece.mesh];
      return b ? Math.hypot(Math.max(Math.abs(b.min[0]), Math.abs(b.max[0])), Math.max(Math.abs(b.min[2]), Math.abs(b.max[2]))) : 1;
    };
    const anchor = piece => {
      const [lx, lz] = piece.interact || [0, 0], c = Math.cos(piece.yaw), s = Math.sin(piece.yaw);
      return { x: piece.x + lx * c + lz * s, z: piece.z - lx * s + lz * c };
    };
    return outskirtPieces()
      .filter((piece) => piece.inspect && streetPieceVisible(piece) && !outskirtUnseen.get(piece.id)?.gone
        // A small thing inside a bigger one (the bag in the van) has to be leant in to.
        && Math.hypot(anchor(piece).x - eye.x, anchor(piece).z - eye.z) <= (Number.isFinite(piece.closeReach) ? piece.closeReach : Math.min(3, reachM(piece) + 1))
        && outskirtsSightClear(eye, { ...anchor(piece), id: piece.id, stretch: piece.stretch, key: piece.key }))
      .map((piece) => ({ kind: 'outskirt-piece', id: piece.id, inspect: piece.inspect, stretch: piece.stretch, x: anchor(piece).x / CELL - 0.5, y: anchor(piece).z / CELL - 0.5,
        // Every lamp can be looked at, so a lamp never outbids the thing beside it.
        focusPriority: Number.isFinite(piece.focusPriority) ? piece.focusPriority : piece.lamp ? 7 : 8,
        focusRadius: Number.isFinite(piece.closeReach) ? piece.closeReach / CELL : Math.min(3, reachM(piece) + 1) / CELL }));
  }

  // HER PAGE, EVERYWHERE. From the late passes it is no longer one page on the
  // road but a flurry of them round him, every one with her number on it. Main
  // decides how bad it is (0 to 1); stepping onto the tape is the only way out.
  let outskirtsFlurry = 0;
  function setOutskirtsFlurry(level) { outskirtsFlurry = Math.max(0, Math.min(1, Number(level) || 0)); return outskirtsFlurry; }
  function flurryInstances(px, py, { reducedMotion = false } = {}) {
    if (outskirtsFlurry <= 0.01 || !inOutskirtsView()) return [];
    const eye = outskirtsEye(px, py), time = phoneBoxClock();
    const count = Math.round(8 + outskirtsFlurry * 34);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const a = rand(state.seed, i, 1201), b = rand(state.seed, i, 1203), c = rand(state.seed, i, 1207);
      const turn = reducedMotion ? 0.04 : (0.35 + a * 0.9) * (c < 0.5 ? 1 : -1);
      const angle = b * Math.PI * 2 + time * turn;
      const radius = 0.9 + c * 5.5 + (reducedMotion ? 0 : Math.sin(time * 0.4 + i) * 0.6);
      const spin = reducedMotion ? a * 6 : time * (1.4 + b * 2.2) + i;
      const rise = reducedMotion ? a * 2.2 : (a * 2.4 + time * (0.15 + c * 0.3)) % 2.6;
      out.push({
        id: `outskirts-flurry-${i}`, mesh: 'loose_note',
        matrix: sourceMatrix({ x: eye.x + Math.cos(angle) * radius, y: outskirtsHeight() + 0.25 + rise, z: eye.z + Math.sin(angle) * radius, pitch: Math.sin(spin * 0.7) * 1.1, yaw: spin, roll: Math.sin(spin * 1.3) * 0.9 }),
        zone: ZONE.sourceSpace, sourceStructure: 'outskirts',
      });
    }
    return out;
  }
  // A page of the flurry is always close enough to read.
  function flurryFocus() {
    // A page out of the air is what there is to look at only when nothing else
    // on the road is in reach: it never takes the van, the bin or the box from him.
    if (outskirtsFlurry <= 0.2 || !inOutskirtsView() || outskirtInspectFocus().length) return [];
    const eye = outskirtsEye();
    return [{ kind: 'outskirt-piece', id: 'outskirts-flurry', inspect: 'page-flurry', stretch: outskirtsPassAt(), x: eye.x / CELL - 0.5, y: eye.z / CELL - 1.5, focusPriority: 6, focusRadius: 4 }];
  }

  function phoneBoxFocus() {
    if (!inOutskirtsView()) return [];
    const box = phoneBoxPiece();
    if (!box) return [];
    return [{ kind: 'payphone', id: box.id, pass: box.stretch, x: box.x / CELL - 0.5, y: box.z / CELL - 0.5, focusPriority: 11, focusRadius: 7 }];
  }

  // THE BOX ITSELF: solid on every side, with a door that swings, and a man in
  // it only when main has put him there (openPayphone) — until the handset goes
  // back, the box is the whole world he can walk in.
  const PHONE_BOX_HALF_CELLS = 1;
  let phoneBoxInside = false, phoneBoxDoorOpen = false, phoneBoxDoorMovedAt = null;
  // THE HANDSET: on its hook; in his hand while he is in the box (not drawn); or
  // left hanging off the lip of the shelf on its cord, swinging, when he went to
  // answer his own phone up the road. Only the box he used is ever not on the hook.
  let phoneBoxHandset = { mode: 'hook', boxId: null, since: 0 };
  function setPhoneBoxHandset(mode = 'hook') {
    const next = ['hook', 'lifted', 'hanging'].includes(mode) ? mode : 'hook';
    const box = phoneBoxPiece();
    phoneBoxHandset = { mode: next, boxId: next === 'hook' ? null : box?.id || phoneBoxHandset.boxId, since: phoneBoxClock() };
    return phoneBoxHandset.mode;
  }
  // How bright a box's lamp is: dimmer the more worn the pass, and on a pass that
  // has broken, a tube that keeps catching.
  function phoneBoxLampStrength(box, now = phoneBoxClock()) {
    const k = 0.62 * (1 - (Number(box.wear) || 0) * 0.5);
    if (!box.broken) return k;
    return Math.sin(now * 17 + box.stretch) * Math.sin(now * 5.3 + box.stretch * 2) > 0.55 ? k * 0.25 : k;
  }
  const phoneBoxClock = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;
  // Every pass has its box. The one that answers is the nearest — and while he is
  // standing in one, that one, however the road around it is measured.
  let phoneBoxHeld = null;
  function phoneBoxPiece() {
    if (!inOutskirtsView()) return null;
    const boxes = outskirtPieces().filter((entry) => entry.payphone);
    if (phoneBoxInside && phoneBoxHeld) return boxes.find((entry) => entry.id === phoneBoxHeld) || null;
    const eye = outskirtsEye();
    let best = null, bestD = Infinity;
    for (const box of boxes) { const d = Math.hypot(box.x - eye.x, box.z - eye.z); if (d < bestD) { best = box; bestD = d; } }
    return best;
  }
  // Which pass of the scene he is standing in (-1 on the still ground), and the
  // cell a pass starts at: where the loop pass puts him back.
  function outskirtsPassAt(py = player.y) {
    const along = outskirtsAlong(py) - OUTSKIRT_STRETCH_START;
    if (along < 0) return -1;
    return Math.min(OUTSKIRT_STRETCH_COUNT - 1, Math.floor(along / OUTSKIRT_STRETCH_METRES));
  }
  function outskirtsPassStart(k) {
    const along = OUTSKIRT_STRETCH_START + Math.max(0, k) * OUTSKIRT_STRETCH_METRES + 0.8;
    return { x: landscapeOrigin().x, y: ((landscapeOrigin().y + edgeDoorPlaneY()) * CELL - roadStartMetres() - along) / CELL - 0.5 };
  }
  // Box-local metres to world: local +x is (cos yaw, -sin yaw), local +z (sin yaw, cos yaw).
  function phoneBoxLocal(box, lx, lz) {
    const c = Math.cos(box.yaw), sn = Math.sin(box.yaw);
    return { x: box.x + lx * c + lz * sn, z: box.z - lx * sn + lz * c };
  }
  function phoneBoxDoorFraction(now = phoneBoxClock()) {
    if (phoneBoxDoorMovedAt == null) return phoneBoxDoorOpen ? 1 : 0;
    const t = Math.max(0, now - phoneBoxDoorMovedAt);
    return phoneBoxDoorOpen ? smoothstep(0, 0.45, t) : 1 - smoothstep(0, 0.6, t);
  }
  function setPhoneBoxDoor(open) {
    const next = !!open;
    if (next === phoneBoxDoorOpen) return false;
    phoneBoxDoorOpen = next; phoneBoxDoorMovedAt = phoneBoxClock();
    return true;
  }
  function setPhoneBoxInside(inside) {
    if (inside) phoneBoxHeld = phoneBoxPiece()?.id || null;
    phoneBoxInside = !!inside;
    if (!inside) phoneBoxHeld = null;
  }
  // Where to stand in it, facing the set on the back wall (local -z), and where
  // to stand back out on the kerb, facing the road.
  function phoneBoxPose() {
    const box = phoneBoxPiece();
    if (!box) return null;
    const inside = phoneBoxLocal(box, 0, 0.08), outside = phoneBoxLocal(box, 0, 1.3);
    const toCell = (point) => ({ x: point.x / CELL - 0.5, y: point.z / CELL - 0.5 });
    const setX = -Math.sin(box.yaw), setZ = -Math.cos(box.yaw);
    return {
      id: box.id, pass: box.stretch, inside: toCell(inside), outside: toCell(outside), insideWorld: inside, outsideWorld: outside,
      faceSet: Math.atan2(setX, -setZ), faceRoad: Math.atan2(-setX, setZ),
      door: phoneBoxDoorFraction(), open: phoneBoxDoorOpen, occupied: phoneBoxInside,
    };
  }
  function phoneBoxRefuses(fromX, fromY, toX, toY) {
    const box = phoneBoxPiece();
    if (!box) return false;
    const bx = box.x / CELL - 0.5, by = box.z / CELL - 0.5;
    const within = (x, y) => Math.abs(x - bx) <= PHONE_BOX_HALF_CELLS && Math.abs(y - by) <= PHONE_BOX_HALF_CELLS;
    if (phoneBoxInside) return !within(toX, toY);
    return within(toX, toY) && !within(fromX, fromY);
  }
  function phoneBoxInstances(px, py, { reducedMotion = false } = {}) {
    if (!inOutskirtsView()) return [];
    const live = phoneBoxPiece(), eye = outskirtsEye(px, py), height = outskirtsHeight(), now = phoneBoxClock();
    const part = (id, mesh, matrix, extra = {}) => ({ id, mesh, matrix, zone: ZONE.sourceSpace, structural: true, sourceStructure: 'outskirts', ...extra });
    const out = [];
    for (const box of outskirtPieces()) {
      if (!box.payphone || Math.hypot(box.x - eye.x, box.z - eye.z) > 190) continue;
      // Lit from inside: the roof lamp and TELEPHONE in the crown glow, the red
      // iron round them does not, and the lamp's pool (outskirtLampPools) lights
      // the set, the handset and the kerb through the open glazing.
      const warm = { emissive: [1, 0.8, 0.56, phoneBoxLampStrength(box, now) * 3] };
      out.push(part(`${box.id}:apparatus`, 'city_phone_box_apparatus', sourceMatrix({ x: box.x, y: height + (Number(box.y) || 0), z: box.z, yaw: box.yaw })));
      out.push(part(`${box.id}:glow`, 'city_phone_box_glow', sourceMatrix({ x: box.x, y: height + (Number(box.y) || 0), z: box.z, yaw: box.yaw }), warm));
      // Every box on the road has its door; only the live one's ever swings.
      const hinge = phoneBoxLocal(box, -0.4, 0.47);
      // A late pass leaves every box's door standing a little open.
      const swing = Math.max(box.id === live?.id ? phoneBoxDoorFraction() * 1.75 : 0, box.doorAjar ? 0.55 : 0);
      const door = sourceMatrix({ x: hinge.x, y: height, z: hinge.z, yaw: box.yaw + swing });
      out.push(part(`${box.id}:door`, 'city_phone_box_door', door));
      const mine = phoneBoxHandset.boxId === box.id;
      if (mine && phoneBoxHandset.mode === 'lifted') continue;
      // His own, left hanging; or, late on, every box's, found that way.
      if ((mine && phoneBoxHandset.mode === 'hanging') || (!mine && box.handsetHanging)) {
        // Off the lip of the shelf on its armoured cord, upside down, swinging
        // from being let go and then only just moving.
        const t = mine ? now - phoneBoxHandset.since : now + box.stretch * 3.1, decay = mine ? Math.exp(-t / 7) : 0;
        const roll = reducedMotion ? 0.08 : 0.55 * decay * Math.sin(t * 2.7) + 0.05 * Math.sin(t * 1.1);
        const pitch = reducedMotion ? 0.04 : 0.18 * decay * Math.sin(t * 2.7 + 1.2) + 0.03 * Math.sin(t * 0.9 + 0.4);
        const lip = phoneBoxLocal(box, -0.2, -0.12);
        const pivot = { x: lip.x, y: height + 0.99, z: lip.z, yaw: box.yaw };
        const hanging = sourceMatrix({ ...pivot, pitch, roll });
        out.push(
          part(`${box.id}:cord-drape`, 'city_phone_box_cord_drape', sourceMatrix(pivot)),
          part(`${box.id}:cord`, 'city_phone_box_cord', hanging),
          part(`${box.id}:handset`, 'city_phone_box_handset', mul(hanging, mul(translate(0, -0.46, 0), rotZ(Math.PI)))),
        );
        continue;
      }
      const hook = phoneBoxLocal(box, -0.235, -0.385);
      out.push(part(`${box.id}:handset`, 'city_phone_box_handset', sourceMatrix({ x: hook.x, y: height + 1.46, z: hook.z, yaw: box.yaw })));
    }
    return out;
  }

  // THE RAIN IS THE ROAD'S: dry on the still ground past the doors, in over the
  // road's first twenty metres, out over its last thirty before the tape. One
  // amount, so what is heard and what is drawn cannot disagree.
  function outskirtsWeather() {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return { rain: 0 };
    const local = player.y - landscapeOrigin().y;
    if (local > SOURCE_PRE_TAPE.from || local <= SOURCE_HORIZON.from) return { rain: 0 };
    const along = outskirtsAlong(), roadM = (SOURCE_PRE_TAPE.roadLength || 0) * CELL;
    return { rain: smoothstep(0, 20, along) * (1 - smoothstep(roadM - 30, roadM, along)) };
  }

  // SOLID THINGS ON THE ROAD. The body walked through the bus, the lodge and the
  // lamp columns, because nothing out here had ever been given a footprint. Each
  // piece's is its prop pack box (PROP_BOUNDS), turned by its yaw, plus a little
  // for the body. A lamp column is its post, not its arm; gate piers are their two
  // piers, not the gap the road runs through. What the road is laid in —
  // OUTSKIRT_WALKABLE_MESHES — is walked on, and the phone box keeps its own rule.
  const OUTSKIRT_BODY_MARGIN_M = 0.25;
  const OUTSKIRT_POST_RADIUS_M = 0.3;
  const OUTSKIRT_BUCKET_M = 20;
  function outskirtSolids() {
    outskirtPieces();
    if (outskirtCache.solids) return outskirtCache.solids;
    const walkable = new Set(OUTSKIRT_WALKABLE_MESHES);
    const buckets = new Map();
    const file = (solid, z, reach) => {
      for (let k = Math.floor((z - reach) / OUTSKIRT_BUCKET_M); k <= Math.floor((z + reach) / OUTSKIRT_BUCKET_M); k += 1) {
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(solid);
      }
    };
    for (const piece of outskirtCache.pieces) {
      if (walkable.has(piece.mesh) || piece.payphone) continue;
      const b = PROP_BOUNDS[piece.mesh];
      if (!b && !Array.isArray(piece.collision)) continue;
      const c = Math.cos(piece.yaw), s = Math.sin(piece.yaw);
      const at = (lx, lz) => ({ x: piece.x + lx * c + lz * s, z: piece.z - lx * s + lz * c });
      if (piece.lamp) {
        file({ piece, post: at(0, 0), radius: OUTSKIRT_POST_RADIUS_M }, piece.z, 1);
        continue;
      }
      if (/gate_piers/.test(piece.mesh)) {
        const wide = b.max[0] - b.min[0] >= b.max[2] - b.min[2];
        const ends = wide
          ? [at(b.min[0] + 0.4, (b.min[2] + b.max[2]) / 2), at(b.max[0] - 0.4, (b.min[2] + b.max[2]) / 2)]
          : [at((b.min[0] + b.max[0]) / 2, b.min[2] + 0.4), at((b.min[0] + b.max[0]) / 2, b.max[2] - 0.4)];
        for (const post of ends) file({ piece, post, radius: 0.45 }, post.z, 1);
        continue;
      }
      const boxes = outskirtsCollisionBoxes(piece, b);
      for (const box of boxes) {
        const reach = Math.hypot(Math.max(Math.abs(box.minX), Math.abs(box.maxX)), Math.max(Math.abs(box.minZ), Math.abs(box.maxZ))) + 1;
        file({ piece, ...box, cos: c, sin: s }, piece.z, reach);
      }
    }
    outskirtCache.solids = buckets;
    return buckets;
  }
  function outskirtPieceRefuses(toX, toY) {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return false;
    const local = toY - landscapeOrigin().y;
    if (local > SOURCE_PRE_TAPE.from || local <= SOURCE_PRE_TAPE.to) return false;
    const wx = (toX + 0.5) * CELL, wz = (toY + 0.5) * CELL, m = OUTSKIRT_BODY_MARGIN_M;
    const along = outskirtsAlong(toY), axis = (landscapeOrigin().x + .5) * CELL;
    // These are the rendered street's boundary walls, not the old void's edge.
    if (along >= 0 && along < OUTSKIRT_STRETCH_START + (OUTSKIRT_CORRIDOR.boundaryThroughPass + 1) * OUTSKIRT_STRETCH_METRES
      && Math.abs(wx - axis) > OUTSKIRT_CORRIDOR.halfWidth - m) return true;
    for (const piece of outskirtPieces()) {
      if (!streetPieceVisible(piece) || piece.key !== 'bus' || piece.unfinished || piece.mesh !== 'outskirts_bus' || Math.abs(piece.z - wz) > 7) continue;
      const hinge = streetAnchor(piece, -1.245, -3.7), yaw = piece.yaw - busDoorAngle(piece), c = Math.cos(yaw), s = Math.sin(yaw);
      const dx = wx - hinge.x, dz = wz - hinge.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < .04 + m && lz > -m && lz < 1.1 + m) return true;
    }
    for (const solid of outskirtSolids().get(Math.floor(wz / OUTSKIRT_BUCKET_M)) || []) {
      if (!streetPieceVisible(solid.piece) || outskirtUnseen.get(solid.piece.id)?.gone) continue;
      if (solid.post) {
        if (Math.hypot(wx - solid.post.x, wz - solid.post.z) < solid.radius + m) return true;
        continue;
      }
      const dx = wx - solid.piece.x, dz = wz - solid.piece.z;
      const lx = dx * solid.cos - dz * solid.sin, lz = dx * solid.sin + dz * solid.cos;
      if (lx >= solid.minX - m && lx <= solid.maxX + m && lz >= solid.minZ - m && lz <= solid.maxZ + m) return true;
    }
    return false;
  }

  function outskirtsFloorOffset(x, y) {
    if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return 0;
    const wx = (x + .5) * CELL, wz = (y + .5) * CELL;
    outskirtPieces();
    for (const p of outskirtCache.vehicles.get(Math.floor(wz / OUTSKIRT_BUCKET_M)) || []) {
      if (!streetPieceVisible(p)) continue;
      const dx = wx - p.x, dz = wz - p.z;
      const lx = dx * p.cos - dz * p.sin, lz = dx * p.sin + dz * p.cos;
      if (p.key === 'bus' && lz > -3.70 && lz < -2.60 && lx > -1.30 && lx < -.475) return lx < -.865 ? .25 : .40;
      if (p.key === 'bus' && Math.abs(lx) < 1.12 && Math.abs(lz) < 4.5) return .5;
      if (p.key === 'van' && Math.abs(lx) < .94 && lz >= 2.35 && lz < 2.95) return .335;
      if (p.key === 'van' && Math.abs(lx) < .94 && lz > -1.6 && lz < 2.35) return .67;
    }
    return 0;
  }

  function outskirtsSightClear(eye, target) {
    const solids = outskirtSolids(), used = new Set();
    const related = p => p.stretch === target.stretch && (
      p.id === target.id || (/^booth/.test(p.key) && /^booth|ledger|page-ledger/.test(target.key))
      || (p.key === 'bus' && /^bus-woman/.test(target.key))
      || (p.key === 'van' && /^van|bag|page-dash/.test(target.key)));
    for (let k = Math.floor(Math.min(eye.z, target.z) / OUTSKIRT_BUCKET_M); k <= Math.floor(Math.max(eye.z, target.z) / OUTSKIRT_BUCKET_M); k++) {
      for (const s of solids.get(k) || []) {
        if (used.has(s) || s.post || related(s.piece) || outskirtUnseen.get(s.piece.id)?.gone) continue;
        used.add(s);
        if (!/boundary|funnel|booth|shelter|bus$|van$|car$/.test(s.piece.key)) continue;
        const point = p => { const dx = p.x - s.piece.x, dz = p.z - s.piece.z; return [dx * s.cos - dz * s.sin, dx * s.sin + dz * s.cos]; };
        const a = point(eye), b = point(target), d = [b[0] - a[0], b[1] - a[1]];
        let lo = .025, hi = .97;
        for (const [axis, min, max] of [[0, s.minX, s.maxX], [1, s.minZ, s.maxZ]]) {
          if (Math.abs(d[axis]) < .00001) { if (a[axis] < min || a[axis] > max) { lo = 1; hi = 0; } }
          else { const t0 = (min - a[axis]) / d[axis], t1 = (max - a[axis]) / d[axis]; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
        }
        if (lo < hi) return false;
      }
    }
    return true;
  }

  // The pools the lit lamps throw on the road, shaped for the void pass's ground
  // light (the door-leak slots): nearest three.
  function outskirtLampPools(px = player.x, py = player.y) {
    if (!inStreetRemnantView()) return [];
    const eye = outskirtsEye(px, py), height = outskirtsHeight();
    const lamps = streetRenderPieces()
      .filter((piece) => streetPieceVisible(piece) && piece.lamp && !piece.dark && !outskirtLampsOff.has(piece.id))
      .map((piece) => {
        // The column's arm reaches out over the road.
        const x = piece.x + Math.cos(piece.yaw) * 1.6, z = piece.z - Math.sin(piece.yaw) * 1.6;
        return {
          id: piece.id, x, y: height, z, forward: [0, 1], width: piece.faulty ? 4.5 : 6.5, colour: [1, 0.68, 0.36],
          strength: piece.faulty ? 1.1 * faultyLightLevel() : 0.9,
          open: true, pool: true, variant: -1, key: false, lightAt: [x, height + 6.9, z],
          distanceM: Math.hypot(x - eye.x, z - eye.z),
        };
      })
      .filter((pool) => pool.strength > 0.02);
    // The phone boxes' own lamps: a small warm pool on the kerb round each.
    const boxes = outskirtPieces().filter((piece) => streetPieceVisible(piece) && piece.payphone).map((box) => ({
      id: `${box.id}:lamp`, x: box.x, y: height, z: box.z, forward: [0, 1], width: 3, colour: [1, 0.8, 0.56],
      strength: Math.min(1, phoneBoxLampStrength(box) * 1.1), open: true, pool: true, variant: -1, key: false,
      lightAt: [box.x, height + 2.1, box.z], distanceM: Math.hypot(box.x - eye.x, box.z - eye.z),
    }));
    return [...lamps, ...boxes]
      .filter((pool) => pool.distanceM <= 45)
      .sort((p, q) => p.distanceM - q.distanceM)
      .slice(0, 3);
  }

  // ── DOOR FIELDS ───────────────────────────────────────────────────────────
  //
  // Each road out of the tape ends in a corridor of doors: the tower's between
  // the ring and the belfry, the chapel's past the nothing at the end of the
  // tape. Rows of trees line it, forest stands behind them, and it rains. Every
  // door in it starts CLOSED. Most open when tried — the leaf swings back and
  // the opening shows somewhere that is not here (renderSourcePortals); walking
  // through an open one only erases it. Some are LOCKED and never open. At the
  // far end stands the road's own door, the building's real one: walk through it
  // and Source space is over.
  //
  // THE TOWER DOOR IS LOCKED until two particular doors in its field have been
  // opened and walked through. Which two is seeded, and nothing marks them.
  var doorPlantingCache, doorOpenedAt, pendingDoorOpen, doorAttempts;
  var crossingArms = 0;

  function doorFieldRoute() {
    if (state.phase === CHUNK_SURF_PHASE.BELLS) return 'tower';
    if (state.phase === CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS) return 'chapel';
    return null;
  }

  // Route doors stand half a cell across so the eye walks through their middle.
  function doorFieldBand(route) {
    if (route === 'tower') return {
      from: SOURCE_BELLS.doors.from, to: SOURCE_BELLS.doors.to,
      height: SOURCE_TIER_BY_ID.bells?.height ?? 15.2,
      door: { x: 0.5, y: SOURCE_BELLS.room.threshold + ROUTE_DOOR_PLANE_OFFSET },
    };
    return {
      from: SOURCE_CHAPEL_OUTSKIRTS.doorsFrom, to: SOURCE_CHAPEL_OUTSKIRTS.doorsTo,
      height: SOURCE_TIER_BY_ID.horizon?.height ?? 15.2,
      door: { x: 0.5, y: SOURCE_CHAPEL_OUTSKIRTS.doorAt + ROUTE_DOOR_PLANE_OFFSET },
    };
  }

  // The walkable corridor: from a little before the first door to the hedge
  // across the end, a metre behind the road's own door.
  function doorCorridor(route) {
    const band = doorFieldBand(route);
    return {
      from: band.from + 12, to: band.door.y - 6, endY: band.door.y - 2,
      half: DOOR_CORRIDOR_HALF_WIDTH, height: band.height,
    };
  }

  function doorOpening(matrix, opening) {
    const m = matrix, half = opening.width / 2;
    const at = (x, y, z = 0, w = 1) => [
      m[0] * x + m[4] * y + m[8] * z + m[12] * w,
      m[1] * x + m[5] * y + m[9] * z + m[13] * w,
      m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    ];
    const corners = [at(-half, 0), at(half, 0), at(half, opening.height), at(-half, opening.height)];
    const n = at(0, 0, 1, 0), length = Math.hypot(n[0], n[1], n[2]) || 1;
    return {
      corners,
      normal: n.map((value) => value / length),
      // The threshold in the body's cells — what a step crosses, and what a
      // closed door refuses. The eye stands half a cell on from its cell (r3dFrame),
      // so a door the eye walks through the middle of is half a cell back here.
      threshold: [
        { x: corners[0][0] / CELL - 0.5, y: corners[0][2] / CELL - 0.5 },
        { x: corners[1][0] / CELL - 0.5, y: corners[1][2] / CELL - 0.5 },
      ],
    };
  }

  function makeDoorPiece({ id, i, assembly, localX, localY, yaw, height, door }) {
    const o = landscapeOrigin();
    const matrix = sourceMatrix({ x: (o.x + localX) * CELL, y: height, z: (o.y + localY) * CELL, yaw });
    return { id, i, assembly, mesh: assembly.frameMesh, localX, localY, matrix, door, opening: doorOpening(matrix, assembly.opening) };
  }

  function doorFieldPieces(route = doorFieldRoute()) {
    if (!route) return [];
    const o = landscapeOrigin();
    const key = `${route}:${state.seed}:${o.x}:${o.y}`;
    if (doorFieldCache?.key === key) return doorFieldCache.pieces;
    const band = doorFieldBand(route), span = band.from - band.to, salt = route === 'tower' ? 811 : 853;
    const pieces = [];
    for (let i = 0; i < ROUTE_DOOR_FIELD_COUNT; i += 1) {
      const archetype = DOOR_FIELD_ARCHETYPES[Math.floor(rand(state.seed, i, salt) * DOOR_FIELD_ARCHETYPES.length)];
      pieces.push(makeDoorPiece({
        id: `source-${route}-door-${i}`, i,
        assembly: doorAssembly(archetype, { hinge: rand(state.seed, i, salt + 6) < 0.5 ? 'left' : 'right', activeLeaves: 'all' }),
        // Inside the corridor, a door to a row, so no door stands in another's doorway.
        localX: (rand(state.seed, i, salt + 4) - 0.5) * 2 * (DOOR_CORRIDOR_HALF_WIDTH - 5),
        localY: band.from - (i + 0.5 + (rand(state.seed, i, salt + 2) - 0.5) * 0.5) * span / ROUTE_DOOR_FIELD_COUNT,
        // Facing the way you came, never quite square to it.
        yaw: (rand(state.seed, i, salt + 8) - 0.5) * 0.6,
        height: band.height,
        door: {
          shut: rand(state.seed, i, salt + 10) < OUTSKIRT_SHUT_SHARE,
          // Each road opens onto its own worlds: the chapel's six, the tower's five.
          variant: (route === 'tower' ? TOWER_WORLD_SET : CHAPEL_WORLD_SET)[Math.floor(rand(state.seed, i, salt + 12) * (route === 'tower' ? TOWER_WORLD_SET : CHAPEL_WORLD_SET).length)],
          seed: rand(state.seed, i, salt + 14),
          key: false,
          // THE TOWER ROAD IS FURTHER GONE. Some of its crossings put him back
          // somewhere else in the field, facing the wrong way; some of its worlds
          // can no longer be kept up, and tear or go out while he is standing in
          // them. (docs/plans/door-field-station.md, stage T2.)
          wrong: route === 'tower' && rand(state.seed, i, salt + 16) < 0.3,
          fails: route === 'tower' && rand(state.seed, i, salt + 18) < 0.3,
        },
      }));
    }
    const byChance = (list) => list
      .map((piece) => ({ piece, order: rand(state.seed, piece.i, 877) }))
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.piece);
    if (route === 'tower') {
      const openable = byChance(pieces.filter((piece) => !piece.door.shut));
      // A key has to be a door that opens. If the seed locked too many, unlock some.
      for (const piece of byChance(pieces.filter((piece) => piece.door.shut))) {
        if (openable.length >= TOWER_KEY_DOORS) break;
        piece.door.shut = false;
        openable.push(piece);
      }
      openable.slice(0, TOWER_KEY_DOORS).forEach((piece) => { piece.door.key = true; });
      // And one of the rest shuts behind him once he is through it: the way out
      // is a second door standing in that world (docs/plans/door-field-station.md).
      // Prefer one that returns him properly; if the seed left none, any will do.
      const shutsBehind = openable.find((piece) => !piece.door.key && !piece.door.wrong)
        || openable.find((piece) => !piece.door.key)
        || pieces.find((piece) => !piece.door.key && !piece.door.route);
      if (shutsBehind) shutsBehind.door.lockIn = true;
    }
    // EVERY WORLD ON THIS ROAD HAS A DOOR THAT OPENS.
    //
    // The world and the bar are dealt per door, so a seed could leave a world
    // with nothing but barred doors, or with no door at all — and a barred door
    // never opens in play. On the chapel road that quietly broke the station's
    // errand: it wants one thing out of each of the five worlds beside the
    // whiteout, and the way home only opens while he is carrying all five
    // (setStationHomeOpen). Measured over forty seeds, all six worlds opened in
    // five of them, so the way home was unreachable in seven runs out of eight
    // and nothing anywhere said why.
    //
    // So after the deal, every world on the road is given a door that opens:
    // one of its own barred doors unbarred, or — if it drew no door at all — a
    // barred door's world changed to it, never one whose own world would be
    // left with nothing. Seeded, so a night is still the same night.
    const worldSet = route === 'tower' ? TOWER_WORLD_SET : CHAPEL_WORLD_SET;
    const opensOnto = (variant) => pieces.filter((piece) => piece.door.variant === variant && !piece.door.shut);
    for (const variant of worldSet) {
      if (opensOnto(variant).length) continue;
      // Its own barred doors first: unbar one and nothing else moves.
      const own = byChance(pieces.filter((piece) => piece.door.variant === variant && piece.door.shut && !piece.door.key));
      // Then a barred door from a world that still opens without it.
      const barred = byChance(pieces.filter((piece) => piece.door.shut && !piece.door.key
        && opensOnto(piece.door.variant).length > 0));
      // And last, when nothing is barred any more, a spare open door from a
      // world that has more than one. Sixteen doors over six worlds always
      // leave somebody with a spare, so no world is ever left sealed.
      const spare = byChance(pieces.filter((piece) => !piece.door.shut && !piece.door.key
        && opensOnto(piece.door.variant).length > 1));
      const piece = own[0] || barred[0] || spare[0];
      if (!piece) continue;
      piece.door.variant = variant;
      piece.door.shut = false;
    }
    // And something is still barred, or the corridor is only a corridor.
    if (!pieces.some((piece) => piece.door.shut)) {
      const spare = byChance(pieces.filter((piece) => !piece.door.key && opensOnto(piece.door.variant).length > 1));
      if (spare[0]) spare[0].door.shut = true;
    }
    if (route === 'tower') {
      // Deal the invitation last, after coverage and the final barred door.
      // Earlier seeds could select a barred door, then consume the only way in.
      const invitation = pieces.find((piece) => piece.door.lockIn)
        || byChance(pieces.filter((piece) => !piece.door.key && !piece.door.shut))[0]
        || pieces.find((piece) => !piece.door.key);
      for (const piece of pieces) piece.door.lockIn = false;
      if (invitation) {
        invitation.door = { ...invitation.door, personal: true, shut: false,
          wrong: false, fails: false, lockIn: false, variant: 6 };
      }
    }
    const own = ROUTE_DOOR_ASSEMBLIES[route];
    pieces.push(makeDoorPiece({
      id: `source-${route}-route-door`, i: -1, assembly: doorAssembly(own.archetype, own),
      localX: band.door.x, localY: band.door.y, yaw: 0, height: band.height,
      door: { route, shut: false, key: false },
    }));
    doorFieldCache = { key, pieces };
    return pieces;
  }

  // What grows along the corridor (doorFieldPlanting), and a bed of weeds at the
  // foot of some of the doors, the way growth takes against anything standing.
  function doorPlantingPieces(route = doorFieldRoute()) {
    if (!route) return [];
    const o = landscapeOrigin(), key = `${route}:${state.seed}:${o.x}:${o.y}`;
    if (doorPlantingCache?.key === key) return doorPlantingCache.pieces;
    const c = doorCorridor(route), salt = route === 'tower' ? 1291 : 1341;
    const random = (a, b, s) => rand(state.seed, a * 1009 + b, salt + s);
    const pieces = doorFieldPlanting(c, random).map((plant) => ({
      id: `source-${route}-${plant.id}`, mesh: plant.mesh, localX: plant.x, localY: plant.y,
      matrix: sourceMatrix({
        x: (o.x + plant.x) * CELL, y: c.height, z: (o.y + plant.y) * CELL,
        yaw: plant.yaw, scaleX: plant.scale, scaleY: plant.scale, scaleZ: plant.scale,
      }),
    }));
    for (const piece of doorFieldPieces(route)) {
      if (piece.door.route || rand(state.seed, piece.i, salt + 40) < 0.45) continue;
      const side = rand(state.seed, piece.i, salt + 41) < 0.5 ? -1 : 1;
      pieces.push({
        id: `source-${route}-door-bed-${piece.i}`,
        mesh: rand(state.seed, piece.i, salt + 42) < 0.5 ? 'vegetation_weed_cluster' : 'vegetation_nettle_cluster',
        localX: piece.localX, localY: piece.localY,
        matrix: mul(piece.matrix, sourceMatrix({
          x: side * (piece.assembly.opening.width / 2 + 0.55), z: -0.35,
          yaw: rand(state.seed, piece.i, salt + 43) * Math.PI * 2, scaleX: 0.7, scaleY: 0.7, scaleZ: 0.7,
        })),
      });
    }
    if (route === 'chapel') {
      const tufts = ['vegetation_grass_edge', 'vegetation_weed_cluster', 'vegetation_nettle_cluster', 'vegetation_leaf_scatter'];
      for (let y = c.from - 2, n = 0; y > c.to + 2; y -= 3.4, n += 1) {
        for (const side of [-1, 1]) {
          if (rand(state.seed, n * 2 + (side > 0 ? 1 : 0), salt + 60) < 0.35) continue;
          const x = side * (7.5 + rand(state.seed, n, salt + 61 + side) * 3.5);
          const scale = 0.72 + rand(state.seed, n, salt + 63 + side) * 0.34;
          pieces.push({
            id: `source-${route}-tuft-${n}-${side}`, mesh: tufts[Math.floor(rand(state.seed, n, salt + 65 + side) * tufts.length) % tufts.length],
            localX: x, localY: y,
            matrix: sourceMatrix({ x: (o.x + x) * CELL, y: c.height, z: (o.y + y) * CELL, yaw: rand(state.seed, n, salt + 67 + side) * Math.PI * 2, scaleX: scale, scaleY: scale, scaleZ: scale }),
          });
        }
      }
    }
    doorPlantingCache = { key, pieces };
    return pieces;
  }

  const doorWasErased = (piece) => !piece.door.route && (state.routeDoorsErased || []).includes(piece.id);
  const homeDoorEligible = (piece) => !piece.door.route && !piece.door.shut && piece.door.variant === 5
    && stationHomeReady() && !stationHomeResolved;
  const whiteoutReawakened = (piece) => doorWasErased(piece) && homeDoorEligible(piece)
    && stationRealm?.entryDoorId !== piece.id
    && (!doorTakenAt.has(piece.id) || crossingClock() >= doorTakenAt.get(piece.id) + TAKE_BACK_SECONDS + OUTLINE_SECONDS);
  const doorErased = (piece) => doorWasErased(piece) && !whiteoutReawakened(piece)
    && !(piece.door.personal && !towerPersonal.completed);
  const doorOpened = (piece) => !piece.door.route && (state.routeDoorsOpened || []).includes(piece.id);

  function towerDoorUnlocked() {
    const keys = doorFieldPieces('tower').filter((piece) => piece.door.key);
    return keys.length > 0 && keys.every((piece) => doorErased(piece));
  }

  // Try a door. Locked ones refuse; the rest swing open and stay open.
  function openDoorFieldDoor(id) {
    const piece = doorFieldPieces().find((entry) => entry.id === id);
    if (!piece) return { handled: false, opened: false };
    if (piece.door.route === 'tower' && !towerDoorUnlocked()) {
      return { handled: true, opened: false, event: 'outskirt-door-shut', line: TOWER_DOOR_LOCKED_LINE };
    }
    if (piece.door.route) return { handled: false, opened: true };
    if (piece.door.shut) {
      // Tried — and some of them try back. See lockedDoorAnswer().
      doorAttempts ||= new Map();
      const attempts = (doorAttempts.get(id) || 0) + 1;
      doorAttempts.set(id, attempts);
      const [x, , z] = doorOrigin(piece);
      return {
        handled: true, opened: false, event: 'outskirt-door-shut',
        line: OUTSKIRT_SHUT_LINES[Math.max(0, piece.i) % OUTSKIRT_SHUT_LINES.length],
        answer: lockedDoorAnswer(piece.door.seed, attempts),
        position: { x, z },
      };
    }
    if (!doorOpened(piece)) {
      dispatch({ type: 'ROUTE_DOOR_OPENED', id }, { immediate: true });
      (pendingDoorOpen ||= new Set()).add(id);
    }
    return { handled: true, opened: true, event: 'outskirt-door-opened' };
  }

  // How far the leaves have swung: shut, swinging over the assembly's own
  // opening time, or open.
  function doorSwing(piece, time) {
    if (!doorOpened(piece)) return 0;
    doorOpenedAt ||= new Map();
    if (pendingDoorOpen?.has(piece.id)) { doorOpenedAt.set(piece.id, time); pendingDoorOpen.delete(piece.id); }
    const at = doorOpenedAt.get(piece.id);
    return at == null ? 1 : smoothstep(0, piece.assembly.openSeconds, time - at);
  }

  function doorFieldInstances(px, py, { time = 0, reducedMotion = false, now = crossingClock(), viewYaw = null } = {}) {
    const route = doorFieldRoute();
    if (!route) return [];
    const o = landscapeOrigin();
    const out = [];
    const near = (piece, metres) => Math.hypot((o.x + piece.localX - px) * CELL, (o.y + piece.localY - py) * CELL) <= metres;
    for (const piece of doorFieldPieces(route)) {
      if (!near(piece, 220)) continue;
      if (doorErased(piece)) { out.push(...doorTakenBackInstances(piece, now, { reducedMotion })); continue; }
      const assembly = piece.assembly;
      const part = (id, mesh, matrix) => out.push({ id, mesh, matrix, zone: ZONE.sourceSpace, structural: true, sourceStructure: 'door-field' });
      part(piece.id, assembly.frameMesh, piece.matrix);
      if (assembly.freeStandingHeadMesh) part(`${piece.id}:head`, assembly.freeStandingHeadMesh, piece.matrix);
      const fraction = piece.door.route
        ? (piece.door.route === 'tower' && !towerDoorUnlocked() ? 0 : 1)
        : doorSwing(piece, time);
      for (let leaf = 0; leaf < assembly.leafCount; leaf += 1) {
        part(`${piece.id}:leaf-${leaf + 1}`, assembly.leafMesh, mul(piece.matrix, doorLeafLocalMatrix(assembly, leaf, fraction)));
      }
      // Grounded, worn by use, and its world coming under it (docs/plans/door-field-station.md).
      out.push(...doorDressing(piece, time, { reducedMotion, fraction }));
    }
    out.push(...stationEdgeInstances(px, py, { viewYaw, time, reducedMotion, route }));
    if (route === 'chapel') out.push(...stationPathInstances(px, py));
    if (route === 'tower') out.push(...stationServiceInstances(px, py, { time, reducedMotion }));
    for (const extra of doorFieldExtras(route)) {
      if (!near(extra, 260)) continue;
      out.push(...extra.parts.map((entry) => ({ ...entry, zone: ZONE.sourceSpace, structural: true, noShadow: true, sourceStructure: 'door-field' })));
    }
    for (const plant of doorPlantingPieces(route)) {
      if (!near(plant, 220)) continue;
      out.push({ id: plant.id, mesh: plant.mesh, matrix: plant.matrix, zone: ZONE.sourceSpace, structural: true, sourceStructure: 'door-planting' });
    }
    return out;
  }

  // THE STATION'S DOORS, KEPT. Every door stands on a threshold slab worn hollow
  // and a stone plinth; its frame is worn by its own world (scorched, frosted,
  // damp, scoured, packed with sand); its handle is polished by hands that are not
  // his; and while it stands, its world comes under it. Separate ids ('dress:'),
  // so a door's own parts stay the assembly and nothing else.
  const DOOR_WEAR = Object.freeze({
    burning: 'door_wear_scorch', flood: 'door_wear_damp', inverted: 'door_wear_damp',
    'two-moons': 'door_wear_sand', 'glass-storm': 'door_wear_scour', whiteout: 'door_wear_frost',
  });
  function doorDressing(piece, time, { reducedMotion = false, fraction = 0 } = {}) {
    const out = [], M = piece.matrix, w = piece.assembly.opening.width, h = piece.assembly.opening.height;
    const t = reducedMotion ? 0 : time;
    const dress = (key, mesh, local, extra = {}) => out.push({
      id: `dress:${piece.id}:${key}`, mesh, matrix: mul(M, sourceMatrix(local)),
      zone: ZONE.sourceSpace, structural: true, noShadow: true, sourceStructure: 'door-field', ...extra,
    });
    dress('slab', 'door_threshold_slab', { scaleX: w + 0.5 });
    dress('plinth', 'door_plinth', { y: -0.1, scaleX: w + 0.9 });
    if (piece.door.route === 'chapel') {
      // The station's own door: stone jambs and arch, the relief of little doors in
      // the tympanum, strap hinges and ring handles, a step, and two lanterns lit.
      dress('carving', 'chapel_door_carving', {});
      dress('ironwork', 'chapel_door_ironwork', { z: -0.02 });
      dress('step', 'chapel_door_step', {});
      const flicker = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(time * 9.3) * Math.sin(time * 2.1);
      for (const side of [-1, 1]) dress(`lantern-${side}`, 'chapel_door_lantern', { x: side * 1.65, y: 2.35, z: 0.12 }, { emissive: [1, 0.72, 0.38, 2.2 * flicker] });
    }
    if (piece.door.route === 'tower') {
      const keys = doorFieldPieces('tower').filter((entry) => entry.door.key);
      for (let k = 0; k < 2; k += 1) dress(`lock-bolt-${k}`, 'tower_personal_lock_bolt',
        { x: keys[k] && doorErased(keys[k]) ? -.3 : 0, y: .92 + k * .34, z: .13 });
    }
    if (piece.door.route) return out;
    // Hinges on the frame's hinge side.
    const hingeSide = piece.assembly.hinge === 'left' ? -1 : 1;
    for (const y of [0.35, 1.2, 2.05]) dress(`hinge-${y}`, 'door_hinge_knuckle', { x: hingeSide * (w / 2 + 0.01), y, z: 0.07 });
    const world = ELSEWHERE_WORLDS[piece.door.variant]?.id;
    if (piece.door.personal) {
      dress('personal-snow', 'seep_drift', { y: .11, z: .4, scaleX: w });
      dress('personal-snow-trail', 'school_snow_drift', { y: .1, z: .9, scaleX: .38, scaleY: .32, scaleZ: .3 });
    }
    const wear = DOOR_WEAR[world];
    if (wear === 'door_wear_sand') dress('wear', wear, { y: 0.1, z: 0.12, scaleX: w });
    else if (wear) {
      const reach = world === 'whiteout' ? h * 0.8 : world === 'flood' ? h * 0.45 : h * 0.6;
      const y = world === 'inverted' ? h - reach : 0.1;
      for (const side of [-1, 1]) dress(`wear-${side}`, wear, { x: side * (w / 2 + 0.04), y, z: 0.07, scaleY: reach });
    }
    if (fraction < 0.05) {
      const handle = piece.assembly.hinge === 'left' ? 1 : -1;
      dress('polish', 'door_wear_polish', { x: handle * (w / 2 - 0.12), y: 1.05, z: 0.08 });
    }
    // What comes under it. Moving, unless motion is reduced.
    const seed = Number(piece.door.seed) || 0;
    const h01 = (k) => { const x = Math.sin((seed * 977 + k * 31.7) * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const glow = (colour, a) => ({ emissive: [...colour, a] });
    if (world === 'burning') {
      for (let k = 0; k < 6; k += 1) {
        const run = (t * (0.1 + h01(k) * 0.12) + h01(k + 7)) % 1;
        dress(`seep-${k}`, 'seep_ember', { x: (h01(k + 3) - 0.5) * w, y: 0.12 + Math.abs(Math.sin(t * 3 + k)) * 0.02, z: 0.2 + run * 0.6, yaw: k }, glow([1, 0.42, 0.1], 1.4 * (1 - run)));
      }
    } else if (world === 'flood') {
      dress('seep', 'seep_water', { y: 0.1, z: 0.35, scaleX: w, scaleZ: 0.35 + 0.2 * Math.sin(t * 0.45 + seed * 6) });
    } else if (world === 'inverted') {
      for (let k = 0; k < 7; k += 1) {
        const rise = (t * (0.18 + h01(k) * 0.2) + h01(k + 5) * 2.4) % 2.4;
        dress(`seep-${k}`, 'seep_fleck', { x: (h01(k + 2) - 0.5) * w, y: 0.12 + rise, z: 0.15 + h01(k + 9) * 0.3 }, glow([0.8, 0.85, 0.95], 0.3));
      }
    } else if (world === 'two-moons') {
      dress('seep', 'seep_sand', { y: 0.1, z: 0.3, scaleX: w * 0.9 });
    } else if (world === 'glass-storm') {
      for (let k = 0; k < 9; k += 1) {
        const glint = Math.max(0, Math.sin(t * (2 + h01(k) * 4) + k * 2.1)) ** 8;
        dress(`seep-${k}`, 'seep_fleck', { x: (h01(k + 1) - 0.5) * w * 1.1, y: 0.11, z: 0.1 + h01(k + 4) * 0.6 }, glow([0.7, 0.78, 1], 0.2 + glint * 1.6));
      }
    } else if (world === 'whiteout') {
      dress('seep', 'seep_drift', { y: 0.1, z: 0.28, scaleX: w * 0.95 });
      for (let k = 0; k < 4; k += 1) {
        const fall = (t * (0.25 + h01(k) * 0.2) + h01(k + 3)) % 1;
        dress(`flake-${k}`, 'seep_fleck', { x: (h01(k + 6) - 0.5) * w, y: 0.2 + (1 - fall) * 0.6, z: 0.3 + fall * 0.4 }, glow([0.95, 0.97, 1], 0.25));
      }
    }
    return out;
  }

  // DOORS NOBODY CAN REACH. A few more doors in the field that are not the
  // assemblies it is built from: a house's front door, a child's bedroom door, a
  // wardrobe door, a station waiting room's, a vestry's — and the building's own
  // loading dock door and front doors, hung where they cannot be got to. Floating,
  // or sunk at a slant; openable, somewhere, but never from here.
  const DOOR_EXTRAS = Object.freeze([
    Object.freeze({ kind: 'front-door', mesh: 'extra_front_door', across: -8, along: 0.18, lift: 4.2, yaw: 0.35, roll: 0.05 }),
    Object.freeze({ kind: 'bedroom-door', mesh: 'extra_bedroom_door', across: 7.5, along: 0.34, lift: -1.05, yaw: -0.4, pitch: 0.18 }),
    Object.freeze({ kind: 'wardrobe-door', mesh: 'extra_wardrobe_door', across: -3, along: 0.5, lift: 3.4, yaw: 1.1, roll: 0.5 }),
    Object.freeze({ kind: 'waiting-room-door', mesh: 'extra_waiting_room_door', across: 17, along: 0.62, lift: 5.5, yaw: -0.2 }),
    Object.freeze({ kind: 'vestry-door', mesh: 'extra_vestry_door', across: -9.5, along: 0.76, lift: -0.8, yaw: 0.6, roll: -0.35 }),
    // Off to the side and up, over the hedge: hung over the walk it filled the whole view.
    Object.freeze({ kind: 'dock-door', archetype: DOOR_ARCHETYPE.BAY_GOODS_PAIR, across: 20, along: 0.86, lift: 5.2, yaw: -0.55 }),
    Object.freeze({ kind: 'front-main', archetype: DOOR_ARCHETYPE.PUBLIC_GLAZED_PAIR, across: -22, along: 0.45, lift: 2.5, yaw: 0.5 }),
  ]);
  // TAKEN BACK. Walked through, a door is not simply gone: its world pulls it in,
  // slowly enough to stand and watch, whether or not he does. The leaves go first,
  // then the head, then the frame, each in that world's own way; its outline hangs
  // in the world's light a moment; then there is only the slab, the plinth and what
  // the world left on them. A door erased in an earlier session is simply gone to
  // its scar. docs/plans/door-field-station.md, stage 2.
  const TAKE_BACK_SECONDS = 12, OUTLINE_SECONDS = 3;
  const DOOR_SCAR = Object.freeze({
    burning: 'door_scar_burn', flood: 'door_scar_tide', inverted: 'door_scar_hole',
    'two-moons': 'door_scar_sand', 'glass-storm': 'door_scar_glass', whiteout: 'door_scar_frost',
  });
  function doorTakeBack(piece, now = crossingClock()) {
    const start = doorTakenAt?.get(piece.id);
    if (start == null) return { phase: 'gone', progress: 1, outline: 0 };
    const t = now - start;
    if (t < 0) return { phase: 'waiting', progress: 0, outline: 0 };
    if (t < TAKE_BACK_SECONDS) return { phase: 'taking', progress: t / TAKE_BACK_SECONDS, outline: 0 };
    if (t < TAKE_BACK_SECONDS + OUTLINE_SECONDS) return { phase: 'outline', progress: 1, outline: 1 - (t - TAKE_BACK_SECONDS) / OUTLINE_SECONDS };
    return { phase: 'gone', progress: 1, outline: 0 };
  }
  function doorTakenBackInstances(piece, now, { reducedMotion = false } = {}) {
    const out = [], M = piece.matrix, assembly = piece.assembly, w = assembly.opening.width, h = assembly.opening.height;
    const worldDef = ELSEWHERE_WORLDS[piece.door.variant] || ELSEWHERE_WORLDS[0], world = worldDef.id, leak = worldDef.leak;
    const tb = doorTakeBack(piece, now);
    const add = (key, mesh, matrix, extra = {}) => out.push({
      id: `taking:${piece.id}:${key}`, mesh, matrix, zone: ZONE.sourceSpace, structural: true, noShadow: true, sourceStructure: 'door-field', ...extra,
    });
    // The platform stays, with the world's mark on it.
    add('slab', 'door_threshold_slab', mul(M, sourceMatrix({ scaleX: w + 0.5 })));
    add('plinth', 'door_plinth', mul(M, sourceMatrix({ y: -0.1, scaleX: w + 0.9 })));
    if (tb.phase === 'gone' || tb.progress > 0.55) add('scar', DOOR_SCAR[world] || 'door_scar_hole', mul(M, sourceMatrix({ scaleX: w + 0.2 })));
    if (tb.phase === 'waiting' || tb.phase === 'taking') {
      const seed = Number(piece.door.seed) || 0;
      const parts = [{ key: 'frame', mesh: assembly.frameMesh, local: null, start: 0.34 }];
      if (assembly.freeStandingHeadMesh) parts.push({ key: 'head', mesh: assembly.freeStandingHeadMesh, local: null, start: 0.18 });
      for (let leaf = 0; leaf < assembly.leafCount; leaf += 1) {
        parts.push({ key: `leaf-${leaf + 1}`, mesh: assembly.leafMesh, local: doorLeafLocalMatrix(assembly, leaf, 1), start: leaf * 0.06 });
      }
      for (const part of parts) {
        const q = Math.max(0, Math.min(1, (tb.progress - part.start) / 0.6));
        const e = q * q * (3 - 2 * q), wob = reducedMotion ? 0 : Math.sin(now * 7 + seed * 40 + part.start * 20);
        let fx = {}, glow = 0;
        // Nothing goes below the slab: the field has no ground under it to hide in.
        if (world === 'burning') { fx = { scaleY: Math.max(0.001, 1 - e), pitch: e * 0.25 * (part.key === 'frame' ? 0 : 1) }; glow = Math.min(1, q * 3) * (1 - e); }
        else if (world === 'flood') fx = { y: 0.1 * e, scaleY: Math.max(0.001, 1 - e), roll: wob * 0.02 * q };
        else if (world === 'inverted') fx = { y: e * e * 14, roll: e * 0.9, yaw: e * 0.4 };
        else if (world === 'two-moons') fx = { x: e * e * 3, scaleX: Math.max(0.001, 1 - e), scaleZ: Math.max(0.001, 1 - e) };
        else if (world === 'glass-storm') { fx = { x: wob * 0.04 * q, scaleX: Math.max(0.001, 1 - e), scaleY: Math.max(0.001, 1 - e * 0.9), yaw: e * 2.5 }; glow = Math.max(0, wob) * q * (1 - e); }
        else { fx = { x: -e * e * 5, z: e * 1.2, scaleY: Math.max(0.001, 1 - e * 0.7), roll: e * 0.3 }; glow = Math.min(1, q * 2) * (1 - e) * 0.6; }
        if (e >= 0.999) continue;
        const effect = sourceMatrix(fx);
        const matrix = mul(M, part.local ? mul(effect, part.local) : effect);
        add(part.key, part.mesh, matrix, glow > 0.01 ? { emissive: [...leak, 1.2 * glow] } : {});
      }
      // Flood: the water it goes under, rising over the slab and spreading.
      if (world === 'flood' && tb.phase === 'taking') add('water', 'seep_water', mul(M, sourceMatrix({ y: 0.1 + 0.03 * tb.progress, z: 0.1, scaleX: w + 0.4 * tb.progress, scaleZ: 0.4 + 0.9 * tb.progress })));
      // What the world throws off while it does it.
      for (let k = 0; k < 8 && tb.phase === 'taking'; k += 1) {
        const r = (tb.progress * (2 + k * 0.3) + k * 0.13) % 1;
        const across = ((k * 0.37) % 1 - 0.5) * w;
        const pos = world === 'inverted' ? { x: across, y: 0.2 + r * 5, z: 0.1 }
          : world === 'flood' ? { x: across, y: 0.11, z: 0.2 + r * 1.2 }
          : world === 'whiteout' || world === 'two-moons' ? { x: across - r * 3, y: 0.3 + r * 1.6, z: r * 0.8 }
          : { x: across, y: 0.2 + r * 2.2, z: 0.1 + r * 0.3 };
        add(`fleck-${k}`, world === 'burning' ? 'seep_ember' : 'seep_fleck', mul(M, sourceMatrix(pos)), { emissive: [...leak, 0.8 * (1 - r)] });
      }
    }
    if (tb.phase === 'outline') {
      // Its outline, in its world's light, where it stood.
      const t = 0.06, beams = [[-w / 2, h / 2, t, h], [w / 2, h / 2, t, h], [0, h, w + t, t]];
      beams.forEach(([bx, by, sx, sy], i) => add(`outline-${i}`, 'set_beam', mul(M, sourceMatrix({ x: bx, y: by, scaleX: sx, scaleY: sy, scaleZ: t })), { emissive: [...leak, 2 * tb.outline] }));
    }
    return out;
  }
  // What is left, looked at.
  function doorScarFocus(now = crossingClock()) {
    const route = doorFieldRoute();
    if (!route) return [];
    return doorFieldPieces(route).filter((piece) => doorErased(piece) && doorTakeBack(piece, now).progress > 0.55).map((piece) => {
      const [a, b] = piece.opening.threshold;
      return { kind: 'door-scar', id: piece.id, world: ELSEWHERE_WORLDS[piece.door.variant]?.id || null, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, focusPriority: 7, focusRadius: 4 };
    });
  }
  // THE OUTSKIRTS AT THE EDGES. Way off to either side of the chapel road, its
  // lamp line, a phone box and the building stand in the black, pressed against a
  // line they cannot cross. Every time he turns to look at a side it has come a
  // little nearer; never nearer than the line. They are drawn scaled down along
  // his line of sight (the prop pass cannot see past ninety metres), which
  // projects exactly as the real thing would from where he stands.
  const STATION_EDGE = Object.freeze({ far: 280, line: 140, step: 0.14, renderM: 38, lookCos: 0.72 });
  var stationEdgeState = { near: { '-1': 0, '1': 0 }, visible: { '-1': null, '1': null }, frame: null };
  function stationEdgeInstances(px, py, { viewYaw = null, time = 0, reducedMotion = false, route = 'chapel' } = {}) {
    const o = landscapeOrigin(), band = doorFieldBand(route);
    const eye = { x: (px + 0.5) * CELL, y: band.height + 1.65, z: (py + 0.5) * CELL };
    const st = stationEdgeState, out = [], sides = [];
    const fwd = Number.isFinite(Number(viewYaw)) ? [Math.sin(viewYaw), -Math.cos(viewYaw)] : null;
    for (const side of [-1, 1]) {
      const facing = fwd ? fwd[0] * side : 0;
      const visible = fwd ? facing > STATION_EDGE.lookCos : null;
      if (visible === true && st.visible[side] === false) st.near[side] = Math.min(1, st.near[side] + STATION_EDGE.step);
      if (visible != null) st.visible[side] = visible;
      const distanceM = STATION_EDGE.far - (STATION_EDGE.far - STATION_EDGE.line) * st.near[side];
      sides.push({ side, facing: Math.max(0, facing), near: st.near[side], distanceM });
      const place = (key, mesh, trueX, trueZ, extra = {}, yaw = 0, grow = 1) => {
        const dx = trueX - eye.x, dz = trueZ - eye.z, d = Math.hypot(dx, dz) || 1, k = Math.min(1, STATION_EDGE.renderM / d);
        const kk = k * grow;
        out.push({
          id: `edge:${side}:${key}`, mesh,
          matrix: sourceMatrix({ x: eye.x + dx * k, y: eye.y + (band.height - eye.y) * k, z: eye.z + dz * k, yaw, scaleX: kk, scaleY: kk, scaleZ: kk }),
          zone: ZONE.sourceSpace, structural: true, noShadow: true, noReflection: true, sourceStructure: 'station-edge', ...extra,
        });
      };
      const lineX = eye.x + side * distanceM;
      const spacing = 8.6 * 2, baseZ = Math.round(eye.z / spacing) * spacing;
      const flicker = (seed) => (reducedMotion ? 1 : (Math.sin(time * (3 + (seed % 7)) + seed) > 0.93 ? 0.2 : 1));
      if (route === 'tower' && side < 0) {
        // ST BRENDAN'S, off the tower road: the cathedral itself, its belfry lit,
        // standing in the black where there is no ground for it.
        const z = (o.y + band.from - 70) * CELL;
        // Three and a bit times the parish church it is modelled as: at this
        // distance anything smaller is a speck on the horizon.
        place('church', 'st_brendan_church', lineX, z, {}, Math.PI / 2, 3.4);
        // The belfry, lit, up where its louvres are.
        for (const j of [-1, 1]) {
          place(`belfry-${j}`, 'city_phone_box_glow', lineX + j * 7, z - 10, { emissive: [1, 0.82, 0.52, 3.4 * flicker(j + 4)] }, 0, 6);
        }
        place('belfry-glow', 'city_phone_box_glow', lineX, z - 6, { emissive: [1, 0.86, 0.62, 3.0 * flicker(9)] }, 0, 9);
      } else if (route === 'tower') {
        // THE CHAPEL ROAD, across the black: its door field and its lanterns, as
        // if from the platform opposite.
        for (let j = -6; j <= 6; j += 1) {
          const z = baseZ + j * spacing * 0.8, seed = Math.abs(Math.round(z / spacing) * 11 + 5);
          place(`far-door-${j}`, 'door_frame_pair', lineX + (seed % 7) - 3, z, {}, (seed % 5) * 0.3, 2.2);
          // Its lanterns are what carries across the black; the doors are shapes
          // between them.
          if (seed % 3 !== 0) place(`far-lantern-${j}`, 'city_phone_box_glow', lineX + (seed % 7) - 3, z + 1.5, { emissive: [1, 0.76, 0.44, 3.2 * flicker(seed)] }, 0, 4.5);
          place(`far-hedge-${j}`, 'yard_hedge_run', lineX + 9, z, {}, Math.PI / 2, 2.2);
        }
      } else {
        for (let j = -9; j <= 9; j += 1) {
          const z = baseZ + j * spacing, seed = Math.abs(Math.round(z / spacing) * 7 + side * 3);
          const lit = (seed % 5) !== 2;
          place(`lamp-${Math.round(z / spacing)}`, 'yard_lamp_column', lineX, z, lit ? { emissive: [1, 0.72, 0.42, 2.4 * flicker(seed)] } : {}, side > 0 ? 0 : Math.PI);
        }
        const boxZ = (o.y + (side < 0 ? SOURCE_CHAPEL_OUTSKIRTS.from - 90 : band.from - 40)) * CELL;
        place('phone-box', 'city_phone_box', lineX - side * 3, boxZ, {}, side > 0 ? Math.PI / 2 : -Math.PI / 2);
        place('phone-box-apparatus', 'city_phone_box_apparatus', lineX - side * 3, boxZ, {}, side > 0 ? Math.PI / 2 : -Math.PI / 2);
        place('phone-box-glow', 'city_phone_box_glow', lineX - side * 3, boxZ, { emissive: [1, 0.8, 0.56, 1.6] }, side > 0 ? Math.PI / 2 : -Math.PI / 2);
        if (side < 0) place('building', 'conservatory_west_elevation', lineX - 70, (o.y + band.to) * CELL, {}, Math.PI / 2);
      }
    }
    st.frame = { sides };
    return out;
  }
  function stationEdgeFrame() { return doorFieldRoute() ? stationEdgeState.frame : null; }
  // Looked at from the road: whichever of them is in front of him.
  function stationEdgeFocus(px = player.x, py = player.y) {
    const route = doorFieldRoute();
    if (!route || !stationEdgeState.frame) return [];
    return stationEdgeState.frame.sides.filter((entry) => entry.facing > STATION_EDGE.lookCos).map((entry) => ({
      kind: 'station-edge', id: `edge:${entry.side}`,
      edge: route === 'tower' ? (entry.side < 0 ? 'tower' : 'chapel-road') : (entry.side < 0 ? 'building' : 'lamps'),
      x: px + entry.side * (STATION_EDGE.renderM / CELL), y: py, focusPriority: 2, focusRadius: STATION_EDGE.renderM / CELL + 8,
    }));
  }
  // A stone path along the corridor, flags thinning out toward the hedges, and
  // more growing in at its edges.
  var stationPathCache;
  function stationPathInstances(px, py) {
    const o = landscapeOrigin(), c = doorCorridor('chapel'), band = doorFieldBand('chapel');
    const key = `${o.x}:${o.y}:${state.seed}`;
    if (stationPathCache?.key !== key) {
      const flags = [];
      for (let y = c.from - 1, row = 0; y > band.door.y + 3; y -= 2.3, row += 1) {
        for (let col = -3; col <= 3; col += 1) {
          const keep = rand(state.seed, row * 31 + col + 50, 1901);
          if (keep > 1 - Math.abs(col) / 4.2) continue;
          const x = col * 2.3 + (rand(state.seed, row * 31 + col, 1903) - 0.5) * 0.3;
          flags.push({ id: `station-flag-${row}-${col}`, localX: x, localY: y, yaw: (rand(state.seed, row * 31 + col, 1905) - 0.5) * 0.12 });
        }
      }
      stationPathCache = { key, flags };
    }
    return stationPathCache.flags
      .filter((flag) => Math.hypot((o.x + flag.localX - px) * CELL, (o.y + flag.localY - py) * CELL) <= 80)
      .map((flag) => ({
        id: flag.id, mesh: 'station_flag',
        matrix: sourceMatrix({ x: (o.x + flag.localX) * CELL, y: band.height, z: (o.y + flag.localY) * CELL, yaw: flag.yaw }),
        zone: ZONE.sourceSpace, structural: true, noShadow: true, sourceStructure: 'station-path',
      }));
  }
  // THE SERVICE SIDE (the tower road). Where the station keeps its doors: frames
  // and leaves stood against the hedges, tagged, some wrapped; doors being put
  // together in the field — a frame with no leaf, a leaf on trestles; a joiner's
  // bench with a leaf clamped and part planed and a lamp nobody put out; and the ledger
  // of every door, open on a lectern. All of it from the building's own kit.
  var stationServiceCache;
  function stationServicePieces() {
    const o = landscapeOrigin(), band = doorFieldBand('tower'), c = doorCorridor('tower');
    const key = `${o.x}:${o.y}:${state.seed}`;
    if (stationServiceCache?.key === key) return stationServiceCache.pieces;
    const pieces = [];
    const r = (i, salt) => rand(state.seed, i, 2201 + salt);
    const place = (id, kind, localX, localY, parts, look) => pieces.push({ id, kind, localX, localY, parts, look });
    const assemblyAt = (i) => doorAssembly(DOOR_FIELD_ARCHETYPES[Math.floor(r(i, 1) * DOOR_FIELD_ARCHETYPES.length) % DOOR_FIELD_ARCHETYPES.length], { activeLeaves: 'all' });
    // Stood against the hedges, facing in, leaning back.
    for (let i = 0, y = c.from - 6; y > c.to + 8; y -= 8 + r(i, 2) * 5, i += 1) {
      const side = i % 2 ? 1 : -1, x = side * (c.half - 1.6), yaw = side * Math.PI / 2 * -1;
      const assembly = assemblyAt(i), pick = r(i, 3), lean = 0.16 + r(i, 4) * 0.08;
      const base = { x: (o.x + x) * CELL, y: band.height, z: (o.y + y) * CELL, yaw, pitch: -lean };
      const parts = [];
      if (pick < 0.35) parts.push({ key: 'frame', mesh: assembly.frameMesh, local: base });
      else if (pick < 0.7) parts.push({ key: 'leaf', mesh: assembly.leafMesh, local: { ...base, x: base.x - side * 0.2 } });
      else parts.push({ key: 'wrapped', mesh: 'stored_door_wrapped', local: base });
      if (r(i, 5) < 0.7) parts.push({ key: 'tag', mesh: 'door_tag', local: { x: base.x - side * 0.25, y: band.height + 1.05, z: base.z + 0.3, yaw } });
      place(`service-stored-${i}`, 'stored', x, y, parts, pick < 0.35 ? 'stored-frame' : pick < 0.7 ? 'stored-leaf' : 'stored-wrapped');
    }
    // Being put together, out in the field.
    const fieldY = (t) => band.from - t * (band.from - band.to);
    {
      const assembly = assemblyAt(90), x = -9, y = fieldY(0.3);
      place('service-frame-alone', 'half-built', x, y, [{ key: 'frame', mesh: assembly.frameMesh, local: { x: (o.x + x) * CELL, y: band.height, z: (o.y + y) * CELL, yaw: 0.35 } }], 'half-frame');
    }
    {
      const assembly = assemblyAt(91), x = 9.5, y = fieldY(0.58);
      const at = { x: (o.x + x) * CELL, y: band.height, z: (o.y + y) * CELL, yaw: -0.2 };
      place('service-leaf-trestles', 'half-built', x, y, [
        { key: 'trestles', mesh: 'door_trestle', local: at },
        { key: 'leaf', mesh: assembly.leafMesh, local: { ...at, y: band.height + 0.77, pitch: -Math.PI / 2, x: at.x - 0.45, z: at.z + 1.1 } },
      ], 'half-trestles');
    }
    {
      const x = -9.5, y = fieldY(0.82);
      const at = { x: (o.x + x) * CELL, y: band.height, z: (o.y + y) * CELL, yaw: 0.25 };
      place('service-workbench', 'workbench', x, y, [
        { key: 'bench', mesh: 'station_workbench', local: at },
        { key: 'lamp', mesh: 'station_work_lamp', local: { ...at, x: at.x + 0.8, y: band.height + 0.9 }, lamp: true },
      ], 'workbench');
    }
    {
      const x = 7, y = c.from - 3;
      place('service-ledger', 'ledger', x, y, [{ key: 'lectern', mesh: 'door_ledger_lectern', local: { x: (o.x + x) * CELL, y: band.height, z: (o.y + y) * CELL, yaw: -Math.PI / 2 } }], 'ledger');
    }
    // Nothing stored where the bench or a door being put together stands.
    const fixed = pieces.filter((piece) => piece.kind !== 'stored');
    const clear = pieces.filter((piece) => piece.kind !== 'stored' || fixed.every((other) => Math.sign(other.localX) !== Math.sign(piece.localX) || Math.abs(other.localY - piece.localY) > 7));
    stationServiceCache = { key, pieces: clear };
    return clear;
  }
  function stationServiceInstances(px, py, { time = 0, reducedMotion = false } = {}) {
    const o = landscapeOrigin(), out = [];
    const flicker = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(time * 7.7) * Math.sin(time * 1.9);
    for (const piece of stationServicePieces()) {
      if (Math.hypot((o.x + piece.localX - px) * CELL, (o.y + piece.localY - py) * CELL) > 220) continue;
      for (const part of piece.parts) out.push({
        id: `${piece.id}:${part.key}`, mesh: part.mesh, matrix: sourceMatrix(part.local),
        zone: ZONE.sourceSpace, structural: true, noShadow: true, sourceStructure: 'station-service',
        ...(part.lamp ? { emissive: [1, 0.74, 0.4, 2 * flicker] } : {}),
      });
    }
    return out;
  }
  function stationServiceFocus() {
    if (doorFieldRoute() !== 'tower') return [];
    const o = landscapeOrigin();
    return stationServicePieces().map((piece) => ({
      kind: 'station-service', id: piece.id, look: piece.look, x: o.x + piece.localX, y: o.y + piece.localY,
      focusPriority: piece.kind === 'ledger' || piece.kind === 'workbench' ? 7 : 5, focusRadius: 4,
    }));
  }
  // The committed recordist circuit uses stage-local ground. Door traversal,
  // local pose and all receipts are saved together before main moves the view.
  var towerLandCache;
  function towerLandPlacement() { return towerPersonalPlacement(SOURCE_BELLS); }
  function towerLandLocal(x = player.x, y = player.y) {
    const o = landscapeOrigin(), land = towerLandPlacement();
    return { x: (x - o.x - land.across) * CELL, z: (y - o.y - land.along) * CELL };
  }
  function towerLandWorld(pose) {
    const o = landscapeOrigin(), land = towerLandPlacement();
    return { x: o.x + land.across + pose.x / CELL, y: o.y + land.along + pose.z / CELL,
      facing: (pose.yaw || 0) / (Math.PI / 2), yaw: pose.yaw || 0, pitch: pose.pitch || 0 };
  }
  function towerLandCell(x, y, renderOnly = false) {
    const local = towerLandLocal(x, y), support = towerPersonalSupportAt(local.x, local.z, 0, towerPersonal.stage);
    const exterior = ['tape-field', 'dead-broadcast'].includes(towerPersonal.stage);
    // Low physical banks bound the walkable route. Outside them the eye still
    // sees ground; a missing render cell would create a full-height grid wall.
    if (!support && !(renderOnly && exterior)) return null;
    const height = SOURCE_TIER_BY_ID.bells?.height ?? 15.2;
    const material = towerPersonal.stage === 'tape-field' ? MATERIAL.wetGrass
      : towerPersonal.stage === 'dead-broadcast' ? MATERIAL.wetTarmac
      : ['school-hall', 'return-hall'].includes(towerPersonal.stage) ? MATERIAL.woodVelvet : MATERIAL.serviceConcrete;
    return { floor: height, ceil: height + 32, flags: F.SKY | (exterior ? 0 : F.WALLED),
      material, solid: false, zone: ZONE.sourceSpace };
  }
  function towerLandPieceWorld(piece) {
    const o = landscapeOrigin(), land = towerLandPlacement(), height = SOURCE_TIER_BY_ID.bells?.height ?? 15.2;
    return { ...piece, yaw: piece.yaw || 0, pitch: piece.pitch || 0, roll: piece.roll || 0,
      scaleX: piece.scaleX ?? piece.scale ?? 1, scaleY: piece.scaleY ?? piece.scale ?? 1, scaleZ: piece.scaleZ ?? piece.scale ?? 1,
      x: (o.x + land.across) * CELL + piece.localX, z: (o.y + land.along) * CELL + piece.localZ,
      height: height + (piece.height || 0) };
  }
  function towerLandPieces() {
    const o = landscapeOrigin(), key = `${o.x}:${o.y}:${state.seed}:${towerPersonal.stage}`;
    if (towerLandCache?.key === key) return towerLandCache.pieces;
    const pieces = towerPersonalWorldPieces(towerPersonal.stage).map(towerLandPieceWorld);
    towerLandCache = { key, pieces };
    return pieces;
  }
  function towerLandPresent(piece) {
    return towerPersonalPiecePresent(piece, { stage: towerPersonal.stage, collapse: Math.min(1, towerPersonal.collapseSeconds / TOWER_PERSONAL_JOURNEY.collapseSeconds), seed: state.seed });
  }
  function towerLandInstances(px = player.x, py = player.y, { time = 0, reducedMotion = false } = {}) {
    if (!towerPersonal.active) return [];
    const frame = towerLandFrame(), meterLevel = towerPersonalRecordingLevel(towerPersonalMonitorHeld ? towerPersonalMonitorSeconds : time);
    const sourceLevel = towerPersonalWorldSignal.active && towerPersonalWorldSignal.world === frame.world
      ? towerPersonalRecordingLevel(towerPersonalWorldSignal.offset) : 0;
    const pieces = [...towerLandPieces()];
    if (towerPersonal.stage === 'return-hall') pieces.push(...towerPersonalHandoverPieces(frame.handover, { reducedMotion }).map(towerLandPieceWorld));
    const out = [];
    for (const piece of pieces) {
      if (!towerLandPresent(piece)) continue;
      const meter = piece.id === 'land-recorder-level', meterScale = meter ? .15 + .85 * meterLevel : 1;
      const sway = piece.animation === 'tape' && !reducedMotion ? Math.sin(time * .38 + piece.localX * .7) * .018 : 0;
      out.push({ id: piece.id, mesh: piece.mesh,
        matrix: sourceMatrix({ x: piece.x - (meter ? .026 * piece.scaleX * (1 - meterScale) : 0),
          y: piece.height, z: piece.z, yaw: piece.yaw + sway, pitch: piece.pitch, roll: piece.roll + (piece.id === 'land-bell-pair' && !reducedMotion ? sourceLevel * .045 : 0),
          scaleX: piece.scaleX * meterScale, scaleY: piece.scaleY, scaleZ: piece.scaleZ }),
        zone: ZONE.sourceSpace, structural: !piece.figure, noShadow: !!piece.noShadow, sourceStructure: 'tower-land',
        ...(piece.character ? { character: piece.character.loop ? { ...piece.character, time: towerPersonal.time } : piece.character } : {}),
        ...(piece.emissive ? { emissive: meter ? [.35, .85, .55, .5 + meterLevel * 2]
          : piece.id === 'land-mast-lamp' ? [.65, .82, .75, reducedMotion ? .8 : .6 + sourceLevel * .7]
          : piece.emissive } : {}),
      });
    }
    const weather = frame.weather, local = towerLandLocal(px, py), count = reducedMotion ? 12 : 42;
    if (weather.snow || weather.ash) for (let k = 0; k < count; k += 1) {
      const ax = local.x + (rand(state.seed, k, 1701) - .5) * 17;
      const az = local.z + (rand(state.seed, k, 1703) - .5) * 17;
      if (!towerPersonalSupportAt(ax, az, 0, towerPersonal.stage)) continue;
      const drop = reducedMotion ? rand(state.seed, k, 1705) * 4 : ((rand(state.seed, k, 1705) * 6 - time * .48) % 6 + 6) % 6;
      const world = towerLandWorld({ x: ax, z: az });
      out.push({ id: `land-weather-${k}`, mesh: weather.ash ? 'tower_personal_ashflake' : 'tower_personal_snowflake',
        matrix: sourceMatrix({ x: world.x * CELL, y: (SOURCE_TIER_BY_ID.bells?.height ?? 15.2) + drop + .05,
          z: world.y * CELL, yaw: rand(state.seed, k, 1707) * Math.PI, scaleX: 1.5, scaleY: 1.5, scaleZ: 1.5 }),
        zone: ZONE.sourceSpace, structural: false, noShadow: true, sourceStructure: 'tower-land-weather' });
    }
    return out;
  }
  function towerLandFrame() {
    const frame = towerPersonalJourneyFrame(towerPersonal), placement = towerLandPlacement(), world = towerPersonalWorld(frame.stage);
    const onward = world.doors.find(door => door.id === 'onward'), back = world.doors.find(door => door.id !== 'onward');
    const source = TOWER_PERSONAL_WORLD_SOURCES[frame.stage];
    return { ...frame, world: world.world, time: stationClockSeconds, walkMetresPerSecond: 1.35,
      recordingOffset: frame.recordingOffsetSeconds || 0, localPose: { ...frame.pose }, pose: towerLandWorld(frame.pose), placement,
      doors: world.doors.map(door => ({ ...door, pose: towerLandWorld(door.center) })),
      targets: { boy: towerLandWorld(TOWER_PERSONAL_JOURNEY.boy), recordist: towerLandWorld(TOWER_PERSONAL_JOURNEY.recordist),
        source: { ...towerLandWorld(source), height: source.height }, exit: towerLandWorld(back?.center || TOWER_PERSONAL_JOURNEY.returnDoor),
        onward: towerLandWorld(onward?.center || TOWER_PERSONAL_JOURNEY.hallDoor) },
      ringClearing: { x: landscapeOrigin().x, y: landscapeOrigin().y + SOURCE_BELLS.room.threshold + 12 },
    };
  }
  function enterTowerLand(id = 'school-hall', options = {}) {
    if (state.phase !== CHUNK_SURF_PHASE.BELLS || towerPersonal.completed) return null;
    if (towerPersonal.active) return towerLandFrame().pose;
    const back = options.returnPose || towerPersonal.returnPose || { ...player, yaw: player.facing || 0, pitch: 0 };
    const next = beginTowerPersonalJourney(towerPersonal, { entryDoorId: options.entryDoorId || doorCrossing?.id, returnPose: back });
    if (!next) return null;
    towerPersonal = next; towerLandCache = null; lastPlan = null;
    // This consumes the old crossing's wrong-return action in the same save as
    // the active land. Main can never return us again after the pocket begins.
    doorCrossing = null; stationWalk = null;
    player = { ...player, ...towerLandWorld(towerPersonal.pose) };
    saveStation();
    return towerLandFrame().pose;
  }
  function leaveTowerLand() {
    const result = leaveTowerPersonalJourney(towerPersonal);
    if (!result) return null;
    towerPersonal = result.journey; towerLandCache = null; lastPlan = null;
    doorCrossing = null; stationWalk = null; player = { ...player, ...result.pose };
    if (towerPersonal.completed && towerPersonal.entryDoorId) {
      doorTakenAt.set(towerPersonal.entryDoorId, crossingClock());
      state = { ...state, routeDoorsErased: [...new Set([...(state.routeDoorsErased || []), towerPersonal.entryDoorId])].slice(-64) };
    }
    saveStation();
    return { ...result.pose, completed: result.completed };
  }
  function towerLandState() { return towerPersonal.active ? towerPersonal.stage : null; }
  function tickTowerLand(dt = 0, options = {}) {
    if (!towerPersonal.active) return null;
    if (!options.paused) {
      towerPersonalMonitorHeld = !!options.recorderHeld && towerLandFrame().canListen;
      if (towerPersonalMonitorHeld) towerPersonalMonitorSeconds = Number.isFinite(options.recordingOffset)
        ? options.recordingOffset : towerPersonal.recordingOffsetSeconds || 0;
    } else towerPersonalMonitorHeld = false;
    towerPersonalWorldSignal = { world: options.sourceRecordingWorld,
      offset: Number.isFinite(options.sourceRecordingOffset) ? options.sourceRecordingOffset : 0,
      active: !options.paused && !!options.sourceRecordingActive };
    const before = towerPersonal.stage, heard = towerPersonal.recordingHeard;
    const result = tickTowerPersonalJourney(towerPersonal, dt, options);
    towerPersonal = result.journey;
    if (before !== towerPersonal.stage) towerLandCache = null;
    state = { ...state, station: { ...state.station, personal: normalizeTowerPersonalJourney(towerPersonal) } };
    if (result.events.length || heard !== towerPersonal.recordingHeard) saveStation();
    return { ...result, frame: towerLandFrame() };
  }
  function advanceTowerLand(action = 'interact') {
    if (!towerPersonal.active) return { handled: false };
    return { handled: true, event: 'personal-onward', frame: towerLandFrame() };
  }
  function consumeTowerPersonalRewardNow() {
    const next = consumeTowerPersonalReward(towerPersonal);
    if (!next) return false;
    towerPersonal = next; saveStation(); return true;
  }
  function markTowerPersonalRingAnswered() {
    if (!towerPersonal.completed || towerPersonal.ringAnswered) return false;
    towerPersonal = { ...towerPersonal, ringAnswered: true }; saveStation(); return true;
  }
  function towerLandRefuses(toX, toY) {
    if (!towerPersonal.active) return false;
    const local = towerLandLocal(toX, toY);
    if (!towerPersonalSupportAt(local.x, local.z, .22, towerPersonal.stage)) return true;
    const wx = toX * CELL, wz = toY * CELL, m = .24;
    for (const piece of [...towerLandPieces(), ...(towerPersonal.stage === 'return-hall' ? towerPersonalHandoverPieces(towerLandFrame().handover).map(towerLandPieceWorld) : [])]) {
      if (!piece.solid || !towerLandPresent(piece)) continue;
      // New contractor meshes have explicit physical footprints because the
      // generated bounds predate this authored person.
      const bounds = piece.bounds || PROP_BOUNDS[piece.mesh] || (piece.mesh === 'tower_personal_recordist_working'
        ? { min: [-.8, 0, -.85], max: [.8, 1.3, .8] } : null);
      if (!bounds) continue;
      const dx = wx - piece.x, dz = wz - piece.z, cos = Math.cos(piece.yaw), sin = Math.sin(piece.yaw);
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      if (lx >= bounds.min[0] * piece.scaleX - m && lx <= bounds.max[0] * piece.scaleX + m
        && lz >= bounds.min[2] * piece.scaleZ - m && lz <= bounds.max[2] * piece.scaleZ + m) return true;
    }
    return false;
  }
  function towerLandFocus() {
    if (!towerPersonal.active) return [];
    return [...towerLandPieces(), ...(towerPersonal.stage === 'return-hall' ? towerPersonalHandoverPieces(towerLandFrame().handover).map(towerLandPieceWorld) : [])].filter((piece) => piece.look && towerLandPresent(piece)).map((piece) => ({
      kind: piece.door || ['land-door', 'land-workroom-door', 'land-return-door'].includes(piece.id) ? 'land-door' : 'land-piece',
      id: piece.id, look: piece.look, x: piece.x / CELL, y: piece.z / CELL,
      focusPriority: piece.id === 'land-return-door' ? 9 : 6,
      focusRadius: piece.id === 'land-stage' ? 8 : piece.figure ? 5.4 : 3.2,
    }));
  }
  var doorExtrasCache;
  function doorFieldExtras(route = doorFieldRoute()) {
    if (!route) return [];
    const o = landscapeOrigin(), key = `${route}:${o.x}:${o.y}`;
    if (doorExtrasCache?.key === key) return doorExtrasCache.extras;
    const band = doorFieldBand(route);
    const extras = DOOR_EXTRAS.map((spec) => {
      const localX = spec.across, localY = band.from - spec.along * (band.from - band.to);
      const matrix = sourceMatrix({ x: (o.x + localX) * CELL, y: band.height + spec.lift, z: (o.y + localY) * CELL, yaw: spec.yaw, pitch: spec.pitch || 0, roll: spec.roll || 0 });
      const id = `extra:${route}:${spec.kind}`;
      const parts = [];
      if (spec.mesh) parts.push({ id, mesh: spec.mesh, matrix });
      else {
        const assembly = doorAssembly(spec.archetype, { activeLeaves: 'all' });
        parts.push({ id, mesh: assembly.frameMesh, matrix });
        if (assembly.headMesh) parts.push({ id: `${id}:head`, mesh: assembly.headMesh, matrix });
        for (let leaf = 0; leaf < assembly.leafCount; leaf += 1) parts.push({ id: `${id}:leaf-${leaf + 1}`, mesh: assembly.leafMesh, matrix: mul(matrix, doorLeafLocalMatrix(assembly, leaf, 0)) });
      }
      return { id, kind: spec.kind, localX, localY, lift: spec.lift, matrix, parts };
    });
    doorExtrasCache = { key, extras };
    return extras;
  }
  // Looked at from wherever he can see them: they cannot be walked to.
  function doorExtraFocus() {
    const route = doorFieldRoute();
    if (!route) return [];
    return doorFieldExtras(route).map((extra) => ({
      kind: 'door-extra', id: extra.id, extra: extra.kind, x: extra.localX + landscapeOrigin().x, y: extra.localY + landscapeOrigin().y,
      // Below anything on the ground in reach: a scar, a door he is standing at.
      focusPriority: 3, focusRadius: 16,
    }));
  }
  // A door is looked at before it is tried: the first press looks, the next tries.
  var doorsLooked = new Set();
  const homeDoorsLooked = new Set();

  // What each opened door shows, for the renderer: its opening in world metres,
  // and which way is its front. See renderSourcePortals.
  function outskirtPortals(px = player.x, py = player.y) {
    const route = doorFieldRoute();
    if (!route) return [];
    const o = landscapeOrigin();
    return doorFieldPieces(route)
      .filter((piece) => !piece.door.route && !piece.door.shut && doorOpened(piece) && !doorErased(piece)
        && Math.hypot((o.x + piece.localX - px) * CELL, (o.y + piece.localY - py) * CELL) <= 190)
      .map((piece) => ({
        id: piece.id, corners: piece.opening.corners, normal: piece.opening.normal,
        variant: piece.door.variant, seed: route === 'chapel' ? stationRealmSeed(state.seed, piece.door.variant) : piece.door.seed,
        // Its world is anchored at the threshold; a tower key's has the tower in it.
        origin: doorOrigin(piece), key: !!piece.door.key,
      }));
  }

  // THE TOWER, THROUGH ITS DOOR. Once it is open, where the opening stands, for
  // main.js to hang St Brendan's belfry in it (r3dSetSourceTowerView). Walking
  // through it is walking into the belfry: see enterBellsRoom.
  function towerDoorView(px = player.x, py = player.y) {
    if (doorFieldRoute() !== 'tower' || !towerDoorUnlocked()) return null;
    const piece = doorFieldPieces('tower').find((entry) => entry.door.route);
    if (!piece) return null;
    const origin = doorOrigin(piece), n = piece.opening.normal;
    const distanceM = Math.hypot(origin[0] - (px + 0.5) * CELL, origin[2] - (py + 0.5) * CELL);
    if (distanceM > 90) return null;
    return {
      id: piece.id, corners: piece.opening.corners.map((corner) => [...corner]), normal: [...n], origin,
      forward: [-n[0] || 0, -n[2] || 0], width: piece.assembly.opening.width, height: piece.assembly.opening.height, distanceM,
    };
  }

  // Where a door's threshold is, in world metres.
  function doorOrigin(piece) {
    const [a, b] = piece.opening.corners;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  }

  // WHAT LEAKS OUT OF THE DOORS. The nearest few, shut ones faintly: each world's
  // light for the ground in front of it and its sound (elsewhere-beds.js). The
  // road's own door leaks the building once it can be walked through.
  function doorFieldLeaks(px = player.x, py = player.y) {
    const route = doorFieldRoute();
    if (!route) return [];
    const eyeX = px * CELL, eyeZ = py * CELL;
    return doorFieldPieces(route)
      .filter((piece) => (!doorErased(piece) || doorTakeBack(piece).phase === 'taking') && (piece.door.route !== 'tower' || towerDoorUnlocked()))
      .map((piece) => {
        const [x, y, z] = doorOrigin(piece);
        const [a, b] = piece.opening.corners;
        const n = piece.opening.normal;
        const taking = doorErased(piece) ? doorTakeBack(piece) : null;
        const open = !!piece.door.route || doorOpened(piece);
        const world = piece.door.route ? null : ELSEWHERE_WORLDS[piece.door.variant];
        return {
          id: piece.id, x, y, z, forward: [n[0], n[2]], width: Math.hypot(b[0] - a[0], b[2] - a[2]),
          colour: [...(world ? world.leak : ROUTE_DOOR_LEAK)], strength: taking ? 1.4 * (1 - taking.progress * taking.progress) : open ? 1 : 0.35, open,
          variant: world ? piece.door.variant : -1, key: !!piece.door.key,
          ...(piece.door.route === 'chapel' ? { route: 'chapel', bed: 'building' } : {}),
          distanceM: Math.hypot(x - eyeX, z - eyeZ),
        };
      })
      .filter((leak) => leak.distanceM <= 30)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 3);
  }

  // The visit, home walk and disappearance use active station time. Pause,
  // hidden windows and time spent outside the game never consume a visit.
  const crossingClock = () => stationClockSeconds;
  function stationSnapshot() {
    return normalizeSourceStation({ time: stationClockSeconds, entries: stationEntries,
      crossing: doorCrossing, walk: stationWalk,
      personal: towerPersonal,
      realm: stationRealm, homeDiscovered: stationHomeDiscovered, homeResolved: stationHomeResolved,
      lastReturn: stationLastReturn,
      takeBacks: [...doorTakenAt].map(([id, at]) => ({ id, at })) });
  }
  function saveStation() {
    dispatch({ type: 'STATION_SAVED', station: stationSnapshot() }, { immediate: true, recordCausal: false });
  }
  function advanceStationTime(dt = 0) {
    if (!doorFieldRoute()) return stationClockSeconds;
    stationClockSeconds += Number.isFinite(Number(dt)) ? Math.max(0, Number(dt)) : 0;
    const previousCrossing = doorCrossing;
    if (stationRealm?.returnStartedAt != null
      && stationClockSeconds - stationRealm.returnStartedAt >= stationRealm.returnDuration) finishStationRealmReturn();
    doorCrossingFrame();
    // Normal saves include the exact frame. While stationary, checkpoint once
    // per active second and at a visit's end rather than writing every render.
    const second = Math.floor(stationClockSeconds);
    if (second !== stationSavedSecond || previousCrossing !== doorCrossing) {
      stationSavedSecond = second;
      saveStation();
    }
    return stationClockSeconds;
  }
  function stationWalkState() { return stationSnapshot().walk; }
  function setStationWalkState(walk = null) {
    const before = stationWalk;
    stationWalk = normalizeSourceStation({ walk }).walk;
    if (!before || !stationWalk || before.windowAt !== stationWalk.windowAt
      || before.thought !== stationWalk.thought || before.done !== stationWalk.done) saveStation();
    return stationWalkState();
  }
  const STATION_RELIC_WORLDS = Object.freeze(['burning', 'flood', 'inverted', 'two-moons', 'glass-storm']);
  function stationRelicWorlds() {
    return STATION_RELIC_WORLDS.filter((world) => stationEntries.some((entry) => !entry.home && entry.world === world && entry.returnedAt != null));
  }
  function stationRealmFrame() { return realmFrame(stationRealm, crossingClock()); }
  function stationRealmHomeState() { return normalizeStationRealmHomeState(stationRealm?.homeState); }
  function setStationRealmHomeState(homeState) {
    if (!stationRealm?.home) return null;
    const before = stationRealm.homeState;
    stationRealm.homeState = normalizeStationRealmHomeState(homeState);
    // Continuous attention is covered by the one-second active checkpoint;
    // decisions and recognition are saved immediately, rather than every frame.
    if (!before || Object.keys(stationRealm.homeState || {}).some((key) =>
      typeof stationRealm.homeState[key] !== 'number' && before[key] !== stationRealm.homeState[key])) saveStation();
    return stationRealmHomeState();
  }
  function setStationRealmLook({ yaw, pitch } = {}) {
    if (!stationRealm) return false;
    if (Number.isFinite(Number(yaw))) stationRealm.pose.yaw = Number(yaw);
    if (Number.isFinite(Number(pitch))) stationRealm.pose.pitch = Math.max(-1.4, Math.min(1.4, Number(pitch)));
    return true;
  }
  function markHomeWindowReached() {
    if (!stationRealm?.home || !stationRealmAtWindow(stationRealm)) return false;
    if (!stationRealm.windowReached) {
      stationRealm.windowReached = true; stationHomeDiscovered = true; saveStation();
    }
    return true;
  }
  function moveStationRealm(delta = {}) {
    const previousStage = stationRealm?.stage;
    const result = moveRealm(stationRealm, delta, crossingClock());
    if (result.atWindow) markHomeWindowReached();
    if (stationRealm && previousStage !== stationRealm.stage) saveStation();
    return { ...result, frame: stationRealmFrame() };
  }
  function finishStationRealmReturn() {
    if (!stationRealm) return false;
    const realm = stationRealm, now = crossingClock();
    stationEntries = stationEntries.map((entry) => entry.doorId === realm.entryDoorId && entry.returnedAt == null
      ? { ...entry, returnedAt: now } : entry);
    stationLastReturn = { id: realm.entryDoorId, world: realm.world, home: realm.home,
      reason: realm.returnReason || 'budget', windowReached: realm.windowReached, at: now,
      returnPose: { ...realm.returnPose } };
    if (realm.home && realm.returnReason === 'home' && realm.windowReached) stationHomeResolved = true;
    doorTakenAt.set(realm.entryDoorId, now);
    stationRealm = null; doorCrossing = null; stationWalk = null;
    saveStation();
    return true;
  }
  function stationLastRealmReturn() { return stationSnapshot().lastReturn; }
  // THE WAY HOME. Carrying something from each of the other five worlds, a
  // whiteout door does not put him back after a few seconds: the crossing stays
  // open, reveal full, until main has walked him to the lit window and lets him
  // go (releaseHomeCrossing). Only then does it fold, and the door is taken back.
  var stationHomeOpen = null;
  function stationHomeReady() {
    return stationHomeOpen == null ? stationRelicWorlds().length === STATION_RELIC_WORLDS.length : stationHomeOpen;
  }
  function setStationHomeOpen(open = false) { stationHomeOpen = !!open; return stationHomeOpen; }
  function releaseHomeCrossing(now = crossingClock()) {
    if (stationRealm?.home) {
      if (!beginStationRealmReturn(stationRealm, now, stationRealm.windowReached ? 'home' : 'retreat')) return false;
      saveStation(); return true;
    }
    if (!doorCrossing || (!doorCrossing.home && !doorCrossing.lockIn) || doorCrossing.released) return false;
    doorCrossing.released = true;
    doorCrossing.startedAt = now - (ELSEWHERE_CROSSING.open + ELSEWHERE_CROSSING.hold);
    (doorTakenAt ||= new Map()).set(doorCrossing.id, now + ELSEWHERE_CROSSING.fold);
    stationWalk = null;
    saveStation();
    return true;
  }
  // A WORLD THAT CANNOT BE KEPT UP. Three moments in a crossing where it drops to
  // nothing and comes back: the reveal itself goes, so the doorway's world is
  // simply not there for a beat. Seeded, so the same door fails the same way.
  function crossingFailure(crossing, elapsed) {
    if (!crossing?.fails) return 1;
    const seed = Number(crossing.seed) || 0;
    let level = 1;
    for (let k = 0; k < 3; k += 1) {
      const at = 0.4 + unitRand(seed, k * 3 + 1) * (ELSEWHERE_CROSSING_SECONDS - 0.9);
      const span = 0.06 + unitRand(seed, k * 3 + 2) * 0.16;
      const into = (elapsed - at) / span;
      if (into >= 0 && into <= 1) level = Math.min(level, into < 0.7 ? 0 : (into - 0.7) / 0.3);
    }
    return level;
  }
  function unitRand(seed, k) { const x = Math.sin(seed * 311.7 + k * 57.13) * 43758.5453; return x - Math.floor(x); }
  // Put back somewhere else in the corridor, facing the way he came from.
  function wrongReturnSpot(crossing) {
    const route = doorFieldRoute();
    if (!route || !crossing?.wrong) return null;
    const o = landscapeOrigin(), band = doorFieldBand(route), c = doorCorridor(route);
    const seed = Number(crossing.seed) || 0;
    const along = band.from - (0.15 + unitRand(seed, 21) * 0.7) * (band.from - band.to);
    const across = (unitRand(seed, 23) - 0.5) * 2 * (c.half - 4);
    return { x: Math.round(o.x + across), y: Math.round(o.y + along), facing: unitRand(seed, 27) < 0.5 ? 0 : 2 };
  }
  function doorCrossingFrame(now = crossingClock()) {
    if (!doorCrossing) return null;
    if (stationRealm) {
      const realm = realmFrame(stationRealm, now), elapsed = Math.max(0, now - stationRealm.startedAt);
      return { ...doorCrossing, phase: realm.stage, progress: realm.decoherence, reveal: 1,
        elapsed, realm, seed: stationRealm.seed, decoherence: realm.decoherence };
    }
    if ((doorCrossing.home || doorCrossing.lockIn) && !doorCrossing.released) {
      const elapsed = Math.max(0, now - doorCrossing.startedAt), t = Math.min(1, elapsed / ELSEWHERE_CROSSING.open);
      return { ...doorCrossing, phase: t < 1 ? 'open' : 'staying', progress: t, reveal: t * t * (3 - 2 * t), elapsed, wayOut: !!doorCrossing.lockIn };
    }
    const frame = elsewhereCrossingFrame(doorCrossing, now);
    if (frame) frame.reveal *= crossingFailure(doorCrossing, frame.elapsed);
    if (!frame) { doorCrossing = null; return null; }
    return { ...doorCrossing, ...frame };
  }

  // WALKING THROUGH ONE DOES NOTHING. There is nowhere on the other side of the
  // opening but more of here; the door simply stops having been there. Saved,
  // because two of them in the tower's field are what open the tower door.
  function eraseCrossedDoors(from, to) {
    const erased = [];
    const route = doorFieldRoute();
    if (towerPersonal.active || doorCrossingFrame()) return erased;
    for (const piece of doorFieldPieces()) {
      if (piece.door.route || piece.door.shut || !doorOpened(piece) || doorErased(piece)) continue;
      const [a, b] = piece.opening.threshold;
      if (!segmentsCross(from, to, a, b)) continue;
      if (piece.door.personal) {
        const n = piece.opening.normal, midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // Return the exact approach pose, including view direction. The visit
        // is saved together with clearing the old crossing and its return job.
        const returnPose = { ...from, facing: player.facing || 0, yaw: player.yaw ?? player.facing ?? 0, pitch: player.pitch || 0 };
        if (!physicalCellAt(returnPose.x, returnPose.y)) {
          returnPose.x = midpoint.x + n[0] * 2; returnPose.y = midpoint.y + n[2] * 2;
        }
        enterTowerLand('school-hall', { entryDoorId: piece.id, returnPose });
        erased.push(piece.id); break;
      }
      const world = ELSEWHERE_WORLDS[piece.door.variant]?.id || null;
      const home = world === 'whiteout' && stationHomeReady();
      const lockIn = !!piece.door.lockIn;
      // Its world takes it back once he is out of it again (doorTakeBack); the way
      // home is taken back only once he has been let go.
      if (route === 'chapel') doorTakenAt.delete(piece.id);
      else if (!home && !lockIn) (doorTakenAt ||= new Map()).set(piece.id, crossingClock() + ELSEWHERE_CROSSING_SECONDS);
      else doorTakenAt.delete(piece.id);
      // Nothing on the other side but more of here — after a few seconds of there.
      const n = piece.opening.normal;
      crossingArms += 1;
      doorCrossing = {
          id: piece.id, variant: piece.door.variant, seed: piece.door.seed, key: !!piece.door.key, world, home, released: false,
          wrong: !!piece.door.wrong, fails: !!piece.door.fails, lockIn: !!piece.door.lockIn,
          forward: [-n[0], -n[2]], startedAt: crossingClock(),
      };
      stationEntries = [...stationEntries, { doorId: piece.id, world, variant: piece.door.variant, home, enteredAt: crossingClock(),
        returnedAt: route === 'chapel' ? null : crossingClock() }].slice(-64);
      if (route === 'chapel') {
        const [a, b] = piece.opening.threshold, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // Return a safe hand-width in front of this actual door, facing it. Main
        // keeps the Source anchor while the nested realm owns local movement.
        const returnPose = { x: m.x + n[0] * 2, y: m.y + n[2] * 2,
          facing: player.facing, yaw: Math.atan2(-n[0], n[2]), pitch: 0 };
        stationRealm = createStationRealm({ variant: piece.door.variant, seed: stationRealmSeed(state.seed, piece.door.variant),
          entryDoorId: piece.id, returnPose, home, now: crossingClock() });
        stationLastReturn = null;
      }
      stationWalk = route !== 'chapel' && (home || lockIn) ? { kind: home ? 'home' : 'lock-in', progress: 0,
        windowAt: null, thought: false, done: false, forward: [...doorCrossing.forward] } : null;
      // One saved event owns both the disappearing door and the visit/relic it
      // bought. Reloading cannot keep one half and discard the other.
      dispatch({ type: 'STATION_DOOR_CROSSED', id: piece.id, station: stationSnapshot() }, { immediate: true });
      erased.push(piece.id);
      break;
    }
    return erased;
  }

  // Main asks before the step is taken, so the body can finish walking through
  // the door in Source before the building takes over (sourceDoorArrival).
  function crossesRouteDoor(from, to) {
    if (stationRealm) return false;
    const route = doorFieldRoute();
    if (!route || (route === 'tower' && !towerDoorUnlocked())) return false;
    return crossedRouteDoor(from, to);
  }

  function crossedRouteDoor(from, to) {
    const piece = doorFieldPieces().find((entry) => entry.door.route);
    if (!piece) return false;
    const [a, b] = piece.opening.threshold;
    return segmentsCross(from, to, a, b);
  }

  // A CLOSED DOOR IS A DOOR. Its threshold refuses the body the way a wall does;
  // walk round it, or open it. The locked tower door is closed until it is not.
  function outskirtDoorBlocks(x, y) {
    const route = doorFieldRoute();
    if (!route) return false;
    const o = landscapeOrigin();
    for (const piece of doorFieldPieces(route)) {
      const refuses = piece.door.route
        ? piece.door.route === 'tower' && !towerDoorUnlocked()
        : !doorErased(piece) && (piece.door.shut || !doorOpened(piece));
      if (!refuses) continue;
      if (Math.abs(o.x + piece.localX - x) > 8 || Math.abs(o.y + piece.localY - y) > 8) continue;
      const [a, b] = piece.opening.threshold;
      if (distanceToSegment({ x, y }, a, b) < 0.55) return true;
    }
    return false;
  }

  // The hedges are the edge of the corridor.
  function doorCorridorRefuses(toX, toY) {
    const route = doorFieldRoute();
    if (!route) return false;
    const c = doorCorridor(route), o = landscapeOrigin(), lx = toX - o.x, ly = toY - o.y;
    return ly <= c.from && ly >= c.to && Math.abs(lx) > c.half;
  }

  // The weather in the corridor, coming in as the corridor does. Only how much:
  // the rain is the building's own (r3d rainVolume, the rain bed) and so is the
  // storm (tickStorm in main.js), which owns the sky wherever this says there is one.
  function doorFieldWeather() {
    const route = doorFieldRoute();
    if (!route) return { rain: 0, sky: false };
    const c = doorCorridor(route), ly = player.y - landscapeOrigin().y;
    const rain = Math.max(0, Math.min(1, (c.from + 30 - ly) / 40));
    return { rain, sky: rain > 0 };
  }

  // The hedge closes the end behind the road's door, and the door is the only
  // way through it. The tower's, only once it is unlocked.
  function routeDoorThresholdRefuses(fromX, fromY, toX, toY) {
    const route = doorFieldRoute();
    if (!route) return false;
    const piece = doorFieldPieces(route).find((entry) => entry.door.route);
    if (!piece) return false;
    const [a, b] = piece.opening.threshold, lineY = (a.y + b.y) / 2;
    if ((fromY > lineY) === (toY > lineY)) return false;
    const x = fromX + (toX - fromX) * ((lineY - fromY) / ((toY - fromY) || 1));
    if (Math.abs(x - (a.x + b.x) / 2) > Math.abs(b.x - a.x) / 2 - 0.15) return true;
    return route === 'tower' && !towerDoorUnlocked();
  }

  function outskirtDoorFocus() {
    const route = doorFieldRoute();
    if (!route) return [];
    return doorFieldPieces(route)
      .filter((piece) => (piece.door.route
        ? (piece.door.route === 'tower' && !towerDoorUnlocked()) || (piece.door.route === 'chapel' && !doorsLooked.has(piece.id))
        : !doorErased(piece) && (piece.door.shut || !doorOpened(piece) || (homeDoorEligible(piece) && !homeDoorsLooked.has(piece.id)))))
      .map((piece) => {
        const [a, b] = piece.opening.threshold;
        return {
          kind: 'outskirt-door', id: piece.id, index: Math.max(0, piece.i), route: piece.door.route || null,
          looked: homeDoorEligible(piece) ? homeDoorsLooked.has(piece.id) : piece.door.route === 'tower' || doorsLooked.has(piece.id),
          home: homeDoorEligible(piece),
          x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, focusPriority: 8, focusRadius: 5,
        };
      });
  }

  function doorFieldDoors() {
    return doorFieldPieces().map((piece) => ({
      id: piece.id, mesh: piece.assembly.frameMesh, archetype: piece.assembly.archetype, route: piece.door.route || null,
      shut: !!piece.door.shut, key: !!piece.door.key, opened: doorOpened(piece), erased: doorErased(piece),
      variant: piece.door.variant ?? null, seed: piece.door.seed ?? null,
      wrong: !!piece.door.wrong, fails: !!piece.door.fails, lockIn: !!piece.door.lockIn,
      personal: !!piece.door.personal,
      home: homeDoorEligible(piece), reawakened: whiteoutReawakened(piece),
      threshold: piece.opening.threshold.map((point) => ({ ...point })), normal: [...piece.opening.normal],
      ...(piece.door.route === 'tower' ? { unlocked: towerDoorUnlocked() } : {}),
    }));
  }

  // The chapel road's last metre: through the chapel's own door.
  function enterChapelDoor() {
    if (state.phase !== CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS) return { handled: false, state };
    dispatch({ type: 'CHAPEL_DOOR_ENTERED' }, { immediate: true });
    if (state.phase !== CHUNK_SURF_PHASE.COMPLETED) return { handled: false, state };
    if (!completionSent) {
      completionSent = true;
      onComplete(chunkSurfCompletion(state), exitSnapshot());
    }
    protectMoment(30);
    return { handled: true, state, completion: chunkSurfCompletion(state) };
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
      const scale = (Number(entry.scale) || 1) * fade;
      const yaw = entry.yaw || 0;
      const y = (SOURCE_TIER_BY_ID.bells?.height ?? 15.2)
        + (Number(entry.elevation) || 0) - (Number(entry.sink) || 0);
      const part = (id, mesh, roll, slide = 0) => out.push({
        id,
        mesh,
        matrix: sourceMatrix({
          // A slider runs along the frame, on the bell's own local x.
          x: worldX * CELL + slide * Math.cos(yaw),
          y,
          z: worldZ * CELL - slide * Math.sin(yaw),
          scaleX: scale, scaleY: scale, scaleZ: scale,
          yaw,
          pitch: entry.pitch || 0,
          // ADDED to the authored roll, never replacing it: a leaning bell
          // swings about its lean rather than snapping upright.
          roll: (entry.roll || 0) + roll,
        }),
        zone: ZONE.sourceSpace,
        structural: true,
        sourceStructure: 'bell-passage',
      });
      if (!entry.assembly) { part(entry.id, entry.mesh, bellSwingAt(entry, time)); return; }
      // A RING BELL IS ITS WHOLE ASSEMBLY, drawn the way bell-tower-runtime draws
      // it in the chapel: bell, wheel and stay on the moving gudgeons, the clapper
      // lagging, the slider fixed in the frame and running with the stay.
      const pose = bellAssemblyPoseAt(entry, time);
      const n = String(entry.ring).padStart(2, '0');
      part(entry.id, `tower_bell_${n}`, pose.angle);
      part(`${entry.id}:wheel`, `tower_wheel_${n}`, pose.angle);
      part(`${entry.id}:clapper`, `tower_clapper_${n}`, pose.clapperAngle);
      part(`${entry.id}:stay`, `tower_stay_${n}`, pose.angle);
      part(`${entry.id}:slider`, `tower_slider_${n}`, 0, pose.sliderOffset * scale);
    };
    for (const entry of SOURCE_BELL_PASSAGE) place(entry);
    const recessY = o.y + SOURCE_BELLS.room.threshold + 12;
    if (Math.hypot((o.x + 8 - px) * CELL, (recessY - py) * CELL) < 75) {
      const height = SOURCE_TIER_BY_ID.bells?.height ?? 15.2;
      for (const [id, mesh, x, y, z, scale] of [
        ['bench', 'station_workbench', 0, 0, 0, 1],
        ['machine', 'tower_personal_recorder', -.3, .91, 0, 1],
        ['lamp', 'station_work_lamp', .55, .94, 0, 1],
      ]) out.push({ id: `tower-ring-recess-${id}`, mesh,
        matrix: sourceMatrix({ x: (o.x + 8) * CELL + x, y: height + y, z: recessY * CELL + z,
          scaleX: scale, scaleY: scale, scaleZ: scale }),
        zone: ZONE.sourceSpace, structural: true, noShadow: false, sourceStructure: 'tower-ring-recess',
        ...(id === 'lamp' ? { emissive: [1, .78, .48, 1.7] } : {}),
      });
    }
    return out;
  }

  function propInstances(px = player.x, py = player.y, options = {}) {
    // Standing in a land, the passage he came from is not there: no bells hanging
    // over the school hall, no door field beside it.
    if (state.phase === CHUNK_SURF_PHASE.BELLS && towerLandState()) return towerLandInstances(px, py, options);
    if (state.phase === CHUNK_SURF_PHASE.BELLS) return [...bellPassageInstances(px, py), ...doorFieldInstances(px, py, options), ...towerLandInstances(px, py, options)];
    if (state.phase === CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS) return doorFieldInstances(px, py, options);
    if (state.phase === CHUNK_SURF_PHASE.HORIZON) return preTapeInstances(px, py, options);
    if ([CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) return [...hallPropInstances(), ...pageInstances(px, py, options)];
    if ([CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) {
      // The first nothingness contains only its two fixed shores. Later Source
      // architecture stays behind the bank, including after a return to the void.
      if (sourceShoreFrame().outside) return landingPropInstances();
      const architecture = surfaceArchitectureInstances(px, py);
      const fixtureLights = new Map(resolveSourceRoomMemoryLights(
        architecture.filter((prop) => prop.sourceMemoryFixture), { ...options, slots: Infinity },
      ).map((light) => [light.anchorPropId, light]));
      const arch = [...architecture.map((prop) => {
        if (!prop.sourceMemoryFixture) return prop;
        const light = fixtureLights.get(prop.id);
        return {
          ...prop,
          emissive: [...(light?.color || prop.lightColor || [0, 0, 0]), prop.lightMaintained ? .22 : .28],
          practicalEmissiveScale: light?.emissiveScale ?? 0,
        };
      }), ...edgeDoorInstances(px, py, options)];
      // The aperture is the hinge. Retain the authored hall behind its rear
      // plane, with enough clearance for complete prop bounds outside the dock.
      const rear = hallRenderableInPhase()
        ? [...hallPropInstances(), ...pageInstances(px, py, options)].filter((prop) =>
          prop.matrix[14] > (landingWorld(SOURCE_LANDING_REAR_LOCAL).y + 1) * CELL + 1.5)
        : [];
      if (options.reducedMotion || state.phase === CHUNK_SURF_PHASE.COMPLETED) return [...arch, ...rear];
      return [...arch, ...rear, ...driftInstances(px, py, options.time || 0)];
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
      roomMemories: sourceRoomMemoryFrame({ time, reducedMotion }).survivors,
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

  // `context` is what the recordist brings to the landing — see sourceHushContext().
  function beginHushContact(context = null) {
    if (!hushMode().contactAvailable || traversal || pendingContact) return null;
    rememberDialogueFact(SOURCE_DIALOGUE_FACT.HUSH_CONTACT, true, { latencyReads: 0 });
    pendingContact = nextSourceContact(state.sourceContacts, { seed: state.seed, context });
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
    const choice = sourceContactChoice(encounter,choiceId);
    if(!choice)return {handled:false};
    if(contact.lastChoiceId!==choice.id)return {handled:false,reason:'warning-required'};
    dispatch({ type: 'SOURCE_CONTACT_RESOLVED', contact }, { immediate: true });
    if(choice.terminal)pendingContact = null;
    protectionRemaining = Math.max(0, 1.25);
    captureMovementRequired = false;
    captureMovementAnchor = null;
    noProgressSeconds = 0;
    const combat=choice.sourceContactAction==='combat' && contact.combatCommitted;
    const committed=combat?commitContact():null;
    return {
      handled: true,
      checkpoint: { ...player },
      combat: combat && committed?.handled,
      terminal: !!choice.terminal,
      insightGained: null,
      bossExposed: sourceBossExposed(contact),
      contact,
      encounterId: encounter.id,
    };
  }

  // Radio history can change the human trace's response. A call never arms
  // the combat warning or commits the battle.
  function recordHushRadioTalk() {
    const before = normalizeSourceContactState(state.sourceContacts);
    if (!hushMode().contactAvailable) return { handled: false, talks: before.talks, ready: sourceContactTalksReady(before) };
    const contact = recordSourceRadioTalk(before);
    dispatch({ type: 'SOURCE_CONTACT_RESOLVED', contact }, { immediate: true });
    return { handled: true, talks: contact.talks, ready: sourceContactTalksReady(contact) };
  }

  // Compatibility entry point for deterministic tests and old callers. The
  // live game opens the authored choice scene without relocating the player.
  function handleHushContact() {
    const encounter = beginHushContact();
    if (!encounter) return checkpointPosition();
    return resolveHushContactChoice('contact.leave').checkpoint;
  }

  // THE DISK CANNOT READ THE BUILDING'S OWN SOURCE.
  //
  // Seven of the eight bands are the repository, exactly as written. The eighth
  // is where MATERIAL.sourceFault cells land (sourceLayerAtWorld routes them to
  // hush) and MAT_SOURCE_FAULT already tints red — so fault ground and fault
  // objects are the one surface in Source space that is allowed to stop being
  // the source and start being the failure to read it.
  //
  // The warnings are INTERLEAVED rather than replacing the band outright: rows
  // of real source with rows of ntfsclone failure between them is the picture
  // the reference actually shows, and it keeps the hush sector legible on the
  // cells that are not faulted. r3dSetSourceSurface lays 11 rows per band, so
  // the ratio here is what the floor reads.
  //
  // Nothing animates this: the surface canvas is uploaded once on entering
  // Source, and SOURCE_FAULT_FRAG — which is already a bad-sector simulation,
  // holds and dropouts and all — runs afterwards and does the tearing.
  function sourceSurfaceLines(limit = 96) {
    const out = [];
    const sectors=Object.entries(SOURCE_ATLAS.sectors||{});
    const perSector=Math.max(1,Math.floor(limit/Math.max(1,sectors.length)));
    for (const [id,sector] of sectors) {
      const layer=SOURCE_LAYER_BY_SECTOR[id]||1;
      const lines=(sector.sourceLines || []).slice(0,perSector);
      if(layer!==SOURCE_FAULT_LAYER){
        for(const line of lines)out.push({...line,sourceLayer:layer});
        continue;
      }
      // The fault band, one row of source to two of failure — seeded off the
      // run so a night reads the same disk every time it is entered.
      const warnings=sectorErrorLines({count:Math.max(6,lines.length*2),seed:(state.seed||4417)+SOURCE_FAULT_LAYER});
      let taken=0;
      for(let row=0;row<lines.length+warnings.length;row+=1){
        if(row%3===0&&taken<lines.length){out.push({...lines[taken],sourceLayer:layer});taken+=1;continue;}
        const warning=warnings[row%warnings.length];
        if(warning)out.push({text:warning,sourceLayer:layer});
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
    if (towerPersonal.active) {
      const local = towerLandLocal(candidate.x, candidate.y);
      if (towerPersonalSupportAt(local.x, local.z, .22, towerPersonal.stage)) {
        towerPersonal = { ...towerPersonal, pose: { x: local.x, z: local.z,
          yaw: Number.isFinite(Number(next?.yaw)) ? Number(next.yaw) : towerPersonal.pose.yaw,
          pitch: Number.isFinite(Number(next?.pitch)) ? Number(next.pitch) : towerPersonal.pose.pitch } };
      }
    }
    // The traversal clock already owns the exact interpolated position. Running
    // the stationary connector normalizer over those frames snapped the body to
    // one lip or the other while the camera was still between floors.
    if (traversal) return;
    if ([CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase) && !state.firstLiftCompleted) {
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
    if(divideActiveAt(candidate.x,candidate.y)) {
      // A deliberate review warp may establish a new ground placement. A
      // restored first placement keeps its serialized over/under/falling layer.
      if(dividePositionEstablished && Math.hypot(candidate.x-player.x,candidate.y-player.y)>8) {
        const o=landscapeOrigin();
        divide={version:1,feet:sourceDivideFloorAt((candidate.x-o.x)*CELL,(candidate.y-o.y)*CELL),fallVelocity:0,falling:false};
      }
      dividePositionEstablished=true;
    }
    player = candidate;
    updateDivideBody();
    // Position, deck support and adaptation remain authoritative across normal
    // movement, reload and God review. Setting a position does not fake a crossing.
    updateShorePosition();
    if(captureMovementRequired&&!captureMovementAnchor){
      captureMovementAnchor={x:candidate.x,y:candidate.y};
    }
  }

  function textSpaceActive() {
    return state.firstLiftCompleted
      && [CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase);
  }

  function sourceRoomMemoryActive() {
    return textSpaceActive() && sourceShoreFrame().proper;
  }

  let roomMemoryGeometryCache = null;
  function sourceRoomMemoryGeometry() {
    if (!textSpaceActive()) return [];
    const o = landscapeOrigin();
    const key = `${state.seed}:${o.x}:${o.y}`;
    if (roomMemoryGeometryCache?.key !== key) {
      const props = surfaceArchitectureInstances(o.x, o.y, { all: true })
        .filter((prop) => prop.roomMemory);
      const snapshot = sourceRoomMemorySnapshot(props);
      roomMemoryGeometryCache = {
        key, props, fixtures: props.filter((prop) => prop.sourceMemoryFixture),
        survivors: snapshot.filter((prop) => !prop.fixture),
        fixtureSnapshot: snapshot.filter((prop) => prop.fixture),
      };
    }
    return roomMemoryGeometryCache.props;
  }

  function sourceRoomMemoryFrame({ time = phaseElapsed, reducedMotion = false, flashMode = 'full', liveCircuits = null } = {}) {
    const active = sourceRoomMemoryActive();
    sourceRoomMemoryGeometry();
    if (!active) return { active, medium: 'overworld', survivors: [], fixtures: [], lights: [] };
    return {
      active, medium: 'overworld',
      survivors: roomMemoryGeometryCache.survivors,
      fixtures: roomMemoryGeometryCache.fixtureSnapshot,
      lights: resolveSourceRoomMemoryLights(roomMemoryGeometryCache.fixtures, {
        time, reducedMotion, flashMode, liveCircuits,
        origin: { x: player.x * CELL, z: player.y * CELL },
      }),
    };
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
    const bells = state.phase === CHUNK_SURF_PHASE.BELLS || state.phase === CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS;
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

  function localLights({ time = phaseElapsed, reducedMotion = false, flashMode = 'full', liveCircuits = null } = {}) {
    if ([CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase)) return sourceHallLightPlacements(-player.y * CELL);
    if (towerPersonal.active) {
      const height = SOURCE_TIER_BY_ID.bells?.height ?? 15.2;
      return towerPersonalWorldLights(towerPersonal.stage).filter(light => light.permanent || towerLandPresent(light)).map(light => {
        const world = towerLandWorld(light);
        return { ...light, id: `tower-personal-${light.id}`, kind: LIGHT_KIND.FITTING,
          x: world.x * CELL, y: height + light.height, z: world.y * CELL,
          penetration: light.penetration ?? .65, castsShadow: light.castsShadow !== false };
      });
    }

    const voidLight = voidLamp();
    if (voidLight) {
      const o = landscapeOrigin(), recess = { x: (o.x + 8) * CELL, z: (o.y + SOURCE_BELLS.room.threshold + 12) * CELL };
      const inRecess = state.phase === CHUNK_SURF_PHASE.BELLS && Math.hypot(recess.x - player.x * CELL, recess.z - player.y * CELL) < 24;
      return inRecess ? [voidLight, { id: 'tower-ring-recess-lamp', kind: LIGHT_KIND.FITTING,
        ...recess, y: (SOURCE_TIER_BY_ID.bells?.height ?? 15.2) + 1.5,
        color: [1, .78, .48], intensity: 1.8, radius: 9, penetration: .8, castsShadow: true }] : [voidLight];
    }
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
      .filter((light)=>!light.sourceDockOnly||voidFrame.sceneDock)
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
    const roomLights = sourceRoomMemoryFrame({ time, reducedMotion, flashMode, liveCircuits }).lights;
    if (approach.length <= SOURCE_APPROACH_LAMPS_LIT) return [...lamps, ...roomLights];
    const px = player.x * CELL, pz = player.y * CELL;
    const nearest = new Set(approach
      .map((light)=>({ id: light.id, d: Math.hypot(light.x - px, light.z - pz) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, SOURCE_APPROACH_LAMPS_LIT)
      .map((entry) => entry.id));
    return [...lamps.filter((light)=>!String(light.id).startsWith('source-approach-emergency-') || nearest.has(light.id)), ...roomLights];
  }

  // Saves predating the entry journal still know which doors were consumed.
  // Recover their relic receipts from this seed's actual door deal once, so an
  // older crossing save does not remain permanently short of its fifth world.
  for (const piece of doorFieldPieces()) {
    if (!doorWasErased(piece) || stationEntries.some((entry) => entry.doorId === piece.id)) continue;
    stationEntries.push({ doorId: piece.id, world: ELSEWHERE_WORLDS[piece.door.variant]?.id || '',
      variant: piece.door.variant, home: false, enteredAt: stationClockSeconds, returnedAt: stationClockSeconds });
  }
  // Earlier saves can be sitting in a timed glimpse or the virtual home walk.
  // Recover the old forced tower walk onto the saved, walkable hall. There is
  // no remaining wrong-return timer to put a restored body back on the road.
  if (state.phase === CHUNK_SURF_PHASE.BELLS && doorCrossing?.lockIn && !towerPersonal.active && !towerPersonal.completed) {
    const piece = doorFieldPieces().find((entry) => entry.id === doorCrossing.id);
    if (piece) {
      const [a, b] = piece.opening.threshold, n = piece.opening.normal;
      const back = { x: (a.x + b.x) / 2 + n[0] * 2, y: (a.y + b.y) / 2 + n[2] * 2,
        facing: 0, yaw: Math.atan2(-n[0], n[2]), pitch: 0 };
      towerPersonal = beginTowerPersonalJourney(towerPersonal, { entryDoorId: piece.id, returnPose: back });
      doorCrossing = null; stationWalk = null; player = { ...player, ...towerLandWorld(towerPersonal.pose) };
      state = { ...state, station: stationSnapshot() };
    }
  }
  // Earlier saves can be sitting in a timed glimpse or the virtual home walk.
  // Move that visit onto the real pocket while retaining its earned receipt.
  if (state.phase === CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS && doorCrossing && !doorCrossing.released && !stationRealm) {
    const piece = doorFieldPieces().find((entry) => entry.id === doorCrossing.id && !entry.door.route);
    if (piece) {
      const [a, b] = piece.opening.threshold, n = piece.opening.normal;
      stationRealm = createStationRealm({ variant: piece.door.variant, seed: stationRealmSeed(state.seed, piece.door.variant),
        entryDoorId: piece.id, home: doorCrossing.home, now: stationClockSeconds,
        returnPose: { x: (a.x + b.x) / 2 + n[0] * 2, y: (a.y + b.y) / 2 + n[2] * 2,
          facing: 0, yaw: Math.atan2(-n[0], n[2]), pitch: 0 } });
      if (stationRealm?.home && stationWalk) {
        stationRealm.pose.z = stationWalk.windowAt == null ? 1 + stationWalk.progress * 65 : 67;
        stationRealm.windowReached = stationWalk.windowAt != null;
        stationHomeDiscovered ||= stationRealm.windowReached;
      }
      stationWalk = null;
      doorTakenAt.delete(piece.id);
    }
  }

  return {
    geometry,
    active: () => !!state.active,
    state: () => ({ ...state, sourceDivide:divide?{...divide}:null, station:stationSnapshot(), sourceShore:shore.snapshot(), horizon: { ...state.horizon, unravelling: normalizeSourceUnravelling(horizonUnravelling) }, outskirtsExperience: outskirtsExperienceSnapshot() }),
    setPlayerPosition,
    textSpaceActive,
    localLights,
    sourceRoomMemoryFrame,
    sourceVoidFrame,
    sourceShoreFrame,
    sourceAmbient,
    sourceEmergencyLightingFrame,
    sourceFlashlightFrame,
    landingPortalFrame,
    landingContract: sourceLandingContract,
    sourceLandingHushFrame,
    sourceSensoryFrame,
    settleSourceSensory,
    commitStillPageReveal,
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
    tickHorizon,
    hushApproachFrame,
    // The bell passage: the tower road, walked. See SOURCE_BELLS.
    bellsFrame,
    tickBellField,
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
    cancelHushContact: () => { pendingContact=null;return true; },
    recordHushRadioTalk,
    outskirtPortals,
    sourceVoidDawn,
    sourceVoidBeacon,
    outskirtsBodyFrame,
    doorFieldDoors,
    enterChapelDoor,
    openDoorFieldDoor,
    doorFieldWeather,
    towerDoorView,
    edgeDoorFrame,
    edgeDoorField,
    edgeDoorOpenings,
    openEdgeDoor,
    edgeDoorApproach,
    outskirtsBeatFrame,
    outskirtsStreetFrame, outskirtsPerformAction, setOutskirtsWorldState,
    tickOutskirtsCharacters, outskirtsCharacterFrame, applyOutskirtsCharacterFrame,
    outskirtsWeather,
    outskirtPieceRefuses,
    outskirtLampPools,
    outskirtsPiece,
    phoneBoxPose, setPhoneBoxDoor, setPhoneBoxInside, setPhoneBoxHandset, outskirtsPassAt, outskirtsPassStart,
    setOutskirtsFlurry, outskirtsFlurryLevel: () => outskirtsFlurry,
    outskirtsLastLight, setLastLightOut, setLastLightHold, setLastLightPlayback, outskirtsTapeHead, outskirtsPassBreak, relightPassLamps,
    outskirtsReflection, outskirtsLosing, setTorchPhantom,
    crossesRouteDoor,
    doorFieldLeaks,
    doorCrossingFrame, doorFieldExtras, doorTakeBackFrame: (id, now) => { const piece = doorFieldPieces().find((entry) => entry.id === id); return piece && doorErased(piece) ? doorTakeBack(piece, now) : null; },
    TAKE_BACK_SECONDS, setStationHomeOpen, releaseHomeCrossing, stationEdgeFrame, wrongReturnSpot,
    advanceStationTime, stationTime: crossingClock, stationWalkState, setStationWalkState, stationRelicWorlds,
    stationRealmFrame, moveStationRealm, setStationRealmLook,
    stationRealmHomeState, setStationRealmHomeState, markHomeWindowReached, stationLastRealmReturn,
    enterTowerLand, leaveTowerLand, towerLandState, advanceTowerLand, towerLandFrame, tickTowerLand,
    consumeTowerPersonalReward: consumeTowerPersonalRewardNow, markTowerPersonalRingAnswered,
    towerLandSpots: () => (towerPersonal.active
      ? towerLandPieces().filter(towerLandPresent).map((piece) => ({
        id: piece.id, look: piece.look, mesh: piece.mesh,
        x: piece.x / CELL, y: piece.z / CELL,
      }))
      : []),
    crossingDebug: () => ({ arms: crossingArms, startedAt: doorCrossing?.startedAt ?? null, now: crossingClock(), id: doorCrossing?.id ?? null, wrong: !!doorCrossing?.wrong, released: !!doorCrossing?.released, home: !!doorCrossing?.home }),
    // Tests only: take the bar off a shut door so its world can be looked at.
    unbarDoorFieldDoor: (id) => { const piece = doorFieldPieces().find((entry) => entry.id === id); if (!piece || !piece.door.shut) return false; piece.door.shut = false; return true; },
    stationServiceSpots: () => (doorFieldRoute() === 'tower' ? stationServicePieces().map((piece) => ({ id: piece.id, kind: piece.kind, look: piece.look, x: landscapeOrigin().x + piece.localX, y: landscapeOrigin().y + piece.localY })) : []),
    resolveHushContactChoice,
    handleHushContact,
    sourceSurfaceLines,
    paperTonePoint,
    exitSnapshot,
    probe: () => ({
      ...chunkSurfProbe(state),
      divide:{...sourceDivideProbe((player.x-landscapeOrigin().x)*CELL,(player.y-landscapeOrigin().y)*CELL,divide?.feet),active:divideActiveAt(),body:divide?{...divide}:null,support:divideActiveAt()?divideSupport():null},
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
        recognitions: sourceLandingRecognitions(landscapeOrigin()),
        tableau: sourceLandingHushFrame(),
        portal: landingPortalFrame(),
        void: sourceVoidFrame(),
        shore: sourceShoreFrame(),
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
      hallDesign: { regime: sourceHallRegime(state.hallMaxDistance).id, targetSeconds: SOURCE_HALL.targetSeconds },
      geometryBoundary: {
        physicalBeyondBoundary: !!physicalCellAt(0, SOURCE_HALL_END_Y - 2),
        visualBeyondBoundary: !!renderCellAt(0, SOURCE_HALL_END_Y - 2),
        y: SOURCE_HALL_END_Y,
        metres: SOURCE_HALL_END_METRES,
      },
      realPage: [CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK].includes(state.phase) ? {
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
