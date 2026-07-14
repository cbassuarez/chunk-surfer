import SOURCE_ATLAS from '../../content/chunk-surf/source-atlas.json' with { type: 'json' };
import { CHUNK_SURF_ROOMS, createChunkSurfState, currentChunkSurfRoom, normalizeChunkSurfState } from './chunk-surf-state.js';

export const CHUNK_SURF_SOURCE_ATLAS = SOURCE_ATLAS;

const DIRECTIONS = Object.freeze(['north', 'east', 'south', 'west']);
const DIR_VEC = Object.freeze({
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
});
const SIDE = Object.freeze({
  north: { left: 'west', right: 'east', back: 'south' },
  east: { left: 'north', right: 'south', back: 'west' },
  south: { left: 'east', right: 'west', back: 'north' },
  west: { left: 'south', right: 'north', back: 'east' },
});

export function chunkSurfSector(roomId, atlas = SOURCE_ATLAS) {
  return atlas?.sectors?.[roomId] || atlas?.sectors?.approach || { id: roomId || 'missing', sourceLines: [], title: 'MISSING SOURCE' };
}

export function validateChunkSurfAtlas(atlas = SOURCE_ATLAS) {
  const errors = [];
  if (!atlas || typeof atlas !== 'object') return { ok: false, errors: ['atlas must be an object'] };
  if (atlas.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  for (const room of CHUNK_SURF_ROOMS) {
    const sector = atlas.sectors?.[room.id];
    if (!sector) { errors.push(`${room.id} has no source sector`); continue; }
    if ((sector.sourceLines || []).length < 8) errors.push(`${room.id} has too few source lines`);
    for (const item of sector.sourceLines || []) {
      const text = String(item.text || '');
      if (!text.trim()) errors.push(`${room.id} contains an empty source line`);
      if (/https?:\/\//i.test(text) || /\/Users\//.test(text)) errors.push(`${room.id} contains a banned source fragment`);
      if (/\b(Floor|Wall|Room)\b/.test(text)) errors.push(`${room.id} contains fallback world labels`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function hash01(value) {
  let h = 2166136261;
  const s = String(value || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function sourceSlice(sector, offset, count) {
  const lines = sector.sourceLines || [];
  if (!lines.length) return [];
  const out = [];
  for (let i = 0; i < count; i++) out.push(lines[(offset + i) % lines.length]);
  return out;
}

function project({ width, height }, x, y, z) {
  const depth = Math.max(0.1, z);
  const scale = 1 / depth;
  return {
    x: width * 0.5 + x * width * 0.46 * scale,
    y: height * 0.78 - y * height * 0.55 * scale,
    scale,
    depth,
  };
}

function safeViewport(viewport = {}) {
  return {
    width: Math.max(320, Number(viewport.width) || 1280),
    height: Math.max(200, Number(viewport.height) || 720),
  };
}

function portalKind(direction, facing) {
  if (direction === facing) return 'forward';
  if (direction === SIDE[facing]?.left) return 'left';
  if (direction === SIDE[facing]?.right) return 'right';
  if (direction === SIDE[facing]?.back) return 'back';
  return 'side';
}

export function chunkSurfPortalModel(state, atlas = SOURCE_ATLAS) {
  const s = normalizeChunkSurfState(state) || createChunkSurfState();
  const room = currentChunkSurfRoom(s);
  return Object.entries(room.exits || {}).map(([direction, target]) => {
    const targetSector = chunkSurfSector(target, atlas);
    return {
      direction,
      target,
      kind: portalKind(direction, s.facing),
      label: `${direction.toUpperCase()} :: ${targetSector.title}`,
      anchor: targetSector.anchors?.[0] || target,
      visited: (s.visited || []).includes(target),
    };
  }).sort((a, b) => {
    const order = { forward: 0, left: 1, right: 2, side: 3, back: 4 };
    return (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
  });
}

function sectorTone(state, roomId, room) {
  if (room.kind === 'final') return 'redaction';
  if ((state.recorded || []).includes(roomId)) return 'recorded';
  if ((state.tuned || []).includes(roomId)) return 'tuned';
  if ((state.visited || []).includes(roomId)) return 'visited';
  return 'cold';
}

export function chunkSurfVisualModel({ state, atlas = SOURCE_ATLAS, viewport, time = 0, redactionIndex = 0 } = {}) {
  const s = normalizeChunkSurfState(state) || createChunkSurfState();
  const room = currentChunkSurfRoom(s);
  const sector = chunkSurfSector(s.roomId, atlas);
  const vp = safeViewport(viewport);
  const tuned = (s.tuned || []).includes(s.roomId);
  const recorded = (s.recorded || []).includes(s.roomId);
  const tone = sectorTone(s, s.roomId, room);
  const forward = DIR_VEC[s.facing] || DIR_VEC.north;
  const depthBias = 1 + Math.min(1.5, (s.visited || []).length * 0.18);
  const floor = [];
  const leftWall = [];
  const rightWall = [];
  const towers = [];
  const schematics = [];
  const sourceCount = Math.max(1, sector.sourceLines?.length || 1);

  for (let row = 0; row < 24; row++) {
    const z = 0.72 + row * 0.29;
    const y = -0.16 + row * 0.012;
    const spread = 0.34 + row * 0.072;
    const line = sourceSlice(sector, row * 2 + Math.floor(time * 2), 1)[0];
    const p = project(vp, Math.sin(row * 0.7 + time) * 0.025, y, z / depthBias);
    floor.push({
      text: line.text,
      file: line.file,
      line: line.line,
      x: p.x,
      y: p.y,
      z,
      scale: Math.max(0.18, Math.min(1.35, p.scale * 0.92)),
      width: Math.min(vp.width * 1.6, vp.width * spread),
      alpha: Math.max(0.08, 0.82 - row * 0.027),
      tone,
    });
  }

  for (let i = 0; i < 18; i++) {
    const z = 0.8 + i * 0.34;
    const y = 0.10 + i * 0.022;
    const left = sourceSlice(sector, 35 + i * 3, 1)[0];
    const right = sourceSlice(sector, 86 + i * 4, 1)[0];
    const lp = project(vp, -0.72 - i * 0.018, y, z / depthBias);
    const rp = project(vp, 0.72 + i * 0.018, y, z / depthBias);
    leftWall.push({ text: left.text, file: left.file, line: left.line, x: lp.x, y: lp.y, z, scale: Math.max(0.12, lp.scale * 0.74), alpha: Math.max(0.06, 0.68 - i * 0.028), side: 'left', tone });
    rightWall.push({ text: right.text, file: right.file, line: right.line, x: rp.x, y: rp.y, z, scale: Math.max(0.12, rp.scale * 0.74), alpha: Math.max(0.06, 0.68 - i * 0.028), side: 'right', tone });
  }

  for (let i = 0; i < 9; i++) {
    const item = sourceSlice(sector, 12 + i * 9, 1)[0];
    const side = i % 2 === 0 ? -1 : 1;
    const z = 1.15 + i * 0.46;
    const p = project(vp, side * (0.18 + hash01(item.text) * 0.52), 0.35 + hash01(item.file) * 0.38, z / depthBias);
    towers.push({
      id: `${item.file}:${item.line}`,
      token: item.tokens?.[0] || item.text.trim().split(/\s+/)[0] || 'source',
      lines: sourceSlice(sector, i * 11, 5).map((entry) => entry.text),
      x: p.x,
      y: p.y,
      z,
      scale: Math.max(0.16, Math.min(1.1, p.scale)),
      height: 4 + Math.floor(hash01(item.text) * 7),
      tone: tuned ? 'tuned' : i % 3 === 0 ? 'schematic' : tone,
    });
  }

  for (let i = 0; i < 4; i++) {
    const p = project(vp, -0.55 + i * 0.36, 0.68 + (i % 2) * 0.12, 1.3 + i * 0.6);
    schematics.push({
      x: p.x,
      y: p.y,
      scale: Math.max(0.18, p.scale * 0.8),
      alpha: 0.20 + i * 0.05,
      kind: i % 2 ? 'bsod-plane' : 'circuit-plane',
      label: sector.anchors?.[i] || sector.id,
    });
  }

  const portals = chunkSurfPortalModel(s, atlas).map((portal, index) => {
    const sideOffset = portal.kind === 'forward' ? 0 : portal.kind === 'left' ? -0.78 : portal.kind === 'right' ? 0.78 : portal.kind === 'back' ? 0 : index * 0.25;
    const p = project(vp, sideOffset, 0.28, portal.kind === 'forward' ? 0.95 : 1.55);
    return { ...portal, x: p.x, y: p.y, scale: Math.max(0.22, p.scale), alpha: portal.kind === 'back' ? 0.28 : 0.92 };
  });

  const finalChoices = room.kind === 'final' ? (room.redactions || []).map((entry, index) => {
    const line = sourceSlice(sector, 20 + index * 13, 1)[0];
    return {
      id: entry.id,
      label: entry.label,
      sourceText: line.text,
      selected: index === redactionIndex,
      correct: !!entry.correct,
      x: vp.width * (0.19 + index * 0.31),
      y: vp.height * 0.46,
    };
  }) : [];

  const forwardPortal = portals.find((portal) => portal.kind === 'forward') || portals[0] || null;
  return {
    viewport: vp,
    room: { id: room.id, title: room.title, kind: room.kind },
    sector: { id: sector.id, title: sector.title, sourceLineCount: sourceCount },
    camera: { facing: s.facing, forward, depthBias, shake: s.scare ? 1 : state?.hasFork ? 0.16 : 0.06 },
    status: { hasFork: !!s.hasFork, tuned, recorded, visited: (s.visited || []).includes(s.roomId), tone },
    floor,
    leftWall,
    rightWall,
    towers,
    schematics,
    portals,
    forwardPortal,
    finalChoices,
    glitch: {
      chromatic: Math.min(1, 0.16 + (tuned ? 0.24 : 0) + (recorded ? 0.18 : 0) + (room.kind === 'final' ? 0.28 : 0)),
      scan: 0.18 + Math.sin(time * 7) * 0.04,
      bsod: room.kind === 'final' ? 0.32 : s.profile?.mandatory ? 0.12 : 0.04,
    },
  };
}
