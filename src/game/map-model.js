// Shared runtime model for the field-case MAP and HUD minimap.
//
// Geometry is captured from the compiled floorplan once. Live objective,
// player, door, waypoint, route, and acoustic-contact state are layered on top.

import { floorForHeight, mapKey } from './map-projection.js';
import { resolveMapRoute } from './map-routing.js';
import { resolveMapPolicy } from './map-policy.js';
import { validateBuildingMap, validateMapSource } from './map-schema.js';

function topologyRuns(open) {
  const rows = new Map();
  for (const key of open || []) {
    const [x, y] = String(key).split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const values = rows.get(y) || [];
    values.push(x);
    rows.set(y, values);
  }

  const runs = [];
  for (const [y, values] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    values.sort((a, b) => a - b);
    let start = null;
    let end = null;
    for (const x of values) {
      if (start == null) {
        start = end = x;
      } else if (x <= end + 1) {
        end = Math.max(end, x);
      } else {
        runs.push({ y, x0: start, x1: end });
        start = end = x;
      }
    }
    if (start != null) runs.push({ y, x0: start, x1: end });
  }
  return runs;
}

function boundsFromOpen(open) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const key of open) {
    const [x, y] = key.split(',').map(Number);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

function roomEntry(job, roomId) {
  return (job?.rooms || []).find((room) => room.roomId === roomId) || null;
}

function normalizeContact(contact, stride) {
  if (!contact || contact.state === 'none') return null;
  const observation = contact.observation || {};
  const position = observation.position
    ? { x: observation.position.x / stride, y: observation.position.y / stride }
    : null;
  const region = Array.isArray(observation.region)
    ? observation.region.map((point) => ({ x: point.x / stride, y: point.y / stride }))
    : null;
  return {
    ...contact,
    observation: {
      ...observation,
      position,
      region,
    },
  };
}

export function captureFloorplanMapSource({
  definition,
  physical,
  stairPortals = [],
  projectLogical,
  labelForRoom = (roomId) => roomId,
} = {}) {
  const authored = validateBuildingMap(definition, {
    requiredRooms: (definition?.targets || []).map((target) => target.roomId),
  });
  if (!authored.ok) throw new Error(`invalid building map:\n${authored.errors.join('\n')}`);
  if (!physical?.cells || typeof projectLogical !== 'function') {
    throw new Error('captureFloorplanMapSource requires compiled physical cells and projectLogical()');
  }

  const stride = Math.max(1, Math.floor(definition.topologyStride || 1));
  const floors = definition.floors.map((floor) => ({
    ...floor,
    open: new Set(),
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  }));

  for (const [key, spans] of physical.cells) {
    const [physicalX, physicalY] = key.split(',').map(Number);
    for (const span of spans || []) {
      const floor = floorForHeight(definition, span.floor);
      if (!floor) continue;
      const runtimeFloor = floors.find((candidate) => candidate.id === floor.id);
      runtimeFloor.open.add(mapKey(Math.floor(physicalX / stride), Math.floor(physicalY / stride)));
    }
  }

  for (const floor of floors) {
    floor.bounds = boundsFromOpen(floor.open);
    floor.runs = topologyRuns(floor.open);
  }

  const targets = definition.targets.map((target) => {
    const projected = projectLogical(target.logical);
    const floor = floorForHeight(definition, projected.height ?? projected.y);
    return {
      ...target,
      label: String(labelForRoom(target.roomId) || target.roomId).toUpperCase(),
      floorId: floor?.id || null,
      position: {
        x: Number(projected.x) / stride,
        y: Number(projected.z ?? projected.mapY ?? projected.y) / stride,
      },
      height: Number(projected.height ?? projected.y) || 0,
    };
  });

  const connectors = [];
  for (let index = 0; index < stairPortals.length; index++) {
    const portal = stairPortals[index];
    const floorA = floorForHeight(definition, portal.floor0);
    const floorB = floorForHeight(definition, portal.floor1);
    if (!floorA || !floorB || floorA.id === floorB.id) continue;
    connectors.push({
      id: `connector:${index}:${floorA.id}-${floorB.id}`,
      kind: 'stairs',
      a: {
        floorId: floorA.id,
        position: { x: portal.p0[0] / stride, y: portal.p0[1] / stride },
      },
      b: {
        floorId: floorB.id,
        position: { x: portal.p1[0] / stride, y: portal.p1[1] / stride },
      },
    });
  }

  const source = {
    version: 1,
    definition,
    topologyStride: stride,
    floors,
    targets,
    connectors,
    physicalWidth: Math.ceil((physical.width || 1) / stride),
    physicalHeight: Math.ceil((physical.height || 1) / stride),
  };

  const checked = validateMapSource(source);
  if (!checked.ok) throw new Error(`invalid captured map source:\n${checked.errors.join('\n')}`);
  return source;
}

export function captureDoorMapState({ doors = [], projectLogical, source, hasKey = () => false } = {}) {
  const stride = source?.topologyStride || 1;
  if (typeof projectLogical !== 'function') return [];
  return doors.map((door) => {
    const projected = projectLogical({ x: door.cx, y: door.cy }, { authored: false });
    const floor = floorForHeight(source.definition, projected.height ?? projected.y);
    const locked = !door.open && !!door.keyId && !hasKey(door.keyId);
    const closed = !door.open;
    return {
      id: door.id,
      floorId: floor?.id || null,
      position: {
        x: Number(projected.x) / stride,
        y: Number(projected.z ?? projected.y) / stride,
      },
      open: !!door.open,
      keyId: door.keyId || null,
      locked,
      // An unlocked closed door is traversable: route assistance may lead to it,
      // while the world still requires the player to open it.
      traversable: !locked,
      state: door.open ? 'open' : locked ? 'locked' : 'closed',
    };
  });
}

function normalizePlayer(source, player) {
  const stride = source.topologyStride || 1;
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y)
      || !Number.isFinite(player.height)) {
    return {
      resolved: false, floorId: null, roomId: player?.roomId || null,
      position: null, heading: Number(player?.heading) || 0,
    };
  }
  const floor = floorForHeight(source.definition, player.height);
  return {
    resolved: !!floor,
    floorId: floor?.id || null,
    roomId: player.roomId || null,
    position: { x: player.x / stride, y: player.y / stride },
    heading: Number(player.heading) || 0,
  };
}

