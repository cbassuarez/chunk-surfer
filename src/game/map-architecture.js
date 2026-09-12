// Immutable architectural capture, not a second building authoring system.
// X/Y are physical X/Z runtime cells divided by topologyStride (the existing
// map frame). Heights, ceiling and wallHeight remain METRES. Bounds use outer
// cell edges, not inclusive grid indices. Explosion/camera offsets never enter
// this data. Spans describe air volumes: cutaway walls are schematic exposed
// boundaries, not a claim about structural wall thickness or load paths.
import { CELL, F, isOutdoorZone } from '../data/floorplan/legend.js';
import { floorForHeight } from './map-projection.js';

const precision = value => Math.round(Number(value) * 10000) / 10000;
const cellKey = (x, y) => `${x},${y}`;
const bounds = () => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
const grow = (box, x, y, w = 0, h = 0) => {
  box.minX = Math.min(box.minX, x); box.minY = Math.min(box.minY, y);
  box.maxX = Math.max(box.maxX, x + w); box.maxY = Math.max(box.maxY, y + h);
};
const validBounds = box => Number.isFinite(box.minX) ? box : null;
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

// A component belongs to a named room only when one actual issued anchor lies
// in it. Door cells separate components; shared corridors with several anchors
// deliberately remain unassigned. No nearest-label/Voronoi room is invented.
function assignRoomComponents(level, anchors, stride) {
  const at = new Map();
  for (const anchor of anchors) {
    if (anchor.floorId !== level.floorId || !anchor.position
        || !Number.isFinite(anchor.height) || Math.abs(anchor.height - level.height) > .02) continue;
    const key = cellKey(Math.floor(anchor.position.x * stride), Math.floor(anchor.position.y * stride));
    if (!level.cells.has(key)) continue;
    if (!at.has(key)) at.set(key, new Set());
    at.get(key).add(anchor.id);
  }
  if (!at.size) return;
  const visited = new Set();
  for (const [key, start] of level.cells) {
    if (visited.has(key) || (start.flags & F.DOOR)) continue;
    const queue = [start], component = [], names = new Set(); visited.add(key);
    for (let index = 0; index < queue.length; index++) {
      const cell = queue[index]; component.push(cell);
      for (const name of at.get(cellKey(cell.x, cell.y)) || []) names.add(name);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextKey = cellKey(cell.x + dx, cell.y + dy), next = level.cells.get(nextKey);
        if (!next || visited.has(nextKey) || (next.flags & F.DOOR)) continue;
        visited.add(nextKey); queue.push(next);
      }
    }
    if (names.size === 1) for (const cell of component) cell.mapSpaceId = [...names][0];
  }
}

function mergeSurfaces(cells, stride) {
  const rows = new Map();
  for (const cell of cells.values()) {
    const row = rows.get(cell.y) || []; row.push(cell); rows.set(cell.y, row);
  }
  const result = [], previous = new Map();
  for (const [y, row] of [...rows].sort((a, b) => a[0] - b[0])) {
    row.sort((a, b) => a.x - b.x);
    const runs = [];
    for (const cell of row) {
      const signature = JSON.stringify([cell.ceil, !!(cell.flags & F.DOOR), cell.mapSpaceId || null]);
      const last = runs.at(-1);
      if (last && last.x + last.w === cell.x && last.signature === signature) last.w++;
      else runs.push({ x: cell.x, y, w: 1, h: 1, ceiling: cell.ceil,
        door: !!(cell.flags & F.DOOR), mapSpaceId: cell.mapSpaceId || null, signature });
    }
    const active = new Map();
    for (const run of runs) {
      const key = `${run.x}:${run.w}:${run.signature}`, prior = previous.get(key);
      if (prior && prior.y + prior.h === y) { prior.h++; active.set(key, prior); }
      else { result.push(run); active.set(key, run); }
    }
    previous.clear(); for (const [key, run] of active) previous.set(key, run);
  }
  return result.map(({ signature, x, y, w, h, ...rest }) => ({ x: x / stride, y: y / stride,
    w: w / stride, h: h / stride, ...rest }));
}

