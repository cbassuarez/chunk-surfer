// Contextual MAP actions. Gameplay authorities remain outside this module.

import { activeInputPromptDevice, inputPromptLabel } from './bindings.js';
import { roomHistory } from '../data/room-history.js';

export function resolveMapAction(selected, actionId, api = {}) {
  if (!selected || !actionId) return false;

  switch (actionId) {
    case 'mark':
    case 'mark-waypoint':
    case 'set-target': {
      if (selected.waypointable === false) return false;
      if (typeof api.setTarget === 'function') return !!api.setTarget(selected);
      const current = api.playerWaypoint;
      const alreadySet = current ? current.spaceId === selected.id || (!current.spaceId && current.roomId && current.roomId === selected.roomId)
        : api.playerWaypoint === undefined && !!(selected.waypoint || selected.marked);
      if (alreadySet) return true;
      return typeof api.markSpace === 'function'
        ? !!api.markSpace(selected)
        : selected.roomId && typeof api.markRoom === 'function'
          ? !!api.markRoom(selected.roomId)
          : false;
    }
    case 'unmark':
    case 'clear-waypoint':
    case 'clear-target': {
      if (typeof api.clearTarget === 'function') return !!api.clearTarget(selected);
      const current = api.playerWaypoint;
      const isSet = current ? current.spaceId === selected.id || (!current.spaceId && current.roomId && current.roomId === selected.roomId)
        : api.playerWaypoint === undefined && !!(selected.waypoint || selected.marked);
      if (!isSet) return true; // Clearing cannot accidentally create a mark.
      return typeof api.markSpace === 'function' ? !!api.markSpace(selected)
        : selected.roomId && typeof api.markRoom === 'function' ? !!api.markRoom(selected.roomId) : false;
    }

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

// Confirm sets the selected target. Clearing has its own explicit control,
// and the attached file keeps a separate shortcut rather than owning confirm.
export function mapActionRail(selected, { floorCount = 1, width = 96, consoleFocused = false, offline = false, roomFile = false } = {}) {
  const controller=activeInputPromptDevice()==='controller';
  const close=[controller?inputPromptLabel('back'):inputPromptLabel('bag'),controller&&consoleFocused?'ROOMS':'CLOSE'];
  if(offline)return[close];
  if(roomFile)return [[controller?inputPromptLabel('select'):'←/→','PAGE'],
    [controller?inputPromptLabel('mapFile'):'R','PLAN'],
    ...(selected?.objective?.notes?.length?[[controller?inputPromptLabel('confirm'):'ENTER','SHEET']]:[]),close];
  const toggle=[controller?inputPromptLabel('mapConsole'):'F6',consoleFocused?'ROOMS':'CONTROLS'];
  const confirm=[controller?inputPromptLabel('confirm'):'ENTER',consoleFocused?'PRESS':'SET'];
  const move=[controller?inputPromptLabel('select'):inputPromptLabel('move'),consoleFocused?'KEY':'ROOM'];
  const actions=[toggle,confirm,close];
  // Essential actions survive large text. Optional direct shortcuts are added
  // only when the complete label fits; never hide CLOSE behind an ellipsis.
  const extras=consoleFocused?[move]:[move,
    ...(floorCount>1?[[controller?`${inputPromptLabel('mapFloorPrev')}/${inputPromptLabel('mapFloorNext')}`:'PGUP/PGDN','FLOOR']]:[]),
    [controller?inputPromptLabel('mapLocate'):'C','LOCATE'],
    ...(roomHistory(selected)||selected?.objective?.notes?.length||selected?.attached?[[controller?inputPromptLabel('mapFile'):'R','FILE']]:[])];
  for(const extra of extras){
    const proposed=[...actions,extra],text=proposed.map(([key,label])=>`[${key}] ${label}`).join('   ');
    if(text.length<=width)actions.push(extra);
  }
  return actions;
}
