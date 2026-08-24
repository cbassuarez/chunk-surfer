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

// CONFIRM IS THE MAP'S OWN VERB. A plan is for saying where you are going, so
// the key every other surface uses to commit sets and clears the target here.
// The file pinned to a room is secondary and keeps its own key; it used to own
// confirm, which put the map's only real action on an unadvertised binding.
export function mapActionRail(selected, { floorCount = 1 } = {}) {
  const targetAction = selected?.waypoint || selected?.marked
    ? 'CLEAR TARGET'
    : selected && selected.waypointable !== false ? 'SET TARGET' : null;
  if (activeInputPromptDevice() === 'controller') {
    const actions = [[inputPromptLabel('select'), 'SELECT ROOM']];
    if (targetAction) actions.push([inputPromptLabel('confirm'), targetAction]);
    if (selected?.objective?.notes?.length || selected?.attached) actions.push([inputPromptLabel('interact'), 'OPEN FILE']);
    actions.push([inputPromptLabel('back'), 'CLOSE BAG']);
    return actions;
  }
  const actions = [[inputPromptLabel('move'), 'SELECT ROOM']];
  if (floorCount > 1) actions.push(['[ / ]', 'CHANGE FLOOR']);
  actions.push(['C', 'CENTER ON YOU']);
  if (targetAction) actions.push([inputPromptLabel('confirm'), targetAction]);
  if (selected?.objective?.notes?.length || selected?.attached) actions.push(['R', 'OPEN FILE']);
  actions.push([inputPromptLabel('bag'), 'CLOSE BAG']);
  return actions;
}