function exposedBoundaries(level, physical, stride, cutawayHeight) {
  const lines = new Map();
  const sides = [
    { dx: -1, dy: 0, axis: 'y', edge: 0, start: 0 },
    { dx: 1, dy: 0, axis: 'y', edge: 1, start: 0 },
    { dx: 0, dy: -1, axis: 'x', edge: 0, start: 0 },
    { dx: 0, dy: 1, axis: 'x', edge: 1, start: 0 },
  ];
  for (const cell of level.cells.values()) for (const side of sides) {
    const neighbours = physical.cells.get(cellKey(cell.x + side.dx, cell.y + side.dy)) || [];
    const sameFloor = neighbours.some(span => Math.abs(span.floor - level.height) < .001 && span.ceil > level.height + .001);
    if (sameFloor) continue; // metadata/room boundaries are not physical walls.
    const lower = neighbours.some(span => span.floor < level.height && span.ceil > level.height + .001);
    const higher = neighbours.filter(span => span.floor > level.height + .001 && span.floor < cell.ceil)
      .reduce((height, span) => Math.min(height, span.floor), Infinity);
    const exteriorEdge = level.exterior && !(cell.flags & F.WALLED);
    const kind = lower ? 'drop' : Number.isFinite(higher) ? 'riser' : exteriorEdge ? 'exterior' : 'wall';
    const wallHeight = precision(kind === 'drop' || kind === 'exterior' ? 0
      : Math.max(0, Math.min(cutawayHeight, cell.ceil - level.height, higher - level.height)));
    const fixed = (side.axis === 'x' ? cell.y : cell.x) + side.edge;
    const start = side.axis === 'x' ? cell.x : cell.y;
    const key = JSON.stringify([side.axis, fixed, side.dx, side.dy, kind, wallHeight]);
    if (!lines.has(key)) lines.set(key, { axis: side.axis, fixed, normalX: side.dx, normalY: side.dy, kind, wallHeight, starts: [] });
    lines.get(key).starts.push(start);
  }
  const result = [];
  for (const line of lines.values()) {
    const starts = [...new Set(line.starts)].sort((a, b) => a - b);
    let first = starts[0], end = first + 1;
    const emit = () => result.push({
      x0: (line.axis === 'x' ? first : line.fixed) / stride,
      y0: (line.axis === 'x' ? line.fixed : first) / stride,
      x1: (line.axis === 'x' ? end : line.fixed) / stride,
      y1: (line.axis === 'x' ? line.fixed : end) / stride,
      height: level.height, wallHeight: line.wallHeight, kind: line.kind,
      normalX: line.normalX, normalY: line.normalY,
    });
    for (const next of starts.slice(1)) {
      if (next === end) end++;
      else { emit(); first = next; end = next + 1; }
    }
    emit();
  }
  return result;
}

function captureStairs(portals, runs, definition, stride) {
  const byId = new Map(runs.filter(run => run?.id).map(run => [run.id, run]));
  return portals.flatMap((portal, index) => {
    if (!Number.isFinite(portal.floor0) || !Number.isFinite(portal.floor1)
        || !Array.isArray(portal.p0) || !Array.isArray(portal.p1)) return [];
    const from = floorForHeight(definition, portal.floor0, { renderGroup: portal.group0 });
    const to = floorForHeight(definition, portal.floor1, { renderGroup: portal.group1 });
    const arc = portal.arc;
    const run = portal.id ? byId.get(portal.id) : null;
    const curved = arc && ['cx', 'cz', 'ri', 'ro', 'theta0', 'sweep'].every(key => Number.isFinite(arc[key]));
    const count = Math.max(1, Math.min(512, Math.ceil(Number(portal.rises || arc?.treads) || 1)));
    const points = Array.from({ length: count + 1 }, (_, step) => {
      const t = step / count, angle = curved ? arc.theta0 + arc.sweep * t : 0;
      const radius = curved ? (Number.isFinite(run?.innerR) && Number.isFinite(run?.walkOuter)
        ? (run.innerR + run.walkOuter) / 2 : (arc.ri + arc.ro) / 2) : 0;
      return {
        x: (curved ? arc.cx + Math.sin(angle) * radius : portal.p0[0] + (portal.p1[0] - portal.p0[0]) * t) / stride,
        y: (curved ? arc.cz - Math.cos(angle) * radius : portal.p0[1] + (portal.p1[1] - portal.p0[1]) * t) / stride,
        height: precision(portal.floor0 + (portal.floor1 - portal.floor0) * t),
      };
    });
    return [{ id: portal.id || `stair:${index}`, owner: run?.owner || portal.id?.split(':')[0] || null,
      fromFloorId: from?.id || null, toFloorId: to?.id || null,
      fromHeight: portal.floor0, toHeight: portal.floor1, curved: !!curved,
      width: Number.isFinite(run?.width) ? run.width / stride : curved ? (arc.ro - arc.ri) / stride : null,
      rises: count, points }];
  });
}

