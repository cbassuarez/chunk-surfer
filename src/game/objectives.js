// Pages and takes.
//
// PROXIMATE gives you a job; Slender gives you pages. This gives you both,
// because they do different work:
//
//   A PAGE is information. The previous recordist's log. Reading one tells you
//   which room needs tone and roughly where it is — a waypoint, not a route.
//   You still have to find your own way there in the dark.
//
//   A TAKE is completion. Forty-five unbroken seconds. Pages tell you where the
//   work is; takes are the work.
//
// The old key/door system is recontextualised here rather than deleted: pages
// spawn like keys did, and the descent opens when the room's work is done.

import { PLAN_SCALE } from '../data/floorplan/legend.js';

const D = (n) => n * PLAN_SCALE;

const state = {
  pages: new Map(),        // "x,y" -> {x, y, roomId, id}
  read: [],                // page ids read this run
  waypoint: null,          // {x, y, roomId} — the only navigation you get
  target: null,            // roomId the client wants recorded next
  pickupRadius: D(1.4),
};

export function objState() { return state; }
export function waypoint() { return state.waypoint; }
export function targetRoom() { return state.target; }
export function pagesRead() { return state.read.length; }

const key = (x, y) => `${Math.round(x)},${Math.round(y)}`;

export function placePage(x, y, roomId, id) {
  state.pages.set(key(x, y), { x: Math.round(x), y: Math.round(y), roomId, id: id || `page-${state.pages.size + 1}` });
}
export function pageAt(x, y) { return state.pages.get(key(x, y)) || null; }
export function allPages() { return [...state.pages.values()]; }

// What is at your feet, if anything. Looking is free; it does not take it.
export function pageNear(px, py) {
  for (const p of state.pages.values())
    if (Math.hypot(p.x - px, p.y - py) <= state.pickupRadius) return p;
  return null;
}

// You do not hoover up a dead man's paperwork by walking across it. You stop,
// you crouch, and you pick it up with your hand — which in this game is [e].
// Returns the page if one was taken.
export function tryPickup(px, py) {
  const p = pageNear(px, py);
  if (!p) return null;
  state.pages.delete(key(p.x, p.y));
  state.read.push(p.id);
  return p;
}

// A page sets the waypoint. Deliberately coarse: it tells you where the room
// is, not how the building connects.
export function setWaypoint(x, y, roomId) {
  state.waypoint = { x: Math.round(x), y: Math.round(y), roomId };
  state.target = roomId;
}
export function clearWaypoint() { state.waypoint = null; state.target = null; }

export function distanceToWaypoint(px, py) {
  if (!state.waypoint) return Infinity;
  return Math.hypot(state.waypoint.x - px, state.waypoint.y - py);
}

// The compass line: bearing and a vague distance, the way a person estimates.
const BEARINGS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export function bearingTo(px, py) {
  if (!state.waypoint) return null;
  const dx = state.waypoint.x - px, dy = state.waypoint.y - py;
  const d = Math.hypot(dx, dy);
  // screen coords: -y is north
  const ang = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  const bearing = BEARINGS[Math.round(ang / (Math.PI / 4)) % 8];
  const far = d > D(60) ? 'far off' : d > D(28) ? 'some way off' : d > D(12) ? 'nearby' : 'very close';
  return { bearing, far, distance: d };
}

// ── the job, filed ──────────────────────────────────────────────────────────
// The bag is not a pile of paper. It is five rooms, and the paper you have
// found is filed under the room it talks about. A sheet that names no room
// goes in UNFILED, where it is exactly as useful as it was on the floor.
//
// `rooms` is the client's list, in the client's order. `notes` are the pages
// picked up so far. `hasTake` and `label` come from the caller, because this
// module knows nothing about audio or about English.
export function objectives({ rooms = [], notes = [], hasTake = () => false, label = (r) => r,
                             stamp = () => '' } = {}) {
  const filed = new Map(rooms.map((r) => [r, []]));
  const unfiled = [];
  for (const n of notes) {
    if (n.room && filed.has(n.room)) filed.get(n.room).push(n);
    else unfiled.push(n);
  }
  return {
    rooms: rooms.map((roomId) => ({
      roomId,
      label: label(roomId),
      notes: filed.get(roomId) || [],
      recorded: !!hasTake(roomId),
      marked: state.target === roomId,
      // What the file says it was taken at, as far as anyone can still read it.
      stamp: hasTake(roomId) ? stamp(roomId) : '',
    })),
    unfiled,
    done: rooms.filter((r) => hasTake(r)).length,
    total: rooms.length,
  };
}

export function loadObjState(saved = {}) {
  state.read = saved.read || [];
  state.waypoint = saved.waypoint || null;
  state.target = saved.target || null;
}
export function saveObjState() {
  return { read: state.read, waypoint: state.waypoint, target: state.target };
}
