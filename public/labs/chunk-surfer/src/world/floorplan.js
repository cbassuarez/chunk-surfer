// The floorplan: one authored building, compiled once, read by two consumers.
//
// PARITY BY CONSTRUCTION. The old procedural lattice had to be written twice —
// once in GLSL, once in JS — with a bit-exact integer hash to keep the drawn
// wall and the solid wall in the same place. That is a permanent hazard. Here
// there is one array. The shader samples a texture built from it; collision
// reads it directly. They cannot disagree.
//
// Authored glyphs are one metre. Runtime cells are half-metres: compile expands
// each glyph into a 2x2 block, preserving the building's physical size while
// giving collision/rendering twice the resolution. Heights remain metres.
// Encoding into RGBA8:
//   R = floor height   (H_MIN..H_MAX mapped to 0..255)
//   G = ceiling height (same scale)
//   B = flags
//   A = zone id
// Material is a parallel R8 texture, not packed into the flag byte.
//
// A cell that is `solid` is rock: no floor, no ceiling, you cannot be in it.
// A cell that is VOID (outside the building) is also solid, but reads as sky.

import {
  F, ZONE, ZONE_WORLD, MATERIAL, cellFor, materialForZone,
  EYE, STEP_UP, HEADROOM, PLAN_SCALE
} from '../data/floorplan/legend.js';

export const H_MIN = -8;
export const H_MAX = 24;
const H_RANGE = H_MAX - H_MIN;

export const encodeH = (h) => Math.max(0, Math.min(255, Math.round(((h - H_MIN) / H_RANGE) * 255)));
export const decodeH = (b) => (b / 255) * H_RANGE + H_MIN;

const plan = {
  w: 0, h: 0,
  authoredW: 0, authoredH: 0,
  scale: PLAN_SCALE,
  floor: null,   // Float32Array
  ceil: null,    // Float32Array
  flags: null,   // Uint8Array
  zone: null,    // Uint8Array
  material: null,// Uint8Array
  solid: null,   // Uint8Array (1 = rock or void)
  rgba: null,    // Uint8Array, w*h*4 — exactly what the shader sees
  spawn: { x: 0, y: 0 },
  loaded: false,
};

export function floorplan() { return plan; }
export function isLoaded() { return plan.loaded; }
export function planSize() { return { w: plan.w, h: plan.h }; }

const idx = (x, y) => y * plan.w + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < plan.w && y < plan.h;
const isRoomZone = (z) => z !== ZONE.none && z !== ZONE.stair;

export function toRuntimeCoord(v, { center = true } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const base = Math.round(n * PLAN_SCALE);
  return center ? base + Math.floor(PLAN_SCALE / 2) : base;
}
export function toRuntimePoint(p, opts) {
  return { x: toRuntimeCoord(p.x, opts), y: toRuntimeCoord(p.y, opts) };
}
export function toRuntimeDistance(v) { return Number(v) * PLAN_SCALE; }
export function toAuthoredCoord(v) { return Number(v) / PLAN_SCALE; }

// ── compile ──────────────────────────────────────────────────────────────────
// `levels` is [{ rows:[string], origin:{x,y}, base:number, stairs?:[...] }]
export function compile(levels, { width, height, widenCorridors = false } = {}) {
  const authoredW = width || Math.max(...levels.map((l) => l.origin.x + Math.max(...l.rows.map((r) => r.length))));
  const authoredH = height || Math.max(...levels.map((l) => l.origin.y + l.rows.length));
  const w = authoredW * PLAN_SCALE;
  const h = authoredH * PLAN_SCALE;

  doorKeys.clear();
  plan.authoredW = authoredW; plan.authoredH = authoredH;
  plan.scale = PLAN_SCALE;
  plan.w = w; plan.h = h;
  plan.floor = new Float32Array(w * h);
  plan.ceil = new Float32Array(w * h);
  plan.flags = new Uint8Array(w * h);
  plan.zone = new Uint8Array(w * h);
  plan.material = new Uint8Array(w * h);
  plan.solid = new Uint8Array(w * h).fill(1);   // everything is rock until drawn

  for (const level of levels) {
    const { rows, origin, base = 0 } = level;
    for (let ry = 0; ry < rows.length; ry++) {
      const row = rows[ry];
      for (let rx = 0; rx < row.length; rx++) {
        const cell = cellFor(row[rx], base);
        if (cell === null) continue;             // void: leave as rock
        const x0 = (origin.x + rx) * PLAN_SCALE;
        const y0 = (origin.y + ry) * PLAN_SCALE;
        for (let sy = 0; sy < PLAN_SCALE; sy++) for (let sx = 0; sx < PLAN_SCALE; sx++) {
          writeCell(x0 + sx, y0 + sy, cell);
        }
      }
    }
  }

  // Stairs: a run of STAIR cells given an explicit start and end height. The
  // legend cannot know which way a stair climbs, so the level data says.
  for (const level of levels) {
    for (const s of level.stairs || []) rampStair(s);
  }

  if (widenCorridors) widenCorridorRuns();
  inheritCorridorMaterials();

  plan.rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = plan.solid[i];
    plan.rgba[i * 4 + 0] = s ? 0 : encodeH(plan.floor[i]);
    plan.rgba[i * 4 + 1] = s ? 0 : encodeH(plan.ceil[i]);
    plan.rgba[i * 4 + 2] = s ? F.SOLID : plan.flags[i];
    plan.rgba[i * 4 + 3] = s ? 0 : plan.zone[i];
  }

  plan.loaded = true;
  return plan;
}

