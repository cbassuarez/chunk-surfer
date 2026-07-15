import SOURCE_ATLAS from '../../content/chunk-surf/source-atlas.json' with { type: 'json' };
import { CELL, EYE, F, MATERIAL, ZONE } from '../data/floorplan/legend.js';
import { encodeH } from '../world/floorplan.js';
import {
  CHUNK_SURF_HUSH_STAGE,
  CHUNK_SURF_PHASE,
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
const LANDSCAPE_W = 144; // 72 metres
const LANDSCAPE_H = 128; // 64 metres

const LANDMARK_OFFSETS = Object.freeze({
  'fork-room': { x: 0, y: -20, sector: 'fork' },
  'surfer-origin': { x: -44, y: -48, sector: 'student' },
  'work-order-loop': { x: 44, y: -48, sector: 'workOrder' },
  'recordist-loop': { x: 0, y: -58, sector: 'recordist' },
  'body-room': { x: 0, y: -92, sector: 'body' },
  'final-page': { x: 40, y: -106, sector: 'final' },
});

const REDACTIONS = Object.freeze([
  { id: 'comfort', sourceAnchor: 'source-not-body', dx: -10 },
  { id: 'body', sourceAnchor: 'borrowed-body-return', dx: 0 },
  { id: 'source', sourceAnchor: 'source-you', dx: 10 },
]);
const SOURCE_LAYER_BY_SECTOR=Object.freeze({hall:1,fork:2,recordist:3,student:4,workOrder:5,body:6,final:7,hush:8});

const checkpointForLandmark = (id) => id === 'final-page' ? 'body-room' : id;
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
  if (d < 28) return 1;
  if (d < 56) return 1 + Math.floor((d - 28) / 28 * 15);
  if (d < 84) return 16 + Math.floor((d - 56) / 28 * 80);
  if (d < 112) return 96 + Math.floor((d - 84) / 28 * 264);
  return 600;
}

function sourceLines(sectorId) {
  return SOURCE_ATLAS.sectors?.[sectorId]?.sourceLines || SOURCE_ATLAS.sectors?.hall?.sourceLines || [];
}

function exactLine(sectorId, index = 0) {
  const lines = sourceLines(sectorId);
  return lines.length ? lines[((index % lines.length) + lines.length) % lines.length] : null;
}

function sourceLineByAnchor(anchor) {
  for (const entry of Object.values(SOURCE_ATLAS.entries || {})) {
    if (entry.text.includes(anchor)) return entry;
  }
  return exactLine('final', 0);
}

export function validateSourceAtlas(atlas = SOURCE_ATLAS) {
  const errors = [];
  if (atlas?.schemaVersion !== 2) errors.push('schemaVersion must equal 2');
  if (!atlas?.exactSource) errors.push('exactSource must be true');
  for (const [sectorId, sector] of Object.entries(atlas?.sectors || {})) {
    if ((sector.sourceLines || []).length < 8) errors.push(`${sectorId} has too few source lines`);
    for (const line of sector.sourceLines || []) {
      if (!line.file || !Number.isFinite(line.line) || !line.text || !Number.isFinite(line.hash)) errors.push(`${sectorId} contains invalid provenance`);
      if (/https?:\/\//i.test(line.text) || /\/Users\//.test(line.text)) errors.push(`${sectorId} contains unsafe source`);
    }
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
const translate = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, x, y, z, 1]);
const scale = (x, y, z) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };

export function sourceMatrix({ x = 0, y = 0, z = 0, scaleX = 1, scaleY = 1, scaleZ = 1, pitch = 0, yaw = 0, roll = 0 } = {}) {
  return mul(translate(x, y, z), mul(rotY(yaw), mul(rotX(pitch), mul(rotZ(roll), scale(scaleX, scaleY, scaleZ)))));
}

function treeOffsets(seed = 4417) {
  const out = [];
  for (let i = 0; i < 34; i += 1) {
    const side = i % 2 ? 1 : -1;
    const x = side * (20 + rand(seed, i, 11) * 44);
    const y = -18 - rand(seed, i, 29) * 88;
    if (Math.hypot(x, y + 58) < 15 || Math.hypot(x - 40, y + 106) < 15) continue;
    out.push({ x, y, radius: 2 + rand(seed, i, 47) * 2.5 });
  }
  return out;
}

