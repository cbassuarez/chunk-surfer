import SOURCE_ATLAS from '../../content/chunk-surf/source-atlas.json' with { type: 'json' };
import { CELL, EYE, F, MATERIAL, ZONE } from '../data/floorplan/legend.js';
import { encodeH } from '../world/floorplan.js';
import {
  CHUNK_SURF_HUSH_STAGE,
  CHUNK_SURF_PHASE,
  SOURCE_FINAL_OUTCOME,
  SOURCE_FINAL_STATUS,
  SOURCE_OPTIONAL_TRACES,
  SOURCE_PURSUIT_BEAT,
  chunkSurfCompletion,
  chunkSurfProbe,
  normalizeChunkSurfState,
  pageStageForDistance,
  reduceChunkSurf,
} from './chunk-surf-state.js';
import { chunkSurfRoom } from '../data/chunk-surf-script.js';

export const SOURCE_PLAN_WINDOW = 384;
export const SOURCE_PLAN_SNAP = 16;
export const SOURCE_TRANSFORM_SECONDS = 5.5;
export const SOURCE_ENTRY = Object.freeze({ x: 0, y: 0, facing: 0 });

const HALL_HALF_WIDTH = 6; // runtime cells = three metres from centre to wall
const HALL_CEIL = 4.5;
const HAYSTACK_METRES = 112;
const LANDSCAPE_W = 360; // 180 metres
const LANDSCAPE_H = 340; // 170 metres

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

const checkpointForLandmark = (id) => ['fork-room', 'recordist-loop', 'body-room'].includes(id)
  ? id : id === 'final-page' ? 'body-room' : null;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));
const clamp01 = (value) => clamp(value, 0, 1);
const hash32 = (value) => {
  let x = Number(value) | 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16; return x >>> 0;
};
const rand = (seed, index, salt = 0) => hash32((seed | 0) ^ Math.imul(index + 1, 1597334677) ^ salt) / 4294967295;