function objectiveState(room) {
  if (room?.recorded) return 'recorded';
  if (room?.current) return 'current';
  if (room?.marked) return 'marked';
  return room?.visited === false ? 'unvisited' : 'available';
}

export function buildMapModel({
  source,
  job = { rooms: [], done: 0, total: 5 },
  objectiveState: objective = null,
  player = null,
  doors = [],
  contacts = [],
  navigation = null,
} = {}) {
  if (!source) {
    const rooms = Array.isArray(job?.rooms) ? job.rooms : [];
    const fallbackFloor = { id:'unknown', order:0, label:'POSITION UNAVAILABLE', shortLabel:'--', bounds:{minX:0,minY:0,maxX:1,maxY:1}, open:new Set() };
    const spaces = rooms.map((room, index) => {
      const notes = Array.isArray(room.notes) ? room.notes : [];
      const marked = objective?.target === room.roomId || !!room.marked;
      return {
        id:`space:${room.roomId}`, roomId:room.roomId, floorId:'unknown',
        label:String(room.label || room.roomId).toUpperCase(), shortLabel:String(room.label || room.roomId).split(/\s+/).map((word)=>word[0]||'').join('').slice(0,4).toUpperCase(),
        position:null, selectable:true, waypointable:true, visibility:'issued', current:false, waypoint:marked,
        objective:{ required:true, sequence:index+1, state:objectiveState({...room,marked}), recorded:!!room.recorded, marked, stamp:room.stamp||'--:--', notes, fileCount:notes.length, source:room },
      };
    });
    const waypointSpace = spaces.find((space) => space.roomId === objective?.target) || null;
    return {
      version:1, floors:[fallbackFloor], connectors:[], doors:[], spaces,
      player:{resolved:false,floorId:'unknown',roomId:player?.roomId||null,position:null,heading:Number(player?.heading)||0},
      waypoint:waypointSpace?{roomId:waypointSpace.roomId,spaceId:waypointSpace.id,floorId:'unknown',position:null}:null,
      route:{status:'unresolved',points:[],nextConnectorId:null,floorDelta:0}, contacts:[],
      progress:{done:Number(job?.done)||0,total:Number(job?.total)||spaces.length},
      policy:resolveMapPolicy(navigation), warnings:['MAP GEOMETRY UNAVAILABLE'],
    };
  }

  const policy = resolveMapPolicy(navigation);
  const playerState = normalizePlayer(source, player);
  const spaces = source.targets.map((target) => {
    const room = roomEntry(job, target.roomId) || {};
    const notes = Array.isArray(room.notes) ? room.notes : [];
    const current = playerState.roomId === target.roomId;
    const marked = objective?.target === target.roomId || !!room.marked;
    const state = objectiveState({ ...room, current, marked });
    return {
      id: `space:${target.roomId}`,
      roomId: target.roomId,
      floorId: target.floorId,
      label: String(room.label || target.label || target.roomId).toUpperCase(),
      shortLabel: String(target.shortLabel || room.label || target.roomId)
        .split(/\s+/).map((word) => word[0] || '').join('').slice(0, 4).toUpperCase(),
      position: target.position,
      selectable: target.selectable !== false,
      waypointable: target.waypointable !== false,
      visibility: target.visibility || 'issued',
      current,
      waypoint: marked,
      objective: {
        required: true,
        sequence: target.sequence,
        state,
        recorded: !!room.recorded,
        marked,
        stamp: room.stamp || '--:--',
        notes,
        fileCount: notes.length,
        source: room,
      },
    };
  });

  const waypointSpace = spaces.find((space) => space.roomId === objective?.target) || null;
  const waypoint = waypointSpace ? {
    roomId: waypointSpace.roomId,
    spaceId: waypointSpace.id,
    floorId: waypointSpace.floorId,
    position: waypointSpace.position,
  } : null;

  const route = resolveMapRoute({
    floors: source.floors,
    connectors: source.connectors,
    doors,
    player: playerState,
    waypoint,
  });

  const normalizedContacts = (contacts || [])
    .map((contact) => normalizeContact(contact, source.topologyStride || 1))
    .filter(Boolean);

  const warnings = [];
  if (!playerState.resolved) warnings.push('CURRENT POSITION UNRESOLVED');
  for (const space of spaces) if (!space.floorId || !space.position) warnings.push(`${space.label}: POSITION UNAVAILABLE`);

  return {
    version: 1,
    sourceVersion: source.version,
    topologyStride: source.topologyStride,
    floors: source.floors,
    connectors: source.connectors,
    doors,
    spaces,
    player: playerState,
    waypoint,
    route,
    contacts: normalizedContacts,
    progress: {
      done: Math.max(0, Number(job?.done) || 0),
      total: Math.max(0, Number(job?.total) || spaces.length),
    },
    policy,
    warnings,
  };
}

export function mapFloor(model, floorId) {
  return model?.floors?.find((floor) => floor.id === floorId) || null;
}

export function mapSpace(model, spaceId) {
  return model?.spaces?.find((space) => space.id === spaceId) || null;
}

export function mapSpaceByRoom(model, roomId) {
  return model?.spaces?.find((space) => space.roomId === roomId) || null;
}

export function newestMapContact(model) {
  return (model?.contacts || [])
    .slice()
    .sort((a, b) => Number(b.observation?.observedAt || 0) - Number(a.observation?.observedAt || 0))[0] || null;
}
