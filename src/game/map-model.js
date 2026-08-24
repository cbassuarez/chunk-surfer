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
    // The topology is intentionally coarsened for a quiet, readable map. Sight
    // is not: it keeps the compiled half-metre physical cells so a thin wall,
    // gate pier or exterior corner cannot disappear into a one-metre thumbnail.
    visibilityOpen: new Set(),
    visibilityScale: stride,
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  }));

  for (const [key, spans] of physical.cells) {
    const [physicalX, physicalY] = key.split(',').map(Number);
    for (const span of spans || []) {
      const floor = floorForHeight(definition, span.floor, { renderGroup: span.renderGroup });
      if (!floor) continue;
      const runtimeFloor = floors.find((candidate) => candidate.id === floor.id);
      runtimeFloor.open.add(mapKey(Math.floor(physicalX / stride), Math.floor(physicalY / stride)));
      runtimeFloor.visibilityOpen.add(mapKey(physicalX, physicalY));
    }
  }

  for (const floor of floors) {
    floor.bounds = boundsFromOpen(floor.open);
    floor.runs = topologyRuns(floor.open);
  }

  const targets = definition.targets.map((target) => {
    const projected = projectLogical(target.logical);
    const floor = floorForHeight(definition, projected.height ?? projected.y, { renderGroup: projected.renderGroup });
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
  const spaces=(definition.spaces||[]).map((space)=>{
    const projected=projectLogical(space.logical);
    const floor=definition.floors.find((candidate)=>candidate.id===space.floorId)
      ||floorForHeight(definition,projected.height??projected.y,{renderGroup:projected.renderGroup});
    const position=space.mapPosition
      ? {x:Number(space.mapPosition.x),y:Number(space.mapPosition.y)}
      : {x:Number(projected.x)/stride,y:Number(projected.z??projected.mapY??projected.y)/stride};
    return{...space,floorId:floor?.id||null,position,height:Number(projected.height??projected.y)||0};
  });
  const landmarks=(definition.landmarks||[]).map((landmark)=>{
    const projected=projectLogical(landmark.logical),floor=floorForHeight(definition,projected.height??projected.y,{renderGroup:projected.renderGroup});
    return{...landmark,floorId:floor?.id||null,position:{x:Number(projected.x)/stride,y:Number(projected.z??projected.mapY??projected.y)/stride},height:Number(projected.height??projected.y)||0};
  });

  const connectors = [];
  for (let index = 0; index < stairPortals.length; index++) {
    const portal = stairPortals[index];
    const floorA = floorForHeight(definition, portal.floor0, { renderGroup: portal.group0 });
    const floorB = floorForHeight(definition, portal.floor1, { renderGroup: portal.group1 });
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

  // THE PAGE IS THE PLAN, NOT EVERY CELL THE FLOOR OWNS.
  //
  // `boundsFromOpen` frames every walkable cell on a floor. That was right while
  // the ground floor WAS the building; since the exterior civic block landed,
  // ground also owns a street ring, a park and the arrival road — roughly four
  // times the footprint, most of it blank tarmac. fitBounds then drew Ellery as
  // a thumbnail in one corner of the page and the rest of the panel as nothing,
  // which is a map that has stopped answering the question it is for.
  //
  // Frame what the page actually labels: the rooms, spaces and landmarks the
  // plan carries on that floor, padded, and never larger than the floor itself.
  // A floor with no named features (there are none today) keeps its open bounds.
  const PAGE_PAD = 6;
  for (const floor of floors) {
    const points = [...targets, ...spaces, ...landmarks]
      .filter((feature) => feature.floorId === floor.id && feature.position)
      .map((feature) => feature.position);
    if (points.length < 2) continue;
    const open = floor.bounds;
    const framed = {
      minX: Math.max(open.minX, Math.min(...points.map((p) => p.x)) - PAGE_PAD),
      maxX: Math.min(open.maxX, Math.max(...points.map((p) => p.x)) + PAGE_PAD),
      minY: Math.max(open.minY, Math.min(...points.map((p) => p.y)) - PAGE_PAD),
      maxY: Math.min(open.maxY, Math.max(...points.map((p) => p.y)) + PAGE_PAD),
    };
    if (framed.maxX > framed.minX && framed.maxY > framed.minY) floor.bounds = framed;
  }

  const source = {
    version: definition.version,
    definition,
    topologyStride: stride,
    floors,
    targets,spaces,landmarks,
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
    const floor = floorForHeight(source.definition, projected.height ?? projected.y, { renderGroup: projected.renderGroup });
    const blocked = !door.open && !!(door.sealed || door.blocked || door.retired);
    const locked = !door.open && !blocked && !!door.keyId && !hasKey(door.keyId);
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
      traversable: !locked && !blocked,
      state: door.open ? 'open' : blocked ? 'sealed' : locked ? 'locked' : 'closed',
      widthAxis: door.widthAxis || 'x',
      apertureWidth: Math.max(.1, Number(door.aperture?.width) || 1),
    };
  });
}

