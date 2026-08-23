// Contextual MAP actions. Gameplay authorities remain outside this module.

import { activeInputPromptDevice, inputPromptLabel } from './bindings.js';

export function resolveMapAction(selected, actionId, api = {}) {
  if (!selected || !actionId) return false;

  switch (actionId) {
    case 'mark':
    case 'unmark':
    case 'mark-waypoint':
    case 'clear-waypoint':
      return typeof api.markSpace === 'function'
        ? !!api.markSpace(selected)
        : selected.roomId && typeof api.markRoom === 'function'
          ? !!api.markRoom(selected.roomId)
          : false;

    case 'read-attached': {
      const doc = selected.objective?.notes?.[0] || selected.attached || null;
      if (!doc || typeof api.readDocument !== 'function') return false;
      api.readDocument(doc);
      return true;
    }

    default:
      return false;
  }
}

export function mapActionRail(selected, { floorCount = 1 } = {}) {
  if (activeInputPromptDevice() === 'controller') {
    const actions = [[inputPromptLabel('select'), 'SELECT ROOM']];
    if (selected?.objective?.notes?.length || selected?.attached) actions.push([inputPromptLabel('confirm'), 'OPEN FILE']);
    if (selected?.waypoint || selected?.marked) actions.push([inputPromptLabel('interact'), 'CLEAR TARGET']);
    else if (selected && selected.waypointable !== false) actions.push([inputPromptLabel('interact'), 'SET TARGET']);
    actions.push([inputPromptLabel('back'), 'CLOSE BAG']);
    return actions;
  }
  const actions = [[inputPromptLabel('move'), 'SELECT ROOM']];
  if (floorCount > 1) actions.push(['[ / ]', 'CHANGE FLOOR']);
  actions.push(['C', 'CENTER ON YOU']);
  if (selected?.objective?.notes?.length || selected?.attached) actions.push([inputPromptLabel('confirm'), 'OPEN FILE']);
  if (selected?.waypoint || selected?.marked) actions.push([inputPromptLabel('mark'), 'CLEAR TARGET']);
  else if (selected && selected.waypointable !== false) actions.push([inputPromptLabel('mark'), 'SET TARGET']);
  actions.push([inputPromptLabel('bag'), 'CLOSE BAG']);
  return actions;
}
