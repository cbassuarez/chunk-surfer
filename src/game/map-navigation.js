// Pure spatial navigation for the MAP section.

import { mapSpace, mapSpaceByRoom } from './map-model.js';

export const MAP_VIEW_DEFAULTS = Object.freeze({ viewMode: 'stack', rotation: 0, zoom: 1, panX: 0, panY: 0 });
export const MAP_ZOOM_LIMITS = Object.freeze({ min: .7, max: 2.5 });
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const rotation = value => ((Math.round(finite(value)) % 4) + 4) % 4;

// Console focus follows the actual key rectangles, not their declaration
// order. Pixel aspect matters: one display row is taller than one column.
export function moveMapConsoleFocus(currentId, vector, controls = [], { cellAspect = 1 } = {}) {
  const current=controls.find(control=>control.id===currentId);
  if(!current)return controls[0]?.id||null;
  const center=control=>({x:(control.x+control.w/2)*cellAspect,y:control.y+control.h/2});
  const origin=center(current),horizontal=Math.abs(vector.x)>Math.abs(vector.y);
  const direction=horizontal?Math.sign(vector.x):Math.sign(vector.y);
  if(!direction)return current.id;
  const next=controls.filter(control=>control.id!==current.id).map(control=>{
    const p=center(control),dx=p.x-origin.x,dy=p.y-origin.y;
    const forward=(horizontal?dx:dy)*direction,perpendicular=Math.abs(horizontal?dy:dx);
    // A full-width SET key still lies directly above each smaller key below
    // it. Score the perpendicular rectangle gap first, not only cap centres.
    const crossGap=horizontal
      ?Math.max(0,current.y-(control.y+control.h),control.y-(current.y+current.h))
      :Math.max(0,current.x-(control.x+control.w),control.x-(current.x+current.w))*cellAspect;
    return{control,score:forward>.001?forward+crossGap*4+perpendicular*.1:Infinity};
  }).filter(candidate=>Number.isFinite(candidate.score)).sort((a,b)=>a.score-b.score||a.control.id.localeCompare(b.control.id))[0];
  return next?.control.id||current.id;
}

function visibleFloors(model) {
  return (model?.floors || []).slice().sort((a, b) => a.order - b.order);
}

function selectableOnFloor(model, floorId) {
  return (model?.spaces || []).filter((space) => space.floorId === floorId && space.selectable !== false);
}

export function selectedMapSpace(state, model) {
  const id = state?.selectedByFloor?.[state?.floorId];
  return mapSpace(model, id);
}

function firstSelectable(model, floorId = null) {
  const spaces = floorId ? selectableOnFloor(model, floorId) : (model?.spaces || []).filter((space) => space.selectable !== false);
  return spaces[0] || null;
}

export function initialMapNav({ model, preferredRoomId = null } = {}) {
  const preferred = preferredRoomId ? mapSpaceByRoom(model, preferredRoomId) : null;
  const current = model?.player?.roomId ? mapSpaceByRoom(model, model.player.roomId) : null;
  const playerFloor = model?.player?.floorId || null;
  const onPlayerFloor = playerFloor ? firstSelectable(model, playerFloor) : null;
  const selected = preferred || current || onPlayerFloor || firstSelectable(model);
  const floorId = preferred?.floorId || current?.floorId || playerFloor || selected?.floorId || visibleFloors(model)[0]?.id || null;
  const fallback = (selected?.floorId === floorId ? selected : null) || firstSelectable(model, floorId);
  return {
    floorId,
    selectedByFloor: fallback ? { [floorId]: fallback.id } : {},
    ...MAP_VIEW_DEFAULTS,
    focusedControlId: null,
    manuallyChangedFloor: false,
    mode: 'browse',
  };
}

export function repairMapNav(state, model) {
  if (!state) return initialMapNav({ model });
  const floors = visibleFloors(model);
  if (!floors.length) return initialMapNav({ model });
  const floorId = floors.some((floor) => floor.id === state.floorId)
    ? state.floorId
    : model?.player?.floorId || floors[0].id;
  const selectedByFloor = { ...(state.selectedByFloor || {}) };

  for (const floor of floors) {
    const wanted = selectedByFloor[floor.id];
    if (!mapSpace(model, wanted) || mapSpace(model, wanted).floorId !== floor.id) {
      selectedByFloor[floor.id] = firstSelectable(model, floor.id)?.id || null;
    }
  }

  return {
    floorId,
    selectedByFloor,
    roomFile: state.roomFile?.spaceId===selectedByFloor[floorId] ? state.roomFile : null,
    viewMode: state.viewMode === 'floor' || state.viewMode === 'focus' ? 'floor' : 'stack',
    rotation: rotation(state.rotation),
    zoom: clamp(finite(state.zoom, 1), MAP_ZOOM_LIMITS.min, MAP_ZOOM_LIMITS.max),
    panX: clamp(finite(state.panX), -200, 200),
    panY: clamp(finite(state.panY), -200, 200),
    focusedControlId: typeof state.focusedControlId==='string'&&state.focusedControlId ? state.focusedControlId : null,
    manuallyChangedFloor: !!state.manuallyChangedFloor,
    mode: state.mode || 'browse',
  };
}