function writeCell(x, y, cell) {
  if (!inside(x, y)) return;
  const i = idx(x, y);
  if (cell.solid) {
    plan.solid[i] = 1;
    plan.material[i] = MATERIAL.none;
    return;
  }
  plan.solid[i] = 0;
  plan.floor[i] = cell.floor;
  plan.ceil[i] = cell.ceil;
  plan.flags[i] = cell.flags;
  plan.zone[i] = cell.zone;
  plan.material[i] = cell.material || materialForZone(cell.zone);
}

function widenCorridorRuns() {
  const originalSolid = plan.solid.slice();
  const corridorSource = (x, y) => {
    if (!inside(x, y)) return false;
    const i = idx(x, y);
    return !originalSolid[i]
      && plan.zone[i] === ZONE.none
      && (plan.flags[i] & (F.DOOR | F.BRICKED | F.STAIR)) === 0;
  };
  const requests = new Map();
  const radius = Math.max(1, Math.round(PLAN_SCALE));
  for (let y = 1; y < plan.h - 1; y++) for (let x = 1; x < plan.w - 1; x++) {
    if (!corridorSource(x, y)) continue;
    const src = idx(x, y);
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny)) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
      const ni = idx(nx, ny);
      if (!originalSolid[ni] || !plan.solid[ni]) continue;
      if (touchesProtectedCell(nx, ny, originalSolid)) continue;
      requests.set(`${nx},${ny}`, [nx, ny, src]);
    }
  }
  for (const [x, y, src] of requests.values()) openCorridorShoulder(x, y, src, originalSolid);
}

function touchesProtectedCell(x, y, originalSolid = plan.solid) {
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (!inside(nx, ny)) return true;
    const i = idx(nx, ny);
    if (originalSolid[i]) continue;
    if (isRoomZone(plan.zone[i]) || (plan.flags[i] & (F.DOOR | F.BRICKED | F.STAIR))) return true;
  }
  return false;
}

function openCorridorShoulder(x, y, src, originalSolid) {
  if (!inside(x, y)) return;
  const i = idx(x, y);
  if (!originalSolid[i] || !plan.solid[i]) return;
  if (touchesProtectedCell(x, y, originalSolid)) return;
  plan.solid[i] = 0;
  plan.floor[i] = plan.floor[src];
  plan.ceil[i] = plan.ceil[src];
  plan.flags[i] = plan.flags[src] & F.MUTABLE;
  plan.zone[i] = ZONE.none;
  plan.material[i] = plan.material[src] || MATERIAL.serviceConcrete;
}

function inheritCorridorMaterials() {
  const next = plan.material.slice();
  const radius = 8;
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) {
    const i = idx(x, y);
    if (plan.solid[i] || plan.zone[i] !== ZONE.none) continue;
    if (plan.material[i] === MATERIAL.doorGlassDuct || (plan.flags[i] & (F.DOOR | F.BRICKED))) continue;

    let bestZone = ZONE.none;
    let bestD = Infinity;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (plan.solid[ni] || !isRoomZone(plan.zone[ni])) continue;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; bestZone = plan.zone[ni]; }
    }
    if (bestZone !== ZONE.none) next[i] = materialForZone(bestZone);
  }
  plan.material = next;
}

