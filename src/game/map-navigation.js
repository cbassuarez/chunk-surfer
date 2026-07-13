// Pure spatial navigation for the MAP section.

import { mapSpace, mapSpaceByRoom } from './map-model.js';

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
    viewMode: 'overview',
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
    viewMode: state.viewMode === 'focus' ? 'focus' : 'overview',
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

function spatialScore(origin, candidate, direction) {
  const dx = candidate.position.x - origin.position.x;
  const dy = candidate.position.y - origin.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-6) return Infinity;
  const alignment = (dx / distance) * direction.x + (dy / distance) * direction.y;
  if (alignment < 0.30) return Infinity;
  return distance + (1 - alignment) * 80;
}

function moveSpatial(state, vector, model) {
  const current = selectedMapSpace(state, model);
  const candidates = selectableOnFloor(model, state.floorId);
  if (!candidates.length) return state;
  if (!current) {
    const next = candidates[0];
    return { ...state, selectedByFloor: { ...state.selectedByFloor, [state.floorId]: next.id } };
  }

  const next = candidates
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => ({ candidate, score: spatialScore(current, candidate, vector) }))
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
  };
}

export function reduceMapNav(state, event, model) {
  const current = repairMapNav(state, model);
  switch (event?.type) {
    case 'MOVE_SPATIAL': return moveSpatial(current, event.vector || { x: 0, y: 0 }, model);
    case 'NEXT_FLOOR': return changeFloor(current, 1, model);
    case 'PREV_FLOOR': return changeFloor(current, -1, model);
    case 'SELECT_ROOM': return selectRoom(current, event.roomId, model);
    case 'CENTER_PLAYER': return centerPlayer(current, model);
    case 'SET_VIEW_MODE': return { ...current, viewMode: event.mode === 'focus' ? 'focus' : 'overview' };
    case 'MODEL_REFRESH': return repairMapNav(current, model);
    default: return current;
  }
}