export function captureMapArchitecture({ definition, physical, stairPortals = [], stairRuns = [], spaces = [],
  topologyStride = definition?.topologyStride || 1, cutawayHeight = .72 } = {}) {
  if (!(physical?.cells instanceof Map) || !definition?.floors?.length) return null;
  const stride = Math.max(1, Math.floor(Number(topologyStride) || 1));
  const cut = Number.isFinite(cutawayHeight) ? Math.max(0, Math.min(1.1, cutawayHeight)) : .72;
  const groups = new Map(), allBounds = bounds(), buildingBounds = bounds();
  let spanCount = 0;
  for (const [key, spans] of physical.cells) {
    const [x, y] = String(key).split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    for (const span of spans || []) {
      if (!Number.isFinite(span.floor) || !Number.isFinite(span.ceil) || span.ceil <= span.floor) continue;
      const floor = floorForHeight(definition, span.floor, { renderGroup: span.renderGroup, owner: span.owner });
      if (!floor) continue;
      const height = precision(span.floor), exterior = isOutdoorZone(span.zone);
      const metadata = { floorId: floor.id, height, renderGroup: span.renderGroup || null,
        spaceId: span.spaceId || null, owner: span.owner || null, zone: span.zone ?? null,
        stair: !!(span.flags & F.STAIR), exterior };
      const id = `level:${JSON.stringify(Object.values(metadata))}`;
      if (!groups.has(id)) groups.set(id, { id, ...metadata, cells: new Map(), bounds: bounds() });
      const level = groups.get(id);
      level.cells.set(key, { x, y, ceil: precision(span.ceil), flags: span.flags || 0 });
      grow(level.bounds, x / stride, y / stride, 1 / stride, 1 / stride);
      grow(allBounds, x / stride, y / stride, 1 / stride, 1 / stride);
      if (!exterior) grow(buildingBounds, x / stride, y / stride, 1 / stride, 1 / stride);
      spanCount++;
    }
  }
  const levels = [...groups.values()].sort((a, b) => a.height - b.height || a.id.localeCompare(b.id)).map(level => {
    assignRoomComponents(level, spaces, stride);
    const surfaces = mergeSurfaces(level.cells, stride);
    const boundaries = exposedBoundaries(level, physical, stride, cut);
    const { cells, ...metadata } = level;
    return { ...metadata, cellCount: cells.size, surfaces, boundaries };
  });
  const floors = definition.floors.map(floor => {
    const own = levels.filter(level => level.floorId === floor.id), box = bounds();
    for (const level of own) grow(box, level.bounds.minX, level.bounds.minY,
      level.bounds.maxX - level.bounds.minX, level.bounds.maxY - level.bounds.minY);
    return { id: floor.id, levelIds: own.map(level => level.id), bounds: validBounds(box) };
  });
  return freeze({ version: 1, available: levels.length > 0,
    units: { horizontalMetresPerUnit: CELL * stride, verticalMetresPerUnit: 1, topologyStride: stride },
    origin: { x: 0, y: 0, height: 0 }, bounds: validBounds(allBounds), buildingBounds: validBounds(buildingBounds),
    floors, levels, stairs: captureStairs(stairPortals, stairRuns, definition, stride),
    stats: { physicalCells: physical.cells.size, spans: spanCount, levels: levels.length,
      surfaces: levels.reduce((sum, level) => sum + level.surfaces.length, 0),
      boundaries: levels.reduce((sum, level) => sum + level.boundaries.length, 0) },
  });
}