function distanceToSegment(point, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = point.x - a.x, wy = point.y - a.y;
  const t = clamp01((wx * vx + wy * vy) / Math.max(0.0001, vx * vx + vy * vy));
  return Math.hypot(point.x - (a.x + vx * t), point.y - (a.y + vy * t));
}

const PATHS = Object.freeze([
  [{ x: 0, y: 0 }, { x: 0, y: -58 }, { x: 0, y: -92 }],
  [{ x: 0, y: -20 }, { x: -44, y: -48 }],
  [{ x: 0, y: -20 }, { x: 44, y: -48 }],
  [{ x: 0, y: -92 }, { x: 40, y: -106 }],
]);

function materialAtLandscape(localX, localY) {
  const p = { x: localX, y: localY };
  for (const path of PATHS) for (let i = 0; i < path.length - 1; i += 1) {
    if (distanceToSegment(p, path[i], path[i + 1]) <= 3.2) return MATERIAL.sourcePath;
  }
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

function aStar(cellAt, start, goal, maxVisited = 5000) {
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
  const trees = treeOffsets(state.seed);

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

  function landscapeCell(x, y) {
    const o = landscapeOrigin(), lx = x - o.x, ly = y - o.y;
    if (!inLandscape(x, y)) return null;
    const edge = Math.min(LANDSCAPE_W / 2 - Math.abs(lx), ly + LANDSCAPE_H, 4 - ly);
    if (edge < 1) return null;
    for (const tree of trees) {
      if (Math.hypot(lx - tree.x, ly - tree.y) < tree.radius * 0.45) return null;
    }
    for(const point of Object.values(LANDMARK_OFFSETS)){
      if(Math.hypot(lx-point.x,ly-point.y)<1.35)return null;
    }
    // A few code ridges shape navigation without turning the field into the old graph.
    if (Math.abs(lx) > 16 && Math.abs(ly + 72) < 2.2 && Math.abs(lx) < 58) {
      if (Math.abs(lx - 32) > 7 && Math.abs(lx + 32) > 7) return null;
    }
    return { floor: 0, ceil: 12, flags: F.SKY, zone: ZONE.sourceSpace, material: materialAtLandscape(lx, ly) };
  }

  function hallCell(x, y) {
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
    floorAt: (x, y) => cellAt(x, y)?.floor || 0,
    ceilAt: (x, y) => cellAt(x, y)?.ceil || HALL_CEIL,
    zoneAt: (x, y) => cellAt(x, y)?.zone || ZONE.none,
    materialAt: (x, y) => cellAt(x, y)?.material || MATERIAL.none,
    worldAt: () => 'source_space',
    areaLabelAt: () => 'source space',
    logicalToPhysical: (x, y) => ({ x, z: y, y: cellAt(x, y)?.floor || 0, layer: 'source', spaceId: 'source-space', renderGroup: 'source-space' }),
    renderPlanFor(x, y) {
      const half = SOURCE_PLAN_WINDOW / 2;
      const originX = Math.floor((x - half) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP;
      const originY = Math.floor((y - half) / SOURCE_PLAN_SNAP) * SOURCE_PLAN_SNAP;
      const key = `${state.phase}:${state.pageStage}:${originX}:${originY}`;
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

  function checkpointPosition(id = state.checkpointId) {
    if (id === 'hall-entry') return { x: SOURCE_ENTRY.x, y: SOURCE_ENTRY.y, facing: 0 };
    if (id === 'landscape-entry') { const o = landscapeOrigin(); return { x: o.x, y: o.y, facing: 0 }; }
    const point = landmarkPoint(id);
    return point ? { x: point.x, y: point.y + 7, facing: 0 } : { x: SOURCE_ENTRY.x, y: SOURCE_ENTRY.y, facing: 0 };
  }

  function available(id) {
    if (id === 'fork-room') return true;
    if (['surfer-origin', 'work-order-loop', 'recordist-loop'].includes(id)) return state.hasFork;
    if (id === 'body-room') return state.hasFork && state.tuned.includes('recordist-loop');
    if (id === 'final-page') return state.tuned.includes('body-room');
    return false;
  }

  function focusAt(px, py, facing) {
    const candidates = [];
    if (state.phase === CHUNK_SURF_PHASE.HAYSTACK) candidates.push({ kind: 'haystack-page', id: 'source-page', ...haystackPagePoint() });
    if ([CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase)) {
      for (const id of Object.keys(LANDMARK_OFFSETS)) {
        const point = landmarkPoint(id);
        if (point) candidates.push({ kind: 'landmark', available: available(id), ...point });
      }
      if (state.phase === CHUNK_SURF_PHASE.FINAL) {
        const final = landmarkPoint('final-page');
        for (const redaction of REDACTIONS) {
          candidates.push({ kind: 'redaction', id: redaction.id, sourceAnchor: redaction.sourceAnchor, x: final.x + redaction.dx, y: final.y - 4 });
        }
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
      for (const id of Object.keys(LANDMARK_OFFSETS)) {
        const point = landmarkPoint(id);
        if (point && Math.hypot(to.x - point.x, to.y - point.y) < 9) dispatch({ type: 'LANDMARK_VISITED', id });
      }
      const final = landmarkPoint('final-page');
      if (final && Math.hypot(to.x - final.x, to.y - final.y) < 10 && available('final-page')) dispatch({ type: 'FINAL_REACHED' });
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
    if (focus.kind === 'redaction') {
      if (state.armedRedaction === focus.id) {
        dispatch({ type: 'REDACTION_CONFIRMED', id: focus.id }, { immediate: true });
        dispatch({ type: 'SOURCE_COMPLETED' }, { immediate: true });
        if (!completionSent) {
          completionSent = true;
          onComplete(chunkSurfCompletion(state), exitSnapshot());
        }
        return { handled: true, text: chunkSurfRoom('final-page').redactions.find((entry) => entry.id === focus.id)?.result || 'The line goes black.', event: 'completed' };
      }
      dispatch({ type: 'REDACTION_ARMED', id: focus.id });
      return { handled: true, text: 'The clause lifts out of the file. Touch it again to make the redaction permanent.', event: 'redaction-armed' };
    }
    if (focus.kind === 'landmark') {
      if (!focus.available) return { handled: true, text: 'The source is present, but its call site has not been reached.' };
      dispatch({ type: 'LANDMARK_VISITED', id: focus.id });
      const room = chunkSurfRoom(focus.id);
      return { handled: true, text: room.inspect, source: exactLine(focus.sector, 0) };
    }
    return { handled: false };
  }

  function maybeStartHunt() {
    const branchResolved = ['recordist-loop', 'surfer-origin', 'work-order-loop']
      .some((id) => state.tuned.includes(id) || state.recorded.includes(id));
    if (branchResolved && state.hushStage === CHUNK_SURF_HUSH_STAGE.STALK) dispatch({ type: 'HUSH_HUNT_STARTED' }, { immediate: true });
  }

  function tuneFocused(px, py, facing) {
    const focus = focusAt(px, py, facing);
    if (!focus || focus.kind !== 'landmark') return { handled: false };
    if (!focus.available) return { handled: true, text: 'The false line does not answer yet.' };
    if (!state.hasFork && focus.id !== 'fork-room') return { handled: true, text: 'Nothing in your hand can make this source vibrate.' };
    dispatch({ type: 'LANDMARK_TUNED', id: focus.id }, { immediate: true });
    dispatch({ type: 'CHECKPOINT_SET', id: checkpointForLandmark(focus.id) }, { immediate: true });
    maybeStartHunt();
    const room = chunkSurfRoom(focus.id);
    return { handled: true, text: room.tune, event: focus.id === 'fork-room' ? 'fork' : 'tuned' };
  }

  function recordFocused(px, py, facing) {
    const focus = focusAt(px, py, facing);
    if (!focus || focus.kind !== 'landmark') return { handled: false };
    if (!focus.available) return { handled: true, text: 'The recorder finds no stable address here.' };
    if (!state.hasFork) return { handled: true, text: 'The transport clicks. The source behind it does not hold still.' };
    dispatch({ type: 'LANDMARK_RECORDED', id: focus.id }, { immediate: true });
    dispatch({ type: 'CHECKPOINT_SET', id: checkpointForLandmark(focus.id) }, { immediate: true });
    maybeStartHunt();
    return { handled: true, text: chunkSurfRoom(focus.id).record, event: 'recorded' };
  }

  function tick(dt, { px = player.x, py = player.y, facing = player.facing } = {}) {
    player = { x: px, y: py, facing };
    if (state.phase === CHUNK_SURF_PHASE.TRANSFORMING) {
      transformElapsed = Math.min(SOURCE_TRANSFORM_SECONDS, transformElapsed + Math.max(0, dt));
      if (transformElapsed >= SOURCE_TRANSFORM_SECONDS) dispatch({ type: 'TRANSFORMATION_COMPLETED' }, { immediate: true });
    }
    focusAt(px, py, facing);
  }

  function pageInstances(px, py, {time=0,reducedMotion=false}={}) {
    if (![CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK, CHUNK_SURF_PHASE.TRANSFORMING].includes(state.phase)) return [];
    const count = pageCount(state.hallMaxDistance);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const r0 = rand(state.seed, i, 101), r1 = rand(state.seed, i, 211), r2 = rand(state.seed, i, 307);
      let rx, ry, elevation, pitch, yaw, roll;
      if (i === 0) {
        rx = 0; ry = -24; elevation = 0.018; pitch = 0; yaw = 0.06; roll = 0;
      } else {
        // Placement is world-authoritative and seed-derived. It never follows
        // the player or disappears on retreat; only the visible render window
        // moves around the persistent procedural addresses.
        const reach = Math.max(36, Math.min(280, state.hallMaxDistance / CELL + 42));
        ry = -18 - r0 * reach;
        const surface = i % 5;
        if (surface === 0 || surface === 1) {
          rx = surface === 0 ? -HALL_HALF_WIDTH + 0.12 : HALL_HALF_WIDTH - 0.12;
          elevation = 0.35 + r1 * 3.6; pitch = Math.PI / 2; yaw = surface === 0 ? Math.PI / 2 : -Math.PI / 2; roll = (r2 - 0.5) * 0.45;
        } else if (surface === 2 && state.pageStage >= 3) {
          rx = (r1 - 0.5) * HALL_HALF_WIDTH * 1.7; elevation = HALL_CEIL - 0.08; pitch = Math.PI; yaw = r2 * Math.PI * 2; roll = 0;
        } else {
          rx = (r1 - 0.5) * HALL_HALF_WIDTH * 1.72; elevation = 0.018; pitch = 0; yaw = r2 * Math.PI * 2; roll = (r0 - 0.5) * 0.16;
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
        matrix: sourceMatrix({ x: rx * CELL, y: elevation, z: ry * CELL, scaleX: 1.05, scaleY: 1.05, scaleZ: 1.05, pitch, yaw, roll }),
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
            x: (o.x + tree.x) * CELL,
            y: 0.35 + layer * 0.62,
            z: (o.y + tree.y) * CELL,
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
          matrix: sourceMatrix({ x: p.x * CELL, y: 0.4 + lineIndex * 0.48, z: p.y * CELL, scaleX: 2.6, scaleY: 0.34, yaw: (lineIndex % 2 ? Math.PI / 2 : 0) }),
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
          matrix: sourceMatrix({ x: (final.x + redaction.dx) * CELL, y: 1.5, z: (final.y - 4) * CELL, scaleX: 3.6, scaleY: 0.58 }),
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
    if (!Number.isFinite(hx) || !Number.isFinite(hy) || state.hushStage === CHUNK_SURF_HUSH_STAGE.STALK) {
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
    return parts.map((part, index) => {
      const line = lines[(index * 7) % Math.max(1, lines.length)];
      return {
        id: `source-hush-${part.name}`,
        sourceId: line?.id,
        text: line?.tokens?.find((token) => token.kind === 'identifier')?.text || line?.text || '',
        matrix: sourceMatrix({ x: hx * CELL + part.x, y: part.y, z: hy * CELL + part.z, scaleX: part.sx, scaleY: part.sy, yaw:bodyYaw, roll: part.roll || 0 }),
        color: index % 3 === 0 ? [0.96, 0.92, 0.80, 1] : [1, 0.08, 0.045, 1],
        semantic: 'source-hush',
      };
    });
  }

  function propInstances(px = player.x, py = player.y, options={}) { return pageInstances(px, py, options); }
  function textInstances({ px = player.x, py = player.y, presence = null, time = 0, reducedMotion=false } = {}) {
    return [...pageTextInstances(px, py,{time,reducedMotion}), ...landscapeTextInstances(), ...hushTextInstances(presence, reducedMotion?0:time)];
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
    dispatch({ type: 'HUSH_CONTACT' }, { immediate: true });
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
      schema: 1,
      redaction: state.redaction,
      bestEligible: state.bestEligible,
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
      visibleGlyphs: textInstances({ presence: null }).reduce((sum, entry) => sum + String(entry.text || '').length, 0),
    }),
  };
}

export { SOURCE_ATLAS };