function normalizePlayer(source, player) {
  const stride = source.topologyStride || 1;
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y)
      || !Number.isFinite(player.height)) {
    return {
      resolved: false, floorId: null, roomId: player?.roomId || null,
      areaLabel: player?.areaLabel || null,
      position: null, heading: Number(player?.heading) || 0,
    };
  }
  const floor = floorForHeight(source.definition, player.height, { renderGroup: player.renderGroup });
  return {
    resolved: !!floor,
    floorId: floor?.id || null,
    roomId: player.roomId || null,
    areaLabel: player.areaLabel || null,
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
  activeWaypoint = null,
  playerWaypoint = null,
  player = null,
  doors = [],
  contacts = [],
  equipmentMarkers = [],
  navigation = null,
  landmarkState = {},
  discoveredFloorIds = new Set(),
  visitedSpaceIds = new Set(),
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
    // A target must be a REAL room id. Matching on a falsy target made every space
  // with `roomId: null` — landmarks, and now the unnamed `???` rooms — answer to
  // "no target at all", so the monitor read TARGET ??? the moment you started a
  // run with no waypoint set.
  const targetRoomId = objective?.target || null;
  const waypointSpace = targetRoomId
    ? (spaces.find((space) => space.roomId === targetRoomId) || null)
    : null;
    return {
      version:1, floors:[fallbackFloor], connectors:[], doors:[], spaces,
      player:{resolved:false,floorId:'unknown',roomId:player?.roomId||null,areaLabel:player?.areaLabel||null,position:null,heading:Number(player?.heading)||0},
      waypoint:activeWaypoint|| (waypointSpace?{roomId:waypointSpace.roomId,spaceId:waypointSpace.id,floorId:'unknown',position:null}:null),
      route:{status:'unresolved',points:[],nextConnectorId:null,floorDelta:0}, contacts:[],equipmentMarkers:[],
      progress:{done:Number(job?.done)||0,total:Number(job?.total)||spaces.length},
      policy:resolveMapPolicy(navigation), warnings:['MAP GEOMETRY UNAVAILABLE'],
    };
  }

  const policy = resolveMapPolicy(navigation);
  const playerState = normalizePlayer(source, player);
  const discovered = discoveredFloorIds instanceof Set ? discoveredFloorIds : new Set(discoveredFloorIds || []);
  const visited = visitedSpaceIds instanceof Set ? visitedSpaceIds : new Set(visitedSpaceIds || []);
  // The issued plan always exposes the building's five structural floors.
  // Discovery changes room/landmark status; it no longer makes an entire floor
  // tab vanish from the player's map.
  const visibleFloors = source.floors.map((floor)=>({
    ...floor,
    discovered:floor.visibility!=='discovered'||discovered.has(floor.id)||playerState.floorId===floor.id,
  }));
  const visibleFloorIds = new Set(visibleFloors.map((floor) => floor.id));
  const visibleConnectors = source.connectors.filter((connector) => visibleFloorIds.has(connector.a.floorId) && visibleFloorIds.has(connector.b.floorId));
  const visibleDoors = doors.filter((door) => !door.floorId || visibleFloorIds.has(door.floorId));
  let spaces = source.targets.filter((target)=>visibleFloorIds.has(target.floorId)).map((target) => {
    const room = roomEntry(job, target.roomId) || {};
    const notes = Array.isArray(room.notes) ? room.notes : [];
    const current = playerState.roomId === target.roomId;
    const marked = objective?.target === target.roomId || !!room.marked;
    const state = objectiveState({ ...room, current, marked });
    const entrances=(target.doorIds||[]).map((id)=>visibleDoors.find((door)=>door.id===id)||{id,state:'unknown',open:false,locked:false,traversable:false});
    return {
      id: `space:${target.roomId}`,
      roomId: target.roomId,
      floorId: target.floorId,
      label: String(room.label || target.label || target.roomId).toUpperCase(),
      shortLabel: String(target.shortLabel || room.label || target.roomId)
        .split(/\s+/).map((word) => word[0] || '').join('').slice(0, 4).toUpperCase(),
      position: target.position,
      logical: target.logical || null,
      selectable: target.selectable !== false,
      waypointable: target.waypointable !== false,
      visibility: target.visibility || 'issued',
      current,
      visited:current||visited.has(`space:${target.roomId}`),
      waypoint: marked,
      entrances,
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
  for(const authored of source.spaces||[]){
    if(!visibleFloorIds.has(authored.floorId))continue;
    const current=playerState.floorId===authored.floorId&&playerState.position&&authored.position
      ? Math.hypot(playerState.position.x-authored.position.x,playerState.position.y-authored.position.y)<=Number(authored.currentRadius||5)
      : false;
    const entrances=(authored.doorIds||[]).map((id)=>visibleDoors.find((door)=>door.id===id)||{id,state:'unknown',open:false,locked:false,traversable:false});
    spaces.push({
      id:authored.id,kind:'facility',roomId:authored.roomId||null,floorId:authored.floorId,
      label:String(authored.label||authored.id).toUpperCase(),shortLabel:String(authored.shortLabel||authored.label||authored.id).toUpperCase(),
      position:authored.position,logical:authored.logical||null,selectable:authored.selectable!==false,
      waypointable:authored.waypointable!==false,visibility:authored.visibility||'issued',current,waypoint:false,
      visited:current||visited.has(authored.id)||!!authored.visited,entrances,objective:null,
    });
  }
  for(const landmark of source.landmarks||[]){
    const live=landmarkState?.[landmark.id]||{};
    if(!visibleFloorIds.has(landmark.floorId))continue;
    if(!live.visible){
      // A room you have not read about yet is still a room that is THERE. Drawing
      // nothing said "this floor is empty", which is a lie the map should not tell:
      // the player could not know there was anything to unlock. It is marked and
      // unnamed — `???` — and it cannot be selected or targeted until a log names
      // it, so knowing it exists costs nothing and gives nothing away.
      spaces.push({id:`${landmark.id}:unknown`,kind:'unknown',roomId:null,floorId:landmark.floorId,
        label:'???',shortLabel:'???',position:landmark.position,selectable:false,waypointable:false,
        visibility:'unknown',unknown:true,current:false,waypoint:false,objective:null});
      continue;
    }
    spaces.push({id:landmark.id,kind:'landmark',roomId:null,floorId:landmark.floorId,label:String(live.label||landmark.label).toUpperCase(),shortLabel:landmark.shortLabel||'LAND',position:landmark.position,logical:landmark.logical||null,selectable:landmark.selectable!==false,waypointable:landmark.waypointable!==false,visibility:'discovered',current:false,waypoint:false,entrances:[],objective:null});
  }

  // Same rule as the unresolved-player path above: a target must be a real room
  // id, or every `roomId: null` space answers to "nothing is set".
  const liveTargetRoomId = objective?.target || null;
  const waypointSpace = liveTargetRoomId
    ? (spaces.find((space) => space.roomId === liveTargetRoomId) || null)
    : null;
  const roomWaypoint = waypointSpace ? {
    label: waypointSpace.label,
    kind: 'room',
    playerSelected: true,
    roomId: waypointSpace.roomId,
    spaceId: waypointSpace.id,
    floorId: waypointSpace.floorId,
    position: waypointSpace.position,
  } : null;
  const explicitPlayerWaypoint=playerWaypoint?.position
    ? {
        id:playerWaypoint.id||playerWaypoint.spaceId||null,label:playerWaypoint.label||null,kind:'space',playerSelected:true,
        roomId:playerWaypoint.roomId||null,spaceId:playerWaypoint.spaceId||null,floorId:playerWaypoint.floorId||null,
        position:{x:Number(playerWaypoint.position.x),y:Number(playerWaypoint.position.y)},
      }
    : null;
  const guidanceWaypoint=activeWaypoint?.position
    ? {
        id:activeWaypoint.id||null,
        label:activeWaypoint.label||null,
        kind:activeWaypoint.kind||'position',
        playerSelected:!!activeWaypoint.playerSelected,
        roomId:activeWaypoint.roomId||null,
        spaceId:activeWaypoint.spaceId||null,
        propId:activeWaypoint.propId||null,
        doorId:activeWaypoint.doorId||null,
        floorId:activeWaypoint.floorId||null,
        position:{x:Number(activeWaypoint.position.x),y:Number(activeWaypoint.position.y)},
      }
    : null;
  // A schema-2 personal space mark is explicit and stays independent. Legacy
  // room targets yield to current mandatory guidance so an old save cannot
  // hide the active story beacon behind a stale five-room target.
  const waypoint=explicitPlayerWaypoint||guidanceWaypoint||roomWaypoint;
  spaces=spaces.map((space)=>({...space,waypoint:!!(waypoint?.spaceId&&waypoint.spaceId===space.id)}));

  const route = resolveMapRoute({
    floors: visibleFloors,
    connectors: visibleConnectors,
    doors: visibleDoors,
    player: playerState,
    waypoint,
    playerWaypoint:explicitPlayerWaypoint||roomWaypoint,
    guidanceWaypoint,
  });

  const normalizedContacts = (contacts || [])
    .map((contact) => normalizeContact(contact, source.topologyStride || 1))
    .filter(Boolean);
  const normalizedEquipmentMarkers=(equipmentMarkers||[])
    .filter((marker)=>marker&&typeof marker.id==='string'&&visibleFloorIds.has(marker.floorId))
    .filter((marker)=>Number.isFinite(Number(marker.position?.x))&&Number.isFinite(Number(marker.position?.y)))
    .map((marker)=>({
      id:marker.id,kind:String(marker.kind||'equipment'),label:String(marker.label||marker.id).toUpperCase(),
      floorId:marker.floorId,position:{x:Number(marker.position.x),y:Number(marker.position.y)},
      carrierOpen:!!marker.carrierOpen,
    }));

  const warnings = [];
  if (!playerState.resolved) warnings.push('CURRENT POSITION UNRESOLVED');
  for (const space of spaces) if (!space.floorId || !space.position) warnings.push(`${space.label}: POSITION UNAVAILABLE`);

  return {
    version: 2,
    sourceVersion: source.version,
    topologyStride: source.topologyStride,
    floors: visibleFloors,
    connectors: visibleConnectors,
    doors: visibleDoors,
    spaces,
    player: playerState,
    waypoint,
    playerWaypoint:explicitPlayerWaypoint||roomWaypoint,
    guidanceWaypoint,
    route,
    contacts: normalizedContacts,
    equipmentMarkers:normalizedEquipmentMarkers,
    progress: {
      done: Math.max(0, Number(job?.done) || 0),
      total: Math.max(0, Number.isFinite(Number(job?.total)) ? Number(job.total) : spaces.filter((space)=>space.objective).length),
    },
    policy,
    warnings,
  };
}

export function mapFloor(model, floorId) {
  return model?.floors?.find((floor) => floor.id === floorId) || null;
}

export function mapCurrentAreaLabel(model) {
  const roomId = model?.player?.roomId;
  if (roomId) return mapSpaceByRoom(model, roomId)?.label || roomId;
  if (model?.player?.areaLabel) return String(model.player.areaLabel).toUpperCase();
  return mapFloor(model, model?.player?.floorId)?.label || 'POSITION UNKNOWN';
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