function pageCount(distance) {
  const d = Math.max(0, distance);
  if (d < 28) return 180 + Math.floor(d / 28 * 60);
  if (d < 56) return 240 + Math.floor((d - 28) / 28 * 80);
  if (d < 84) return 320 + Math.floor((d - 56) / 28 * 110);
  if (d < 112) return 430 + Math.floor((d - 84) / 28 * 170);
  return 600;
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

export const SOURCE_OBJECTIVE_CONTRACT_VERSION = 1;

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
export function sourceLandscapeFloorAt(localX, localY) {
  const lx = Number(localX) || 0, ly = Number(localY) || 0;
  const depth = Math.max(0, -ly);
  const branch = smoothstep(18, 90, Math.abs(lx)) * smoothstep(48, 105, depth) * (1 - smoothstep(145, 190, depth));
  const approach = 3.2 * smoothstep(28, 86, depth);
  const basin = -1.8 * smoothstep(118, 164, depth);
  const bodyRamp = 4.8 * smoothstep(176, 232, depth);
  const terminalRamp = 8.5 * smoothstep(246, 320, depth);
  // Rolling mounds (broad) + finer unevenness, both slope-bounded so the whole
  // field stays walkable while reading as real terrain rather than a flat plane.
  const mounds = (landNoise(lx * 0.05 + 11, ly * 0.05) - 0.5) * 1.7
    + (landNoise(lx * 0.12 + 37, ly * 0.12) - 0.5) * 0.55;
  return approach + basin + bodyRamp + terminalRamp + branch * 1.4 + mounds;
}

function materialAtLandscape(localX, localY) {
  const p = { x: localX, y: localY };
  if (routeAt(p)) return MATERIAL.sourcePath;
  for (const point of Object.values(LANDMARK_OFFSETS)) {
    if (Math.hypot(localX - point.x, localY - point.y) <= 7) return MATERIAL.sourceFault;
  }
  return MATERIAL.sourceField;
}

function focusedCandidate(px, py, facing, candidates, maxCells = 6) {
  const dir = [[0, -1], [1, 0], [0, 1], [-1, 0]][((facing % 4) + 4) % 4];
  return candidates.map((candidate) => {
    const dx = candidate.x - px, dy = candidate.y - py;
    const distance = Math.hypot(dx, dy);
    const dot = distance > 0.001 ? (dx * dir[0] + dy * dir[1]) / distance : 1;
    return { ...candidate, distance, dot };
  }).filter((candidate) => candidate.distance <= maxCells && candidate.dot >= 0.2)
    .sort((a, b) => (b.dot - a.dot) || (a.distance - b.distance))[0] || null;
}

function lineOfSight(cellAt, a, b) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(distance * 2));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (!cellAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

function aStar(cellAt, start, goal, maxVisited = 30000) {
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
      if (!cellAt(x + 0.5, y + 0.5)) continue;
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
  let player = { x: SOURCE_ENTRY.x, y: SOURCE_ENTRY.y, facing: SOURCE_ENTRY.facing };
  let transformElapsed = 0;
  let lastPlan = null;
  let lastFocus = null;
  let completionSent = false;
  let pathCache = { key: '', path: [] };
  let protectionRemaining = 0;
  let restartGraceRemaining = 0;
  let noProgressSeconds = 0;
  let lastObjectiveDistance = Infinity;
  let lastObjectiveId = '';
  const sceneCache = new Map();
  const trees = treeOffsets(state.seed);
  let sourceCorpusCache = null;

  function setState(next, { immediate = false } = {}) {
    state = normalizeChunkSurfState(next);
    lastPlan = null;
    onState(state, { immediate });
    return state;
  }

  function dispatch(event, options) { return setState(reduceChunkSurf(state, event), options); }
  function landscapeOrigin() { return state.landscapeOrigin || { x: 0, y: -252 }; }
  function landmarkPoint(id) {
    const offset = LANDMARK_OFFSETS[id];
    if (!offset) return null;
    const origin = landscapeOrigin();
    return { id, x: origin.x + offset.x, y: origin.y + offset.y, sector: offset.sector };
  }
  function haystackPagePoint() {
    const origin = state.haystackOrigin || { x: 0, y: -224 };
    const slot = state.interactivePageSlot ?? (state.seed >>> 0) % 12;
    const row = Math.floor(slot / 4), col = slot % 4;
    return { x: origin.x - 4.5 + col * 3, y: origin.y - 14 - row * 5 };
  }

  function inLandscape(x, y) {
    if (![CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return false;
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    const progress=state.phase===CHUNK_SURF_PHASE.TRANSFORMING?clamp01(transformElapsed/SOURCE_TRANSFORM_SECONDS):1;
    const revealedDepth=LANDSCAPE_H*clamp01((progress-.12)/.88);
    return lx >= -LANDSCAPE_W / 2 && lx <= LANDSCAPE_W / 2 && ly <= 4 && ly >= -revealedDepth;
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
    const floor = sourceLandscapeFloorAt(lx, ly);
    return { floor, ceil: floor + 22, flags: F.SKY, zone: ZONE.sourceSpace, material: materialAtLandscape(lx, ly) };
  }

  function hallCell(x, y) {
    if ([CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return null;
    if (Math.abs(x) > HALL_HALF_WIDTH) return null;
    if (y > 3) return null;
    const barrierY = state.haystackOrigin ? state.haystackOrigin.y - 44 : -Infinity;
    if ([CHUNK_SURF_PHASE.HAYSTACK, CHUNK_SURF_PHASE.TRANSFORMING].includes(state.phase) && y <= barrierY) return null;
    const transformCode = state.phase === CHUNK_SURF_PHASE.TRANSFORMING && transformElapsed > SOURCE_TRANSFORM_SECONDS * 0.45;
    return {
      floor: 0,
      ceil: HALL_CEIL,
      flags: 0,
      zone: ZONE.sourceSpace,
      material: transformCode ? MATERIAL.sourcePage : MATERIAL.serviceConcrete,
    };
  }

  function cellAt(x, y) {
    return landscapeCell(x, y) || hallCell(x, y);
  }

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
    cellAt,
    isSolid: (x, y) => !cellAt(x, y),
    canStep(fromX, fromY, toX, toY) {
      const from = cellAt(fromX, fromY), to = cellAt(toX, toY);
      if (!to) return { ok: false, why: 'wall' };
      if (to.ceil - to.floor < EYE + 0.2) return { ok: false, why: 'headroom' };
      if (from && Math.abs(to.floor - from.floor) > 0.45) return { ok: false, why: 'too high' };
      return { ok: true, floor: to.floor };
    },
    floorAt: (x, y) => cellAt(x, y)?.floor ?? 0,
    ceilAt: (x, y) => cellAt(x, y)?.ceil || HALL_CEIL,
    zoneAt: (x, y) => cellAt(x, y)?.zone || ZONE.none,
    materialAt: (x, y) => cellAt(x, y)?.material || MATERIAL.none,
    worldAt: () => 'source_space',
    areaLabelAt: () => 'source space',
    logicalToPhysical: (x, y) => ({ x, z: y, y: cellAt(x, y)?.floor ?? 0, layer: 'source', spaceId: 'source-space', renderGroup: 'source-space' }),
    renderPlanFor(x, y) {
      const half = SOURCE_PLAN_WINDOW / 2;
      const originX = Math.floor((x - half) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP;
      const originY = Math.floor((y - half) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP;
      const routeStateKey = `${state.hasFork ? 1 : 0}:${state.tuned.includes('recordist-loop') ? 1 : 0}:${state.tuned.includes('body-room') ? 1 : 0}`;
      const key = `${state.phase}:${state.pageStage}:${routeStateKey}:${originX}:${originY}`;
      if (lastPlan?.key === key) return lastPlan;
      const size = SOURCE_PLAN_WINDOW;
      const rgba = new Uint8Array(size * size * 4);
      const material = new Uint8Array(size * size);
      const sourceLayer = new Uint8Array(size * size);
      for (let py = 0; py < size; py += 1) for (let px = 0; px < size; px += 1) {
        const c = cellAt(originX + px + 0.5, originY + py + 0.5), i = py * size + px;
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

  function checkpointPosition(id = state.checkpoint?.id || state.checkpointId) {
    if (id === 'hall-entry') return { x: SOURCE_ENTRY.x, y: SOURCE_ENTRY.y, facing: 0 };
    if (id === 'landscape-entry') { const o = landscapeOrigin(); return { x: o.x, y: o.y, facing: 0 }; }
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

  function sourceObjective() {
    const optionalProgress = { resolved: state.optionalTraces.length, total: SOURCE_OPTIONAL_TRACES.length };
    let objective;
    if (state.phase === CHUNK_SURF_PHASE.HALL) {
      objective = { id: 'long-hall', label: 'FOLLOW THE PAPER FIELD', target: { x: 0, y: -(HAYSTACK_METRES / CELL) }, bearingEligible: false };
    } else if (state.phase === CHUNK_SURF_PHASE.HAYSTACK) {
      objective = { id: 'still-page', label: 'FIND THE STILL PAGE', target: haystackPagePoint(), bearingEligible: false };
    } else if (state.phase === CHUNK_SURF_PHASE.TRANSFORMING) {
      objective = { id: 'source-opening', label: 'HOLD THE SOURCE', target: haystackPagePoint(), bearingEligible: false };
    } else if (!state.hasFork) {
      objective = { id: 'fork-gate', label: 'FACE THE FORK GATE — TUNE [F]', target: landmarkPoint('fork-room'), bearingEligible: true };
    } else if (!state.tuned.includes('recordist-loop')) {
      objective = { id: 'recordist-loop', label: 'FACE THE RECORDIST TRACE — TUNE [F]', target: landmarkPoint('recordist-loop'), bearingEligible: true };
    } else if (!state.tuned.includes('body-room')) {
      objective = { id: 'body-return', label: 'FACE BODY RETURN — TUNE [F]', target: landmarkPoint('body-room'), bearingEligible: true };
    } else if (state.phase === CHUNK_SURF_PHASE.FINAL && state.finalEncounter.status !== SOURCE_FINAL_STATUS.RESOLVED) {
      objective = { id: 'final-encounter', label: 'RESOLVE THE FINAL SOURCE', target: landmarkPoint('final-page'), bearingEligible: false };
    } else if (state.phase === CHUNK_SURF_PHASE.COMPLETED) {
      objective = { id: 'tower-crossing', label: 'MOVE FORWARD INTO THE TOWER', target: landmarkPoint('final-page'), bearingEligible: false };
    } else {
      objective = { id: 'final-horizon', label: 'REACH THE FINAL HORIZON', target: landmarkPoint('final-page'), bearingEligible: true };
    }
    const distance = objective.target ? Math.hypot(player.x - objective.target.x, player.y - objective.target.y) : null;
    return {
      schema: SOURCE_OBJECTIVE_CONTRACT_VERSION,
      ...objective,
      optionalProgress,
      bearing: objective.bearingEligible ? compassBearing(player, objective.target) : null,
      distance: Number.isFinite(distance) ? distance : null,
      alignmentPulse: noProgressSeconds >= 6,
    };
  }

  function nearProtectedMoment() {
    if ([CHUNK_SURF_PHASE.HAYSTACK, CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return true;
    if (state.phase !== CHUNK_SURF_PHASE.LANDSCAPE) return false;
    return Object.keys(LANDMARK_OFFSETS).some((id) => {
      const point = landmarkPoint(id);
      return point && Math.hypot(player.x - point.x, player.y - point.y) <= LANDMARK_PAD_RADIUS;
    });
  }

  function hushMode() {
    const protectedMoment = protectionRemaining > 0 || restartGraceRemaining > 0 || nearProtectedMoment();
    const colliding = !!state.pursuitBeat && !protectedMoment;
    return {
      mode: colliding ? 'pursuit' : state.hushStage === CHUNK_SURF_HUSH_STAGE.ABSENT ? 'absent' : 'atmospheric',
      colliding,
      protected: protectedMoment,
      pursuitBeat: state.pursuitBeat,
      restartGrace: restartGraceRemaining,
    };
  }

  function sourceLook() {
    const o = landscapeOrigin();
    const depth = Math.max(0, o.y - player.y);
    const approach = smoothstep(270, 318, depth);
    const resolved = state.finalEncounter.status === SOURCE_FINAL_STATUS.RESOLVED || state.phase === CHUNK_SURF_PHASE.COMPLETED;
    return {
      sunrise: resolved ? 1 : approach,
      chroma: 1 - approach * 0.72,
      paper: resolved ? 1 : smoothstep(286, 318, depth),
    };
  }

  function finalEncounterRequest() {
    if (state.phase !== CHUNK_SURF_PHASE.FINAL || state.finalEncounter.status !== SOURCE_FINAL_STATUS.READY) return null;
    const final = landmarkPoint('final-page');
    if (!final || Math.hypot(player.x - final.x, player.y - final.y) > 12) return null;
    return {
      schema: 1,
      id: 'source-final',
      adapter: 'combat-v1',
      outcomes: Object.values(SOURCE_FINAL_OUTCOME),
      rescueEligible: !!state.profile?.bestEligible
        && SOURCE_OPTIONAL_TRACES.every((id) => state.optionalTraces.includes(id))
        && state.recorded.includes('body-room'),
      compatibility: { redactions: REDACTIONS.map(({ id, sourceAnchor }) => ({ id, sourceAnchor })) },
    };
  }

  function resolveFinalEncounter(result = {}) {
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

  function failFinalEncounter() {
    dispatch({ type: 'FINAL_ENCOUNTER_LOST' }, { immediate: true });
    protectionRemaining = Math.max(protectionRemaining, 4);
    restartGraceRemaining = Math.max(restartGraceRemaining, 4);
    return { handled: true, state, checkpoint: checkpointPosition(state.checkpointId) };
  }

  function focusAt(px, py, facing) {
    const candidates = [];
    if (state.phase === CHUNK_SURF_PHASE.HAYSTACK) candidates.push({ kind: 'haystack-page', id: 'source-page', ...haystackPagePoint() });
    if ([CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase)) {
      for (const id of Object.keys(LANDMARK_OFFSETS)) {
        const point = landmarkPoint(id);
        if (point) candidates.push({ kind: 'landmark', available: available(id), ...point });
      }
    }
    lastFocus = focusedCandidate(px, py, facing, candidates, state.phase === CHUNK_SURF_PHASE.HAYSTACK ? 5 : 8);
    if (state.armedRedaction && (lastFocus?.kind !== 'redaction' || lastFocus.id !== state.armedRedaction)) dispatch({ type: 'REDACTION_CANCELLED' });
    return lastFocus;
  }

  function onStep(from, to) {
    player = { ...player, ...to };
    if (state.phase === CHUNK_SURF_PHASE.HALL) {
      if (to.y > 1 && from.y <= 1) onScare({ reason: 'turned-back', at: { x: to.x, y: to.y } });
      const distance = Math.max(0, -to.y * CELL);
      dispatch({ type: 'HALL_ADVANCED', distance });
      if (distance >= HAYSTACK_METRES) {
        dispatch({ type: 'HAYSTACK_REACHED', origin: { x: to.x, y: to.y }, slot: (state.seed >>> 0) % 12 }, { immediate: true });
      }
      return;
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
      // Movement to the horizon is free, but the final encounter only commits
      // once Body Return is behind you — so exploring ahead early is allowed, it
      // just doesn't skip the beat that earns the ending.
      const bodyReached = state.tuned.includes('body-room') || state.recorded.includes('body-room');
      if (final && Math.hypot(to.x - final.x, to.y - final.y) < 10 && bodyReached) {
        dispatch({ type: 'FINAL_REACHED' }, { immediate: true });
        protectMoment(30);
      }
    }
  }

  function inspectFocused(px, py, facing) {
    const focus = focusAt(px, py, facing);
    if (!focus) return { handled: false };
    if (focus.kind === 'haystack-page') {
      const page = haystackPagePoint();
      dispatch({
        type: 'HAYSTACK_PAGE_FOUND',
        landscapeOrigin: { x: page.x, y: page.y - 8 },
      }, { immediate: true });
      transformElapsed = 0;
      return { handled: true, text: 'One sheet does not move. The source printed on it lifts before the paper does.', event: 'page-found' };
    }
    if (focus.kind === 'landmark') {
      if (!focus.available) return { handled: true, text: 'The source is present, but its call site has not been reached.' };
      dispatch({ type: 'LANDMARK_VISITED', id: focus.id });
      protectMoment(5);
      const room = chunkSurfRoom(focus.id);
      return { handled: true, text: room.inspect, source: exactLine(focus.sector, 0) };
    }
    return { handled: false };
  }

  function tuneFocused(px, py, facing) {
    const focus = focusAt(px, py, facing);
    // Unhandled (not a nagging thought) whenever there is nothing to tune, so the
    // caller is free to fall through to the ordinary torch. The fork only speaks
    // when a reachable landmark is actually in focus.
    if (!focus || focus.kind !== 'landmark') return { handled: false };
    if (!focus.available) return { handled: false };
    if (!state.hasFork && focus.id !== 'fork-room') return { handled: false };
    dispatch({ type: 'LANDMARK_TUNED', id: focus.id }, { immediate: true });
    const checkpointId = checkpointForLandmark(focus.id);
    if (checkpointId) dispatch({ type: 'CHECKPOINT_SET', id: checkpointId }, { immediate: true });
    protectMoment(5);
    const room = chunkSurfRoom(focus.id);
    return { handled: true, text: room.tune, event: focus.id === 'fork-room' ? 'fork' : 'tuned' };
  }

  function recordFocused(px, py, facing) {
    const focus = focusAt(px, py, facing);
    // Silent (unhandled) unless there is an available landmark to record — no
    // "nothing answers here" nag while you are just moving through the field.
    if (!focus || focus.kind !== 'landmark') return { handled: false };
    if (!focus.available) return { handled: false };
    if (!state.hasFork) return { handled: false };
    dispatch({ type: 'LANDMARK_RECORDED', id: focus.id }, { immediate: true });
    const checkpointId = checkpointForLandmark(focus.id);
    if (checkpointId) dispatch({ type: 'CHECKPOINT_SET', id: checkpointId }, { immediate: true });
    protectMoment(5);
    return { handled: true, text: chunkSurfRoom(focus.id).record, event: 'recorded' };
  }

  function tick(dt, { px = player.x, py = player.y, facing = player.facing } = {}) {
    player = { x: px, y: py, facing };
    const elapsed = Math.max(0, Number(dt) || 0);
    protectionRemaining = Math.max(0, protectionRemaining - elapsed);
    restartGraceRemaining = Math.max(0, restartGraceRemaining - elapsed);
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
    } else if (Number.isFinite(distance) && !nearProtectedMoment()) {
      noProgressSeconds += elapsed;
    }
  }

  function pageInstances(px, py, {time=0,reducedMotion=false}={}) {
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
      });
    }
    if (state.phase === CHUNK_SURF_PHASE.HAYSTACK || state.phase === CHUNK_SURF_PHASE.TRANSFORMING) {
      const correct = haystackPagePoint();
      out.push({
        id: 'source-sheet-interactive',
        mesh: 'loose_note',
        matrix: sourceMatrix({ x: correct.x * CELL, y: 0.021, z: correct.y * CELL, scaleX: 1.08, scaleY: 1.08, scaleZ: 1.08 }),
        zone: ZONE.sourceSpace,
        structural: false,
        interactiveId: 'source-page',
      });
    }
    return out;
  }

  function pageTextInstances(px, py, options) {
    const pages = pageInstances(px, py, options);
    return pages.map((page, index) => {
      const line = exactLine('hall', index);
      const m = page.matrix || identity();
      // The text plane is slightly enlarged and lifted to prevent z-fighting.
      const decal = new Float32Array(m);
      decal[12]+=m[4]*.008;decal[13]+=m[5]*.008;decal[14]+=m[6]*.008;
      return {
        id: `source-sheet-text-${index}`,
        sourceId: line?.id,
        text: line?.text || '',
        matrix: mul(decal,mul(rotX(-Math.PI/2),scale(0.28,0.28,0.28))),
        color: [0.16, 0.18, 0.16, 0.92],
        semantic: 'page-source',
      };
    });
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
    if (state.phase === CHUNK_SURF_PHASE.FINAL || state.phase === CHUNK_SURF_PHASE.COMPLETED) {
      const final = landmarkPoint('final-page');
      for (const redaction of REDACTIONS) {
        const line = sourceLineByAnchor(redaction.sourceAnchor);
        out.push({
          id: `source-redaction-${redaction.id}`,
          sourceId: line?.id,
          text: line?.text || '',
          matrix: sourceMatrix({ x: final.x + redaction.dx, y: 1.5, z: final.y - 4, scaleX: 3.6, scaleY: 0.58 }),
          color: state.redaction === redaction.id ? [0.015, 0.015, 0.015, 1]
            : state.armedRedaction === redaction.id ? [1, 0.08, 0.05, 1]
              : state.armedRedaction ? [0.24, 0.24, 0.23, 0.55] : [0.96, 0.93, 0.82, 1],
          semantic: `redaction:${redaction.id}`,
          interactiveId: redaction.id,
        });
      }
    }
    return out;
  }

  function hushTextInstances(presence = null, time = 0) {
    if (![CHUNK_SURF_HUSH_STAGE.STALK, CHUNK_SURF_HUSH_STAGE.HUNT, CHUNK_SURF_HUSH_STAGE.FINAL].includes(state.hushStage)) return [];
    let hx = presence?.x, hy = presence?.y, speed = Number(presence?.speed) || 0;
    const velocity=presence?.velocity||{x:0,y:0};
    const bodyYaw=Math.hypot(Number(velocity.x)||0,Number(velocity.y)||0)>.02
      ?Math.atan2(Number(velocity.x)||0,-(Number(velocity.y)||0)):0;
    if (!Number.isFinite(hx) || !Number.isFinite(hy)) {
      // No live presence yet (just spawned): stand it a little way off toward
      // Body Return so it reads as already out there, about to move.
      const body = landmarkPoint('body-room');
      hx = body.x - 18; hy = body.y + 9; speed = 0;
    }
    if (state.phase === CHUNK_SURF_PHASE.COMPLETED) {
      const final = landmarkPoint('final-page'); hx = final.x - 14; hy = final.y - 10; speed = 0;
    }
    const phase = time * (speed > 1 ? 7 : speed > 0.1 ? 3.5 : 0.8);
    const gait = Math.sin(phase) * clamp01(speed / 2);
    const lines = sourceLines('hush');
    const parts = [
      { name: 'head', x: 0, y: 2.12, z: 0, sx: 1.05, sy: 0.28 },
      { name: 'torso-a', x: 0, y: 1.65, z: 0, sx: 1.75, sy: 0.32 },
      { name: 'torso-b', x: 0, y: 1.28, z: 0, sx: 1.55, sy: 0.30 },
      { name: 'arm-l', x: -0.75, y: 1.48 + gait * 0.12, z: 0, sx: 1.0, sy: 0.22, roll: -0.55 - gait * 0.45 },
      { name: 'arm-r', x: 0.75, y: 1.48 - gait * 0.12, z: 0, sx: 1.0, sy: 0.22, roll: 0.55 - gait * 0.45 },
      { name: 'leg-l', x: -0.30, y: 0.72, z: gait * 0.16, sx: 0.95, sy: 0.24, roll: -0.15 + gait * 0.55 },
      { name: 'leg-r', x: 0.30, y: 0.72, z: -gait * 0.16, sx: 0.95, sy: 0.24, roll: 0.15 - gait * 0.55 },
      { name: 'foot-l', x: -0.34, y: 0.15, z: gait * 0.28, sx: 0.72, sy: 0.20 },
      { name: 'foot-r', x: 0.34, y: 0.15, z: -gait * 0.28, sx: 0.72, sy: 0.20 },
    ];
    // A body assembled from full source lines (the hush is made of the same code
    // as the field it wears). Each part carries exact atlas provenance so it
    // honours the same contract as the architecture around it.
    return parts.map((part, index) => {
      const line = lines[(index * 7) % Math.max(1, lines.length)];
      return {
        id: `source-hush-${part.name}`,
        sourceId: line?.id,
        sourceFile: line?.file,
        sourceLine: line?.line,
        sourceHash: line?.hash,
        text: line?.text || '',
        matrix: sourceMatrix({ x: hx + part.x, y: part.y, z: hy + part.z, scaleX: part.sx, scaleY: part.sy, yaw:bodyYaw, roll: part.roll || 0 }),
        color: index % 3 === 0 ? [0.96, 0.92, 0.80, 1] : [1, 0.08, 0.045, 1],
        semantic: 'source-hush',
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

  const sectorAtHallDepth = (depth) => ['hall', 'recordist', 'student', 'workOrder', 'body', 'hush'][Math.abs(Math.floor(depth / 18)) % 6];
  const routeVisual = (localX, localY) => {
    const route = routeAt({ x: localX, y: localY });
    if (route?.id === 'surfer-loop') return { sector: 'student', color: [0.10, 0.86, 1, 0.88] };
    if (route?.id === 'work-order-loop') return { sector: 'workOrder', color: [1, 0.30, 0.14, 0.88] };
    if (route?.id === 'final-causeway') return { sector: 'final', color: [0.86, 0.92, 0.82, 0.92] };
    return { sector: sectorAtHallDepth(localY), color: [0.42, 1, 0.62, 0.88] };
  };

  function landscapeArchitectureTextInstances(px, py) {
    if (![CHUNK_SURF_PHASE.TRANSFORMING,CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return [];
    const out = [];
    const o = landscapeOrigin();
    const rowCenter = Math.floor(py / 2) * 2;
    // The floor SURFACE, tiled densely in source and hugging the terrain in both
    // axes — the code IS the ground, following every mound and dip, not a rug laid
    // on a flat plane.
    for (let row = -34; row <= 22; row += 2) {
      const worldZ = rowCenter + row;
      for (let lane = -7; lane <= 7; lane += 1) {
        const worldX=px+lane*4.5;
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
          id: `source-field-floor-${rowCenter}-${row}-${lane}`,
          sector: visual.sector, lineIndex: Math.abs(row * 11 + lane * 17), redact: (row + lane) % 10 === 0,
          x: worldX * CELL, y: cell.floor + 0.014 + Math.abs(lane) * 0.001, z: worldZ * CELL + lane * 0.045,
          scaleX: 4.7, scaleY: 0.34,
          pitch: rampPitch, yaw: lane * 0.028, roll: rollTilt,
          color: lane % 2 ? visual.color.map((value,index)=>index===3?value:value*.82) : visual.color,
          semantic: 'text-architecture:ramp', overlapLayer: lane === 0 ? 'base' : 'overlap', platformHeight: cell.floor,
        }));
      }
    }

    // Text monoliths sit outside every walkable causeway and landmark pad, so
    // their visual mass never implies a hidden collision volume on the route.
    for(let index=0;index<trees.length;index+=1){
      const tree=trees[index],worldX=o.x+tree.x,worldZ=o.y+tree.y;
      if(routeAt(tree)||onLandmarkPad(tree))continue;
      if(Math.hypot((worldX-px)*CELL,(worldZ-py)*CELL)>46)continue;
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
    const localDepth=Math.max(0,Math.floor((o.y-py)/24)*24);
    for(let frame=-4;frame<=4;frame+=1){
      const depth=localDepth+frame*24;
      if(depth<18||depth>LANDSCAPE_H-12)continue;
      const worldZ=o.y-depth,base=sourceLandscapeFloorAt(0,-depth);
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
    if (Math.hypot((fork.x - px) * CELL, (fork.y - py) * CELL) < 72) {
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
      if (Math.hypot(x - px * CELL, z - py * CELL) > 54) continue;
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
    if(Math.hypot((final.x-px)*CELL,(final.y-py)*CELL)<90){
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

    // The field's edge is a WALL OF CODE, not an invisible boundary. Where the
    // ground runs out at the left/right perimeter, tall columns of source strings
    // stand up out of the floor so you can SEE the wall — the "made of code" of
    // the space, made literal. Only rendered near the player's edge; the interior
    // is open sky, no walls (Oblivion).
    const halfW = LANDSCAPE_W / 2;
    for (const side of [-1, 1]) {
      const edgeWorldX = o.x + side * halfW;
      if (Math.abs((edgeWorldX - px) * CELL) > 64) continue;
      const zCenter = Math.floor(py / 4) * 4;
      for (let dz = -24; dz <= 24; dz += 4) {
        const worldZ = zCenter + dz;
        const localY = worldZ - o.y;
        if (localY > 4 || localY < -LANDSCAPE_H) continue;
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
      REDACTIONS.forEach((redaction, index) => out.push(sourcePanel({
        id: `source-text-redaction-${redaction.id}`, sector: 'final', lineIndex: 9 + index, redact: true,
        x: (final.x + redaction.dx) * CELL, y: base+1.15, z: (final.y - 4) * CELL,
        scaleX: 3.4, scaleY: 0.36,
        color: state.armedRedaction === redaction.id ? [1, 0.16, 0.10, 1] : [0.88, 0.94, 0.86, 1],
        semantic: `text-endpoint:redaction:${redaction.id}`, interactiveId: redaction.id,
      })));
    }
    return out;
  }

  function proofHushTextInstances(presence = null, time = 0) {
    if (![CHUNK_SURF_HUSH_STAGE.STALK, CHUNK_SURF_HUSH_STAGE.HUNT, CHUNK_SURF_HUSH_STAGE.FINAL].includes(state.hushStage)) return [];
    // Follow the live presence whenever it is on the board — during the quiet
    // stalk as well as the scripted pursuits — so the body is visibly in motion,
    // not pinned beside Body Return. Only fall back to the static pose when no
    // presence is driving it (e.g. before it has spawned).
    let hx = Number(presence?.x), hy = Number(presence?.y);
    if (!Number.isFinite(hx) || !Number.isFinite(hy)) {
      const body = landmarkPoint('body-room'); hx = body.x - 18; hy = body.y + 9;
    }
    const sway = Math.sin(time * 1.6) * 0.08;
    const o=landscapeOrigin(),base=sourceLandscapeFloorAt(hx-o.x,hy-o.y);
    return Array.from({ length: 11 }, (_, row) => sourcePanel({
      id: `source-text-hush-${row}`, sector: 'hush', lineIndex: row * 7 + 3, redact: row % 4 === 0,
      x: hx * CELL + (row % 2 ? sway : -sway), y: base+0.25 + row * 0.3, z: hy * CELL,
      scaleX: 2.25 - Math.abs(5 - row) * 0.09, scaleY: 0.24,
      color: row % 2 ? [1, 0.12, 0.08, 1] : [0.92, 0.96, 0.86, 1],
      semantic: 'text-actor:hush', overlapLayer: row % 2 ? 'overlap' : 'base',
    }));
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

  function surfaceArchitectureInstances(px, py) {
    if (![CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) return [];
    const o = landscapeOrigin();
    const out = [];
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

  function propInstances(px = player.x, py = player.y, options = {}) {
    if ([CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK, CHUNK_SURF_PHASE.TRANSFORMING].includes(state.phase)) return pageInstances(px, py, options);
    if ([CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(state.phase)) {
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
    const chunkSize = 64;
    const chunkX = Math.floor(px / chunkSize);
    const chunkY = Math.floor(py / chunkSize);
    const progressKey = `${state.phase}:${state.hasFork ? 1 : 0}:${state.tuned.includes('recordist-loop') ? 1 : 0}:${state.tuned.includes('body-room') ? 1 : 0}`;
    const key = `${progressKey}:${chunkX}:${chunkY}`;
    if (!sceneCache.has(key)) {
      sceneCache.set(key, landscapeArchitectureTextInstances(chunkX * chunkSize + chunkSize / 2, chunkY * chunkSize + chunkSize / 2));
      if (sceneCache.size > 32) sceneCache.delete(sceneCache.keys().next().value);
    }
    return { key, instances: sceneCache.get(key) };
  }

  function sourceScene({ px = player.x, py = player.y, presence = null, time = 0, reducedMotion = false } = {}) {
    const cached = cachedArchitecture(px, py);
    const dynamicInstances = [
      ...interactionTextInstances(),
      ...hushTextInstances(presence?.active ? presence : null, reducedMotion ? 0 : time),
    ];
    return {
      schema: 1,
      key: cached.key,
      atlasKey: `${SOURCE_ATLAS.schemaVersion}:${SOURCE_ATLAS.corpusHash || Object.keys(SOURCE_ATLAS.entries || {}).length}`,
      corpus: sourceCorpus(),
      staticInstances: cached.instances,
      dynamicInstances,
      look: sourceLook(),
      objective: sourceObjective(),
    };
  }

  function textInstances({ px = player.x, py = player.y, presence = null, time = 0, reducedMotion=false } = {}) {
    const scene = sourceScene({ px, py, presence, time, reducedMotion });
    return [...scene.staticInstances, ...scene.dynamicInstances];
  }

  const navigation = {
    canOccupy: (x, y) => !!cellAt(x, y),
    resolveMove(from, target, maxDistance) {
      if (lineOfSight(cellAt, from, target)) {
        const dx = target.x - from.x, dy = target.y - from.y, d = Math.hypot(dx, dy);
        if (d < 0.001) return { ...from };
        const step = Math.min(d, maxDistance);
        const direct = { x: from.x + dx / d * step, y: from.y + dy / d * step };
        if (cellAt(direct.x, direct.y)) return direct;
      }
      const key = `${Math.floor(from.x)},${Math.floor(from.y)}:${Math.floor(target.x)},${Math.floor(target.y)}`;
      if (pathCache.key !== key || pathCache.path.length < 2) pathCache = { key, path: aStar(cellAt, from, target) };
      while (pathCache.path.length > 1 && Math.hypot(pathCache.path[0].x - from.x, pathCache.path[0].y - from.y) < 0.45) pathCache.path.shift();
      const next = pathCache.path[0];
      if (!next) return { ...from };
      const dx = next.x - from.x, dy = next.y - from.y, d = Math.hypot(dx, dy);
      const step = Math.min(d, maxDistance);
      const moved = d > 0.001 ? { x: from.x + dx / d * step, y: from.y + dy / d * step } : { ...from };
      return cellAt(moved.x, moved.y) ? moved : { ...from };
    },
  };

  function handleHushContact() {
    if (!hushMode().colliding) return checkpointPosition();
    dispatch({ type: 'HUSH_CONTACT' }, { immediate: true });
    restartGraceRemaining = 4;
    protectionRemaining = Math.max(protectionRemaining, 1.25);
    return checkpointPosition();
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
      hush: { x: final.x - 14, y: final.y - 10, pose: 'standing', source: 'hush' },
      sourceIds: REDACTIONS.map((entry) => sourceLineByAnchor(entry.sourceAnchor)?.id).filter(Boolean),
    };
  }

  function setPlayerPosition(next) { player = { ...player, ...(next || {}) }; }

  return {
    geometry,
    active: () => !!state.active,
    state: () => state,
    setPlayerPosition,
    onStep,
    tick,
    focusAt,
    inspectFocused,
    tuneFocused,
    recordFocused,
    propInstances,
    textInstances,
    sourceScene,
    sourceObjective,
    sourceLook,
    hushMode,
    protectMoment,
    finalEncounterRequest,
    resolveFinalEncounter,
    failFinalEncounter,
    navigation,
    checkpointPosition,
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
      sourceSceneCacheSize: sceneCache.size,
      sourceSceneKey: sourceScene({ presence: null }).key,
      visibleGlyphs: textInstances({ presence: null }).reduce((sum, entry) => sum + String(entry.text || '').length, 0),
    }),
  };
}

export { SOURCE_ATLAS };
