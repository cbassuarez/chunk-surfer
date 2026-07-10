// The floorplan: one authored building, compiled once, read by two consumers.
//
// PARITY BY CONSTRUCTION. The old procedural lattice had to be written twice —
// once in GLSL, once in JS — with a bit-exact integer hash to keep the drawn
// wall and the solid wall in the same place. That is a permanent hazard. Here
// there is one array. The shader samples a texture built from it; collision
// reads it directly. They cannot disagree.
//
// Heights are metres; the grid is one cell per metre. Encoding into RGBA8:
//   R = floor height   (H_MIN..H_MAX mapped to 0..255)
//   G = ceiling height (same scale)
//   B = flags
//   A = zone id
//
// A cell that is `solid` is rock: no floor, no ceiling, you cannot be in it.
// A cell that is VOID (outside the building) is also solid, but reads as sky.

import { F, ZONE, ZONE_WORLD, cellFor, EYE, STEP_UP, HEADROOM } from '../data/floorplan/legend.js';

export const H_MIN = -8;
export const H_MAX = 24;
const H_RANGE = H_MAX - H_MIN;

export const encodeH = (h) => Math.max(0, Math.min(255, Math.round(((h - H_MIN) / H_RANGE) * 255)));
export const decodeH = (b) => (b / 255) * H_RANGE + H_MIN;

const plan = {
  w: 0, h: 0,
  floor: null,   // Float32Array
  ceil: null,    // Float32Array
  flags: null,   // Uint8Array
  zone: null,    // Uint8Array
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

// ── compile ──────────────────────────────────────────────────────────────────
// `levels` is [{ rows:[string], origin:{x,y}, base:number, stairs?:[...] }]
export function compile(levels, { width, height } = {}) {
  const w = width || Math.max(...levels.map((l) => l.origin.x + Math.max(...l.rows.map((r) => r.length))));
  const h = height || Math.max(...levels.map((l) => l.origin.y + l.rows.length));

  plan.w = w; plan.h = h;
  plan.floor = new Float32Array(w * h);
  plan.ceil = new Float32Array(w * h);
  plan.flags = new Uint8Array(w * h);
  plan.zone = new Uint8Array(w * h);
  plan.solid = new Uint8Array(w * h).fill(1);   // everything is rock until drawn

  for (const level of levels) {
    const { rows, origin, base = 0 } = level;
    for (let ry = 0; ry < rows.length; ry++) {
      const row = rows[ry];
      for (let rx = 0; rx < row.length; rx++) {
        const x = origin.x + rx, y = origin.y + ry;
        if (!inside(x, y)) continue;
        const cell = cellFor(row[rx], base);
        if (cell === null) continue;             // void: leave as rock
        const i = idx(x, y);
        if (cell.solid) { plan.solid[i] = 1; continue; }
        plan.solid[i] = 0;
        plan.floor[i] = cell.floor;
        plan.ceil[i] = cell.ceil;
        plan.flags[i] = cell.flags;
        plan.zone[i] = cell.zone;
      }
    }
  }

  // Stairs: a run of STAIR cells given an explicit start and end height. The
  // legend cannot know which way a stair climbs, so the level data says.
  for (const level of levels) {
    for (const s of level.stairs || []) rampStair(s);
  }

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

// Interpolate floor/ceiling along a stair run so the risers are even.
function rampStair({ from, to, fromH, toH, width = 1 }) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  if (steps === 0) return;
  const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
  // perpendicular, for stairs wider than one cell
  const px = dy, py = -dx;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const fh = fromH + (toH - fromH) * t;
    for (let k = 0; k < width; k++) {
      const x = from.x + dx * s + px * k, y = from.y + dy * s + py * k;
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      plan.solid[i] = 0;
      plan.floor[i] = fh;
      plan.ceil[i] = fh + 2.6;
      plan.flags[i] = F.STAIR;
      plan.zone[i] = ZONE.stair;
    }
  }
}

// ── queries: the ONLY source of truth for collision ─────────────────────────
export function cellAt(x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (!inside(cx, cy)) return null;
  const i = idx(cx, cy);
  if (plan.solid[i]) return null;
  return { floor: plan.floor[i], ceil: plan.ceil[i], flags: plan.flags[i], zone: plan.zone[i] };
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
export function setDoorKey(x, y, keyId) { doorKeys.set(`${x},${y}`, keyId); }
export function doorKeyAt(x, y) { return doorKeys.get(`${Math.floor(x)},${Math.floor(y)}`) || null; }

// ── mutation support (M4.1 writes through these) ────────────────────────────
export function setSolid(x, y, solid) {
  if (!inside(x, y)) return false;
  const i = idx(x, y);
  plan.solid[i] = solid ? 1 : 0;
  plan.rgba[i * 4 + 2] = solid ? F.SOLID : plan.flags[i];
  if (!solid) {
    plan.rgba[i * 4 + 0] = encodeH(plan.floor[i]);
    plan.rgba[i * 4 + 1] = encodeH(plan.ceil[i]);
    plan.rgba[i * 4 + 3] = plan.zone[i];
  }
  return true;
}

export function setSpawn(x, y) { plan.spawn = { x, y }; }
export function spawn() { return plan.spawn; }

export { F, ZONE, EYE, STEP_UP, HEADROOM };
