// The building changes where it has not been heard.
//
// Sound pins it. Cells you have made noise in are fixed; silent cells drift.
// It never moves while you are looking, and it never moves a room — only the
// corridors between them. Which means the thing your job requires (forty-five
// blind, still, silent seconds) is exactly the thing that lets the building
// rearrange behind you.
//
// THREE DISCIPLINES. These are not polish; they are the design. Break any one
// and this becomes the Backrooms, where the player stops trusting the space —
// and that trust is precisely what the horror spends.
//
//   1. ROOMS NEVER MOVE. Only cells flagged MUTABLE, which is corridors.
//   2. CONNECTIVITY IS GUARANTEED. Every candidate change is applied to a
//      scratch grid and validated by BFS before it is committed. The building
//      may make your route long, wrong and unrecognisable. It may never make
//      it impossible.
//   3. IT IS NEVER OBSERVED. Not in the light, not in the frustum, not in a
//      cell whose noise has not yet decayed.
//
// The building also does not make a sound. The presence makes sounds. If those
// blur, the player learns the wrong lesson about what is dangerous.

import * as FP from './floorplan.js';
import { F, ZONE } from '../data/floorplan/legend.js';

// A room is an organ: it never moves, and nothing may knock a new hole into it.
// Corridors (zone none) and stairs are the connective tissue that may change.
const isRoomZone = (z) => z !== ZONE.none && z !== ZONE.stair;

export const MUTATE = {
  heardDecayPerSec: 0.06,    // a footfall pins a cell for ~16 seconds
  heardRadius: 3,            // noise pins a small neighbourhood, not a point
  cooldownSec: 2.2,          // between changes
  maxPerBurst: 3,            // how many cells one change may touch
  viewCos: 0.35,             // anything within this cone of your facing is watched
  viewRange: 26,             // ...out to here
  nearRange: 4,              // and this close, watched regardless of facing
};

let heard = null;            // Float32Array, one per cell, 1 = just heard
let w = 0, h = 0;
let lastMutateAt = -1e9;
let stats = { applied: 0, rejectedConnectivity: 0, rejectedObserved: 0, rejectedHeard: 0 };

export function mutateInit() {
  const p = FP.floorplan();
  w = p.w; h = p.h;
  heard = new Float32Array(w * h);
  lastMutateAt = -1e9;
  stats = { applied: 0, rejectedConnectivity: 0, rejectedObserved: 0, rejectedHeard: 0 };
}

export function mutateStats() { return { ...stats }; }
export function heardAt(x, y) {
  if (!heard || x < 0 || y < 0 || x >= w || y >= h) return 0;
  return heard[y * w + x];
}

// Every noise the recordist makes writes here — the same events the presence
// hunts. Where you have been loud, the building is honest.
export function markHeard(x, y, level = 1) {
  if (!heard) return;
  const r = MUTATE.heardRadius;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = Math.round(x) + dx, ny = Math.round(y) + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const d = Math.hypot(dx, dy);
    if (d > r) continue;
    const v = level * (1 - d / (r + 1));
    const i = ny * w + nx;
    if (v > heard[i]) heard[i] = Math.min(1, v);
  }
}

export function decayHeard(dt) {
  if (!heard) return;
  const k = MUTATE.heardDecayPerSec * dt;
  for (let i = 0; i < heard.length; i++) if (heard[i] > 0) heard[i] = Math.max(0, heard[i] - k);
}

// Is the player watching this cell? Light matters: in the dark you see nothing
// beyond arm's reach, and the building knows it.
function observed(x, y, view) {
  const dx = x - view.px, dy = y - view.py;
  const d = Math.hypot(dx, dy);
  if (d <= MUTATE.nearRange) return true;
  if (!view.light) return false;                 // dark: only the near field is watched
  if (d > MUTATE.viewRange) return false;
  const [fx, fy] = view.facing;
  return (dx / d) * fx + (dy / d) * fy > MUTATE.viewCos;
}

// Reachability over a candidate grid. `solidOverride` is a Map of "x,y" → bool.
function reachable(from, targets, solidOverride) {
  const solid = (x, y) => {
    const k = `${x},${y}`;
    if (solidOverride.has(k)) return solidOverride.get(k);
    return FP.isSolid(x, y);
  };
  const need = new Set(targets.map((t) => `${t.x},${t.y}`));
  if (!need.size) return true;
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    need.delete(`${c.x},${c.y}`);
    if (!need.size) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || solid(nx, ny)) continue;
      // a mutation cannot invent a climb: heights are untouched
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  return false;
}

function mutableCandidates(view) {
  const out = [];
  const R = 34;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = Math.round(view.px) + dx, y = Math.round(view.py) + dy;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    const c = FP.cellAt(x, y);
    if (!c || !(c.flags & F.MUTABLE)) continue;      // rooms and stairs never move
    if (isRoomZone(c.zone) || (c.flags & F.STAIR)) continue;
    if (touchesRoom(x, y)) continue;                 // never seal a room's doorway
    if (heardAt(x, y) > 0.02) continue;              // you were loud here
    if (observed(x, y, view)) continue;              // you are looking at it
    out.push({ x, y });
  }
  return out;
}

// `view` = { px, py, facing:[fx,fy], light }
// `anchors` = cells that must stay reachable: the waypoint, the way out.
export function tryMutate(now, view, anchors = []) {
  if (!heard || !FP.isLoaded()) return null;
  if ((now - lastMutateAt) / 1000 < MUTATE.cooldownSec) return null;

  const cands = mutableCandidates(view);
  if (cands.length < 2) return null;

  // A change is small and local: seal one corridor cell, open a neighbouring
  // wall. Never a wholesale re-plan — that reads as a glitch, not a haunting.
  const seal = cands[Math.floor(Math.random() * cands.length)];
  const open = findWallBeside(seal, view);
  if (!open) return null;

  const override = new Map([[`${seal.x},${seal.y}`, true], [`${open.x},${open.y}`, false]]);
  const from = { x: Math.round(view.px), y: Math.round(view.py) };
  if (!reachable(from, anchors, override)) { stats.rejectedConnectivity++; return null; }

  FP.setSolid(seal.x, seal.y, true);
  FP.setSolid(open.x, open.y, false);
  lastMutateAt = now;
  stats.applied++;
  return { seal, open };
}

// A wall beside a room may not be opened: the building rearranges its veins,
// it does not knock holes in its organs. Without this, a corridor eventually
// breaches the chapel and the player watches the level design come apart.
function touchesRoom(x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) {
    const c = FP.cellAt(x + dx, y + dy);
    if (c && isRoomZone(c.zone)) return true;
  }
  return false;
}

// A wall next to the sealed cell that could plausibly have been a doorway.
// It inherits the corridor's floor and ceiling, so the building never invents
// a step you cannot take.
function findWallBeside(seal, view) {
  const src = FP.cellAt(seal.x, seal.y);
  if (!src || isRoomZone(src.zone)) return null;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs.sort(() => Math.random() - 0.5)) {
    const x = seal.x + dx, y = seal.y + dy;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    if (!FP.isSolid(x, y)) continue;
    if (touchesRoom(x, y)) continue;
    if (observed(x, y, view) || heardAt(x, y) > 0.02) continue;
    const p = FP.floorplan();
    const i = y * p.w + x;
    p.floor[i] = src.floor;
    p.ceil[i] = src.ceil;
    p.flags[i] = F.MUTABLE;
    p.zone[i] = src.zone;
    return { x, y };
  }
  return null;
}
