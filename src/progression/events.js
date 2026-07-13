import { ENDING_IDS, EVENT_SCHEMA_VERSION } from './schema.js';

export const EVENT_TYPES = Object.freeze({
  RUN_STARTED: 'run.started',
  DOCUMENT_READ: 'document.read',
  PROP_INSPECTED: 'prop.inspected',
  PROP_AUDITIONED: 'prop.auditioned',
  ITEM_OBTAINED: 'item.obtained',
  EQUIPMENT_DROPPED: 'equipment.dropped',
  EQUIPMENT_RECOVERED: 'equipment.recovered',
  TAKE_STARTED: 'take.started',
  TAKE_COMPLETED: 'take.completed',
  TAKE_SPOILED: 'take.spoiled',
  TAKE_ABORTED: 'take.aborted',
  PLAYER_INJURED: 'player.injured',
  HUSH_MET: 'hush.met',
  BATTLE_STARTED: 'battle.started',
  BATTLE_FINISHED: 'battle.finished',
  PLAYBACK_DISCOVERED: 'playback.discovered',
  CONFESSION_COMMITTED: 'confession.committed',
  COFFEE_DRUNK: 'coffee.drunk',
  ENDING_COMMITTED: 'ending.committed',
  RUN_FINISHED: 'run.finished',
});

const known = new Set(Object.values(EVENT_TYPES));
const stringId = (p, key = 'id') => typeof p?.[key] === 'string' && p[key].length > 0;

const validators = Object.freeze({
  [EVENT_TYPES.RUN_STARTED]: (p) => typeof p?.preset === 'string',
  [EVENT_TYPES.DOCUMENT_READ]: (p) => stringId(p),
  [EVENT_TYPES.PROP_INSPECTED]: (p) => stringId(p),
  [EVENT_TYPES.PROP_AUDITIONED]: (p) => stringId(p),
  [EVENT_TYPES.ITEM_OBTAINED]: (p) => stringId(p),
  [EVENT_TYPES.EQUIPMENT_DROPPED]: (p) => stringId(p),
  [EVENT_TYPES.EQUIPMENT_RECOVERED]: (p) => stringId(p),
  [EVENT_TYPES.TAKE_STARTED]: (p) => typeof p?.roomId === 'string',
  [EVENT_TYPES.TAKE_COMPLETED]: (p) => typeof p?.roomId === 'string' && Number.isFinite(Number(p?.elapsed)),
  [EVENT_TYPES.TAKE_SPOILED]: (p) => typeof p?.roomId === 'string',
  [EVENT_TYPES.TAKE_ABORTED]: (p) => typeof p?.roomId === 'string',
  [EVENT_TYPES.PLAYER_INJURED]: (p) => Number.isFinite(Number(p?.count)),
  [EVENT_TYPES.HUSH_MET]: () => true,
  [EVENT_TYPES.BATTLE_STARTED]: (p) => stringId(p),
  [EVENT_TYPES.BATTLE_FINISHED]: (p) => stringId(p) && ['win', 'lose', 'abort'].includes(p?.result) && Number.isFinite(Number(p?.attempts)),
  [EVENT_TYPES.PLAYBACK_DISCOVERED]: (p) => stringId(p),
  [EVENT_TYPES.CONFESSION_COMMITTED]: (p) => typeof p?.kind === 'string',
  [EVENT_TYPES.COFFEE_DRUNK]: () => true,
  [EVENT_TYPES.ENDING_COMMITTED]: (p) => ENDING_IDS.includes(p?.endingId),
  [EVENT_TYPES.RUN_FINISHED]: (p) => !!p?.summary && typeof p.summary === 'object',
});

export function validateEvent(event) {
  if (!event || event.schema !== EVENT_SCHEMA_VERSION) return false;
  if (!known.has(event.type)) return false;
  if (typeof event.id !== 'string' || typeof event.runId !== 'string') return false;
  if (!Number.isFinite(Number(event.seq)) || !Number.isFinite(Number(event.at))) return false;
  const validator = validators[event.type];
  return validator ? !!validator(event.payload || {}) : true;
}

export function createEventBus({ onError = console.error } = {}) {
  const listeners = new Map();
  return {
    on(type, fn) {
      const set = listeners.get(type) || new Set();
      set.add(fn);
      listeners.set(type, set);
      return () => set.delete(fn);
    },
    emit(event) {
      const targets = [
        ...(listeners.get(event.type) || []),
        ...(listeners.get('*') || []),
      ];
      for (const fn of targets) {
        try { fn(event); }
        catch (error) { onError?.('[progression event]', event.type, error); }
      }
    },
    clear() { listeners.clear(); },
  };
}
