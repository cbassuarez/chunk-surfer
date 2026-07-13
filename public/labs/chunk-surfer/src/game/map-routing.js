// Pure map routing. Routes are an assistive overlay and connector selector;
// they never move the player or mutate doors/objectives.

import { floorDelta, mapKey, parseMapKey } from './map-projection.js';

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(value, priority) {
    const node = { value, priority };
    this.items.push(node);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].priority <= priority) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = node;
  }
  pop() {
    if (!this.items.length) return null;
    const root = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        const child = right < this.items.length && this.items[right].priority < this.items[left].priority ? right : left;
        if (this.items[child].priority >= last.priority) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return root.value;
  }
}

function nearestOpen(open, point, blocked = new Set(), maxRadius = 10) {
  const cx = Math.round(point.x);
  const cy = Math.round(point.y);
  const direct = mapKey(cx, cy);
  if (open.has(direct) && !blocked.has(direct)) return { x: cx, y: cy };

  let best = null;
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        const key = mapKey(x, y);
        if (!open.has(key) || blocked.has(key)) continue;
        const distance = dx * dx + dy * dy;
        if (!best || distance < best.distance) best = { x, y, distance };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return null;
}

function reconstruct(cameFrom, currentKey) {
  const keys = [currentKey];
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey);
    keys.push(currentKey);
  }
  keys.reverse();
  return keys.map(parseMapKey);
}

function simplify(points) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  let lastDx = points[1].x - points[0].x;
  let lastDy = points[1].y - points[0].y;
  for (let i = 1; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    if (dx !== lastDx || dy !== lastDy) out.push(points[i]);
    lastDx = dx;
    lastDy = dy;
  }
  out.push(points.at(-1));
  return out;
}

export function findGridRoute(floor, startPoint, destinationPoint, { blocked = new Set(), maxVisited = 30000 } = {}) {
  const open = floor?.open;
  if (!(open instanceof Set) || !open.size || !startPoint || !destinationPoint) return null;

  const start = nearestOpen(open, startPoint, blocked);
  const destination = nearestOpen(open, destinationPoint, blocked);
  if (!start || !destination) return null;

  const startKey = mapKey(start.x, start.y);
  const destinationKey = mapKey(destination.x, destination.y);
  if (startKey === destinationKey) return [start, destination];

  const frontier = new MinHeap();
  frontier.push(startKey, 0);
  const cameFrom = new Map();
  const cost = new Map([[startKey, 0]]);
  let visited = 0;

  while (frontier.size && visited++ < maxVisited) {
    const currentKey = frontier.pop();
    if (currentKey === destinationKey) return simplify(reconstruct(cameFrom, currentKey));
    const current = parseMapKey(currentKey);

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      const nextKey = mapKey(next.x, next.y);
      if (!open.has(nextKey) || blocked.has(nextKey)) continue;
      const nextCost = cost.get(currentKey) + 1;
      if (cost.has(nextKey) && cost.get(nextKey) <= nextCost) continue;
      cost.set(nextKey, nextCost);
      cameFrom.set(nextKey, currentKey);
      const heuristic = Math.abs(destination.x - next.x) + Math.abs(destination.y - next.y);
      frontier.push(nextKey, nextCost + heuristic);
    }
  }

  return null;
}

export function findFloorPath(floors, connectors, fromId, toId) {
  if (!fromId || !toId) return null;
  if (fromId === toId) return [fromId];
  const known = new Set((floors || []).map((floor) => floor.id));
  if (!known.has(fromId) || !known.has(toId)) return null;

  const queue = [fromId];
  const cameFrom = new Map();
  const seen = new Set([fromId]);

  while (queue.length) {
    const current = queue.shift();
    for (const connector of connectors || []) {
      let next = null;
      if (connector.a.floorId === current) next = connector.b.floorId;
      else if (connector.b.floorId === current) next = connector.a.floorId;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      cameFrom.set(next, current);
      if (next === toId) {
        const path = [toId];
        let at = toId;
        while (cameFrom.has(at)) { at = cameFrom.get(at); path.push(at); }
        return path.reverse();
      }
      queue.push(next);
    }
  }

  return null;
}

function blockedCellsForFloor(doors, floorId) {
  const out = new Set();
  for (const door of doors || []) {
    if (door.floorId !== floorId || door.traversable !== false || !door.position) continue;
    out.add(mapKey(door.position.x, door.position.y));
  }
  return out;
}

function endpointFor(connector, floorId) {
  if (connector.a.floorId === floorId) return connector.a;
  if (connector.b.floorId === floorId) return connector.b;
  return null;
}

export function resolveMapRoute({ floors = [], connectors = [], doors = [], player, waypoint }) {
  if (!player?.resolved || !waypoint?.position || !player.floorId || !waypoint.floorId) {
    return { status: 'unresolved', points: [], nextConnectorId: null, floorDelta: 0 };
  }

  const currentFloor = floors.find((floor) => floor.id === player.floorId);
  if (!currentFloor) return { status: 'unresolved', points: [], nextConnectorId: null, floorDelta: 0 };
  const blocked = blockedCellsForFloor(doors, player.floorId);

  if (player.floorId === waypoint.floorId) {
    const points = findGridRoute(currentFloor, player.position, waypoint.position, { blocked });
    return {
      status: points ? 'ok' : 'blocked',
      points: points || [],
      nextConnectorId: null,
      floorDelta: 0,
      targetKind: 'waypoint',
      targetPosition: waypoint.position,
    };
  }

  const floorPath = findFloorPath(floors, connectors, player.floorId, waypoint.floorId);
  if (!floorPath || floorPath.length < 2) {
    return {
      status: 'blocked', points: [], nextConnectorId: null,
      floorDelta: floorDelta(floors, player.floorId, waypoint.floorId),
      targetKind: 'floor-bearing', targetPosition: null,
    };
  }

  const nextFloor = floorPath[1];
  const candidates = connectors.filter((connector) => {
    const ids = [connector.a.floorId, connector.b.floorId];
    return ids.includes(player.floorId) && ids.includes(nextFloor);
  });

  let best = null;
  for (const connector of candidates) {
    const endpoint = endpointFor(connector, player.floorId);
    if (!endpoint) continue;
    const points = findGridRoute(currentFloor, player.position, endpoint.position, { blocked });
    if (!points) continue;
    const cost = points.length;
    if (!best || cost < best.cost) best = { connector, endpoint, points, cost };
  }

  return {
    status: best ? 'ok' : 'blocked',
    points: best?.points || [],
    nextConnectorId: best?.connector.id || null,
    floorDelta: floorDelta(floors, player.floorId, waypoint.floorId),
    targetKind: best ? 'connector' : 'floor-bearing',
    targetPosition: best?.endpoint.position || null,
  };
}

export function connectorById(connectors, id) {
  return (connectors || []).find((connector) => connector.id === id) || null;
}
