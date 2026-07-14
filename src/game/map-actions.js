// Contextual MAP actions. Gameplay authorities remain outside this module.

export function resolveMapAction(selected, actionId, api = {}) {
  if (!selected || !actionId) return false;

  switch (actionId) {
    case 'mark':
    case 'unmark':
    case 'mark-waypoint':
    case 'clear-waypoint':
      return selected.roomId && typeof api.markRoom === 'function'
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
  const actions = [['ARROWS/WASD', 'SELECT ROOM']];
  if (floorCount > 1) actions.push(['[ / ]', 'CHANGE FLOOR']);
  actions.push(['C', 'CENTER ON YOU']);
  if (selected?.objective?.notes?.length || selected?.attached) actions.push(['ENTER', 'OPEN FILE']);
  if (selected?.waypoint || selected?.marked) actions.push(['SPACE', 'CLEAR TARGET']);
  else if (selected && selected.waypointable !== false) actions.push(['SPACE', 'SET TARGET']);
  actions.push(['B', 'CLOSE']);
  return actions;
}
