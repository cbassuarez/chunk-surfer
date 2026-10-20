// The ear room's rule and its dressing, as pure functions of the save and the
// plan. main.js owns the wiring: when to ask, what to draw, what to say. See
// data/stop-listening.js for what the room is and why it is whichever room it is.

import {
  STOP_LISTENING_AFTER, STOP_LISTENING_ROOM_IDS, STOP_LISTENING_ROOMS, STOP_LISTENING_MESH, STOP_LISTENING_COPY,
  STOP_LISTENING_TREATMENTS,
} from '../data/stop-listening.js';
import { wallContactAt } from '../world/wall-contact.js';
import { propWallPose } from '../world/prop-wall-pose.js';

export const STOP_LISTENING_PREFIX = 'stop-listening:';

// `skipped`: rooms he walked into while they were busy with something of their
// own. They are passed over for the night; the ears wait for a free room.
export function freshStopListeningState() {
  return { room: null, enteredAtMs: 0, arrivalSpoken: false, sheetRead: false, skipped: [] };
}

export function normalizeStopListeningState(raw) {
  const base = freshStopListeningState();
  if (!raw || typeof raw !== 'object') return base;
  const room = STOP_LISTENING_ROOM_IDS.includes(raw.room) ? raw.room : null;
  const skipped = [...new Set((Array.isArray(raw.skipped) ? raw.skipped : [])
    .filter((id) => STOP_LISTENING_ROOM_IDS.includes(id) && id !== room))];
  return {
    room,
    enteredAtMs: room && Number.isFinite(Number(raw.enteredAtMs)) ? Math.max(0, Number(raw.enteredAtMs)) : 0,
    arrivalSpoken: !!(room && raw.arrivalSpoken),
    sheetRead: !!(room && raw.sheetRead),
    skipped,
  };
}

// COUNTED, NOT SEALED. `takes` is the recordist's projection of the tape store,
// which is true from the moment a take is counted (see take-store). That is the
// right moment here: B3 is done the instant it counts, and the next room he
// walks toward should already be waiting.
const takenSet = (takes) => new Set((Array.isArray(takes) ? takes : []).map(String));

export function stopListeningArmed(takes) {
  return takenSet(takes).has(STOP_LISTENING_AFTER);
}

// Which of a room's own treatments is live, or null. `test(treatment)` answers
// for one entry of STOP_LISTENING_TREATMENTS; main.js reads the flags and the
// encounter ledger, which this module never sees.
export function stopListeningBusyWith(roomId, test = () => false) {
  return (STOP_LISTENING_TREATMENTS[roomId] || []).find((treatment) => test(treatment))?.id || null;
}

// Which rooms are dressed right now. Once he has walked into one it is the only
// one, for the rest of the night, taped or not. `busy(roomId)` names a live
// treatment in that room, or returns null.
export function stopListeningStagedRooms(state, takes, { busy = () => null } = {}) {
  const s = normalizeStopListeningState(state);
  if (s.room) return [s.room];
  if (!stopListeningArmed(takes)) return [];
  const taken = takenSet(takes);
  return STOP_LISTENING_ROOM_IDS.filter((id) => !taken.has(id) && !s.skipped.includes(id) && !busy(id));
}

// He is standing in `roomId` (the recording room under his feet, or null). The
// first free candidate he steps into becomes the room. A candidate he steps into
// while it is busy is passed over, and stays passed over: whatever it was doing
// he has now seen it doing, and the ears do not arrive in a room he is standing
// in once it finishes.
export function stopListeningEnter(state, { roomId = null, takes = [], nowMs = 0, busy = () => null } = {}) {
  const s = normalizeStopListeningState(state);
  if (s.room || !roomId || !stopListeningArmed(takes)) return { state: s, chosen: false };
  if (!STOP_LISTENING_ROOM_IDS.includes(roomId) || takenSet(takes).has(roomId) || s.skipped.includes(roomId)) {
    return { state: s, chosen: false };
  }
  const reason = busy(roomId);
  if (reason) return { state: { ...s, skipped: [...s.skipped, roomId] }, chosen: false, skipped: roomId, reason };
  return { state: { ...s, room: roomId, enteredAtMs: Math.max(0, Number(nowMs) || 0) }, chosen: true };
}

// ── the dressing ─────────────────────────────────────────────────────────────