function changeFloor(state, delta, model) {
  const floors = visibleFloors(model);
  if (!floors.length) return state;
  const at = Math.max(0, floors.findIndex((floor) => floor.id === state.floorId));
  const floorId = floors[(at + delta + floors.length) % floors.length].id;
  const selectedByFloor = { ...state.selectedByFloor };
  if (!selectedByFloor[floorId]) selectedByFloor[floorId] = firstSelectable(model, floorId)?.id || null;
  return { ...state, floorId, selectedByFloor, manuallyChangedFloor: true };
}

function spatialScore(origin, candidate, direction, projectedPoints = null) {
  const from = projectedPoints?.[origin.id] || origin.position;
  const to = projectedPoints?.[candidate.id] || candidate.position;
  if (!from || !to) return Infinity;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-6) return Infinity;
  const alignment = (dx / distance) * direction.x + (dy / distance) * direction.y;
  if (alignment < 0.30) return Infinity;
  return distance + (1 - alignment) * 80;
}

function moveSpatial(state, vector, model, projectedPoints = null) {
  const current = selectedMapSpace(state, model);
  const candidates = selectableOnFloor(model, state.floorId);
  if (!candidates.length) return state;
  if (!current) {
    const next = candidates[0];
    return { ...state, selectedByFloor: { ...state.selectedByFloor, [state.floorId]: next.id } };
  }

  const next = candidates
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => ({ candidate, score: spatialScore(current, candidate, vector, projectedPoints) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score || a.candidate.id.localeCompare(b.candidate.id))[0]?.candidate;

  if (!next) return state;
  return { ...state, selectedByFloor: { ...state.selectedByFloor, [state.floorId]: next.id } };
}

function selectRoom(state, roomId, model) {
  const target = mapSpaceByRoom(model, roomId);
  if (!target) return state;
  return {
    ...state,
    floorId: target.floorId,
    selectedByFloor: { ...state.selectedByFloor, [target.floorId]: target.id },
    manuallyChangedFloor: false,
    panX: 0, panY: 0,
  };
}

function selectSpace(state, spaceId, model) {
  const target = mapSpace(model, spaceId);
  if (!target || target.selectable === false) return state;
  return {
    ...state,
    floorId: target.floorId,
    selectedByFloor: { ...state.selectedByFloor, [target.floorId]: target.id },
    manuallyChangedFloor: false,
  };
}

function centerPlayer(state, model) {
  const room = model?.player?.roomId ? mapSpaceByRoom(model, model.player.roomId) : null;
  const floorId = model?.player?.floorId || room?.floorId;
  if (!floorId) return state;
  const selected = room || firstSelectable(model, floorId);
  return {
    ...state,
    floorId,
    selectedByFloor: selected ? { ...state.selectedByFloor, [floorId]: selected.id } : state.selectedByFloor,
    manuallyChangedFloor: false,
    panX: 0, panY: 0,
  };
}

export function reduceMapNav(state, event, model) {
  return repairMapNav(reduceMapNavEvent(state,event,model),model);
}

function reduceMapNavEvent(state, event, model) {
  const current = repairMapNav(state, model);
  switch (event?.type) {
    case 'MOVE_SPATIAL': return moveSpatial(current, event.vector || { x: 0, y: 0 }, model, event.projectedPoints);
    case 'NEXT_FLOOR': return changeFloor(current, 1, model);
    case 'PREV_FLOOR': return changeFloor(current, -1, model);
    case 'SELECT_ROOM': return selectRoom(current, event.roomId, model);
    case 'SELECT_SPACE': return selectSpace(current, event.spaceId, model);
    case 'SELECT_FLOOR': {
      const floorId=String(event.floorId||'');
      if(!visibleFloors(model).some((floor)=>floor.id===floorId))return current;
      const selectedByFloor={...current.selectedByFloor};
      if(!selectedByFloor[floorId])selectedByFloor[floorId]=firstSelectable(model,floorId)?.id||null;
      return{...current,floorId,selectedByFloor,manuallyChangedFloor:true};
    }
    case 'CENTER_PLAYER': return centerPlayer(current, model);
    case 'FOCUS_CONTROL': return { ...current, focusedControlId: typeof event.controlId==='string'&&event.controlId ? event.controlId : null };
    case 'SET_VIEW_MODE': return { ...current, viewMode: event.mode === 'floor' || event.mode === 'focus' ? 'floor' : 'stack', panX: 0, panY: 0 };
    case 'ROTATE': return { ...current, rotation: rotation(current.rotation + finite(event.delta)), panX: 0, panY: 0 };
    case 'ZOOM': return { ...current, zoom: clamp(event.zoom == null ? current.zoom * finite(event.factor, 1) : finite(event.zoom, 1), MAP_ZOOM_LIMITS.min, MAP_ZOOM_LIMITS.max) };
    case 'PAN': return { ...current, panX: clamp(current.panX + finite(event.dx), -200, 200), panY: clamp(current.panY + finite(event.dy), -200, 200) };
    case 'RESET_VIEW': return { ...current, ...MAP_VIEW_DEFAULTS };
    case 'MODEL_REFRESH': return repairMapNav(current, model);
    default: return current;
  }
}