// Interpolate floor/ceiling along a stair run so the risers are even.
// `ceil` pins an absolute ceiling instead of a stairwell's low soffit — the
// pool steps descend inside a six-metre hall and must not grow a lid.
function rampStair({ from, to, fromH, toH, width = 1, ceil = null, head = 2.6 }) {
  const a = toRuntimePoint(from, { center: false });
  const b = toRuntimePoint(to, { center: false });
  const runWidth = Math.max(1, Math.round(width * PLAN_SCALE));
  const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
  const end = {
    x: b.x + (dx ? dx * (PLAN_SCALE - 1) : 0),
    y: b.y + (dy ? dy * (PLAN_SCALE - 1) : 0),
  };
  const steps = Math.max(Math.abs(end.x - a.x), Math.abs(end.y - a.y));
  if (steps === 0) return;
  // perpendicular, for stairs wider than one cell
  const px = dy, py = -dx;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const fh = fromH + (toH - fromH) * t;
    for (let k = 0; k < runWidth; k++) {
      const x = a.x + dx * s + px * k, y = a.y + dy * s + py * k;
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      plan.solid[i] = 0;
      plan.floor[i] = fh;
      plan.ceil[i] = ceil != null ? ceil : fh + head;
      plan.flags[i] = F.STAIR;
      plan.zone[i] = ZONE.stair;
      plan.material[i] = MATERIAL.serviceConcrete;
    }
  }
}

// ── queries: the ONLY source of truth for collision ─────────────────────────
export function cellAt(x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (!inside(cx, cy)) return null;
  const i = idx(cx, cy);
  if (plan.solid[i]) return null;
  return {
    floor: plan.floor[i],
    ceil: plan.ceil[i],
    flags: plan.flags[i],
    zone: plan.zone[i],
    material: plan.material[i],
  };
}

export function isSolid(x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (!inside(cx, cy)) return true;
  return !!plan.solid[idx(cx, cy)];
}

export function floorAt(x, y) { const c = cellAt(x, y); return c ? c.floor : 0; }
export function ceilAt(x, y) { const c = cellAt(x, y); return c ? c.ceil : 0; }
export function zoneAt(x, y) { const c = cellAt(x, y); return c ? c.zone : ZONE.none; }
export function worldAt(x, y) { return ZONE_WORLD[zoneAt(x, y)] || 'main_b3'; }
export function flagsAt(x, y) { const c = cellAt(x, y); return c ? c.flags : F.SOLID; }
export function materialAt(x, y) { const c = cellAt(x, y); return c ? c.material : MATERIAL.none; }
export function hasFlag(x, y, f) { return (flagsAt(x, y) & f) !== 0; }

// A step is a body moving, not a camera: it needs somewhere to stand, room for
// its head, and a riser it can take without thinking about it.
export function canStep(fromX, fromY, toX, toY, { keys } = {}) {
  const a = cellAt(fromX, fromY);
  const b = cellAt(toX, toY);
  if (!b) return { ok: false, why: 'wall' };
  if (b.flags & F.BRICKED) return { ok: false, why: 'bricked' };
  if (b.flags & F.DOOR) {
    const keyId = doorKeyAt(toX, toY);
    if (keyId && !(keys && keys.has(keyId))) return { ok: false, why: 'locked', keyId };
  }
  if (b.ceil - b.floor < HEADROOM) return { ok: false, why: 'headroom' };
  if (a && Math.abs(b.floor - a.floor) > STEP_UP) return { ok: false, why: 'too high' };
  return { ok: true, floor: b.floor };
}

// Door → key. Kept out of the grid (a byte has no room) in a sparse map that
// the level data fills.
const doorKeys = new Map();
export function setDoorKey(x, y, keyId, { authored = true } = {}) {
  const x0 = authored ? toRuntimeCoord(x, { center: false }) : Math.floor(x);
  const y0 = authored ? toRuntimeCoord(y, { center: false }) : Math.floor(y);
  const span = authored ? PLAN_SCALE : 1;
  for (let yy = 0; yy < span; yy++) for (let xx = 0; xx < span; xx++) {
    doorKeys.set(`${x0 + xx},${y0 + yy}`, keyId);
  }
}
export function doorKeyAt(x, y) { return doorKeys.get(`${Math.floor(x)},${Math.floor(y)}`) || null; }

// ── mutation support (M4.1 writes through these) ────────────────────────────
export function setSolid(x, y, solid) {
  if (!inside(x, y)) return false;
  const i = idx(x, y);
  plan.solid[i] = solid ? 1 : 0;
  if (solid) plan.material[i] = MATERIAL.none;
  else if (!plan.material[i]) plan.material[i] = materialForZone(plan.zone[i]);
  plan.rgba[i * 4 + 2] = solid ? F.SOLID : plan.flags[i];
  if (!solid) {
    plan.rgba[i * 4 + 0] = encodeH(plan.floor[i]);
    plan.rgba[i * 4 + 1] = encodeH(plan.ceil[i]);
    plan.rgba[i * 4 + 3] = plan.zone[i];
  }
  return true;
}

export function setSpawn(x, y, { authored = true } = {}) {
  plan.spawn = authored ? toRuntimePoint({ x, y }) : { x: Math.round(x), y: Math.round(y) };
}
export function spawn() { return plan.spawn; }

export { F, ZONE, MATERIAL, EYE, STEP_UP, HEADROOM, PLAN_SCALE };