function hash32(value = '') {
  let h = 2166136261 >>> 0;
  for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let s = hash32(seed) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A prop's runtime cell is round(metres*2); the renderer draws it at that cell's
// own coordinate. The rest of the authored position goes on as a render offset,
// so a scatter is not quantised to a half-metre lattice.
const snap = (m) => Math.round(m * 2) / 2;

// `canPlace(x, y)` answers in AUTHORED metres: open floor, the right room, no
// blocking furniture. Supplied by the caller so this module never needs a plan.
export function stopListeningPlacements(roomId, { canPlace = () => true } = {}) {
  const room = STOP_LISTENING_ROOMS[roomId];
  if (!room) return [];
  const out = [];
  const id = (kind, n) => `${STOP_LISTENING_PREFIX}${roomId}:${kind}:${n}`;
  const near = room.heaps.map((h) => ({ x: h.x, y: h.y }));
  const draw = rng(`stop-listening:${roomId}`);

  room.heaps.forEach((h, n) => {
    if (!canPlace(h.x, h.y)) return;
    out.push({
      id: id('heap', n), mesh: h.mesh, x: snap(h.x), y: snap(h.y),
      renderOffsetX: h.x - snap(h.x), renderOffsetZ: h.y - snap(h.y),
      yaw: h.yaw, scale: h.scale, elevation: 0, blocks: false, interactive: true,
      label: 'ears', inspect: STOP_LISTENING_COPY.heap,
    });
  });

  // Scatter. Each field draws its count, then thins by distance from the nearest
  // heap and from the door, so the ears thicken where they were piled and where
  // he comes in, and run out into the room rather than ending at a rectangle.
  let n = 0;
  for (const f of room.fields) {
    let placed = 0, tries = 0;
    while (placed < f.count && tries < f.count * 12) {
      tries += 1;
      const x = f.x0 + draw() * (f.x1 - f.x0);
      const y = f.y0 + draw() * (f.y1 - f.y0);
      const d = Math.min(Math.hypot(x - room.entry.x, y - room.entry.y) * .7,
        ...near.map((p) => Math.hypot(x - p.x, y - p.y)));
      const keep = .28 + .72 * Math.exp(-d / 2.2);
      if (draw() > keep) continue;
      if (!canPlace(x, y)) continue;
      const mesh = STOP_LISTENING_MESH.ears[Math.floor(draw() * STOP_LISTENING_MESH.ears.length)];
      out.push({
        id: id('ear', n++), mesh, x: snap(x), y: snap(y),
        renderOffsetX: x - snap(x), renderOffsetZ: y - snap(y),
        yaw: draw() * Math.PI * 2, scale: 1.3 + draw() * .3, elevation: 0,
        blocks: false, interactive: false,
      });
      placed += 1;
    }
  }

  room.writing.forEach((w, k) => {
    out.push({
      // Along the wall, the authored position survives as an offset; across it,
      // the wall snap overwrites the offset with the face.
      id: id('writing', k), mesh: w.mesh, x: w.x, y: w.y, mount: 'wall',
      renderOffsetX: w.x - snap(w.x), renderOffsetZ: w.y - snap(w.y),
      mountNormal: w.mountNormal, mountStandoff: w.standoff, elevation: w.elevation, scale: w.scale,
      blocks: false, interactive: true, label: 'writing', inspect: STOP_LISTENING_COPY.writing,
    });
  });

  if (canPlace(room.sheet.x, room.sheet.y)) {
    out.push({
      id: id('sheet', 0), mesh: STOP_LISTENING_MESH.sheet, x: snap(room.sheet.x), y: snap(room.sheet.y),
      renderOffsetX: room.sheet.x - snap(room.sheet.x), renderOffsetZ: room.sheet.y - snap(room.sheet.y),
      // Aim at what the eye sees: the sheet, not its cell centre.
      inspectAt: { x: room.sheet.x, y: room.sheet.y },
      yaw: room.sheet.yaw, elevation: .012, blocks: false, interactive: true,
      label: STOP_LISTENING_COPY.sheet.label, action: 'stop-listening-sheet',
    });
  }
  return out;
}

// THE SAME POSE propsInit WOULD GIVE THEM, AS LOOSE PROPS.
//
// The dressing comes and goes with the night, so it goes in through
// PROPS.setLooseProp, which takes a runtime cell and never looks for a wall.
// This does what propsInit's contact pass does for an authored wall fixture —
// wallContactAt on the face it names, propWallPose for the offset and yaw —
// and then stands the paint proud by `mountStandoff` (paint on foam). It lives
// here rather than in props.js because props.js is an input the prop pack's
// lettering build hashes, and this is not the pack's business.
//
// `plan` is the floorplan module (or anything wallContactAt can read); `bounds`
// the pack's runtime-axis bounds.
export function stopListeningLoosePlacements(placements, plan, bounds = {}) {
  return placements.map((p) => {
    const rx = Math.round(p.x * 2), ry = Math.round(p.y * 2);
    const out = { ...p, rx, ry, renderOffsetX: p.renderOffsetX || 0, renderOffsetZ: p.renderOffsetZ || 0 };
    if (p.mount !== 'wall' || !plan) return out;
    const contact = wallContactAt(plan, rx + .5, ry + .5, { prefer: p.mountNormal || null });
    if (!contact) return out;
    const pose = propWallPose(out, bounds[p.mesh], contact);
    if (pose.x !== null) out.renderOffsetX = (pose.x - rx) * .5;
    if (pose.y !== null) out.renderOffsetZ = (pose.y - ry) * .5;
    out.yaw = pose.yaw;
    out.wallContact = { nx: contact.nx, ny: contact.ny, gap: contact.gap };
    const standoff = Number(p.mountStandoff) || 0;
    out.renderOffsetX += contact.nx * standoff;
    out.renderOffsetZ += contact.ny * standoff;
    return out;
  });
}

// Where the sound comes from, in authored metres. The runtime resolves each
// through logicalToPhysical, the way the pipe and the fountain are resolved.
export function stopListeningVoices(roomId) {
  return (STOP_LISTENING_ROOMS[roomId]?.voices || []).map((v, i) => ({ id: `${roomId}:${i}`, ...v }));
}
