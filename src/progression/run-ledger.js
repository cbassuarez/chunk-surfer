import { freshLedger, normalizeLedger } from './schema.js';
import { EVENT_TYPES } from './events.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const addUnique = (array, value) => {
  if (typeof value === 'string' && value && !array.includes(value)) array.push(value);
};

export function reduceRunLedger(ledger = freshLedger(), event) {
  const next = clone(normalizeLedger(ledger));
  next.seq = Math.max(next.seq, Number(event?.seq) || next.seq);
  const p = event?.payload || {};

  switch (event?.type) {
    case EVENT_TYPES.TAKE_COMPLETED:
      next.takes.completed += 1;
      addUnique(next.takes.rooms, p.roomId);
      break;
    case EVENT_TYPES.TAKE_SPOILED:
      next.takes.spoiled += 1;
      break;
    case EVENT_TYPES.TAKE_ABORTED:
      next.takes.aborted += 1;
      break;
    case EVENT_TYPES.PLAYER_INJURED:
      next.injuries = Math.max(next.injuries + 1, Number(p.count) || 0);
      break;
    case EVENT_TYPES.BATTLE_STARTED:
      next.battles.started += 1;
      next.battles.results[p.id] = {
        ...(next.battles.results[p.id] || {}),
        started: (next.battles.results[p.id]?.started || 0) + 1,
      };
      break;
    case EVENT_TYPES.BATTLE_FINISHED: {
      if (p.result === 'win') next.battles.won += 1;
      if (p.result === 'lose') next.battles.lost += 1;
      if (p.result === 'win' && p.firstPass === true) next.battles.firstPassWon += 1;
      next.battles.results[p.id] = {
        ...(next.battles.results[p.id] || {}),
        result: p.result,
        attempts: Math.max(1, Number(p.attempts) || 1),
      };
      break;
    }
    case EVENT_TYPES.PLAYBACK_DISCOVERED:
      addUnique(next.disclosures, p.id);
      break;
    case EVENT_TYPES.DOCUMENT_READ:
      addUnique(next.documentsRead, p.id);
      break;
    case EVENT_TYPES.PROP_INSPECTED:
      addUnique(next.propsInspected, p.id);
      break;
    case EVENT_TYPES.PROP_AUDITIONED:
      addUnique(next.propsAuditioned, p.id);
      break;
    case EVENT_TYPES.ITEM_OBTAINED:
      addUnique(next.itemsObtained, p.id);
      break;
    case EVENT_TYPES.EQUIPMENT_DROPPED:
      addUnique(next.equipment.dropped, p.id);
      break;
    case EVENT_TYPES.EQUIPMENT_RECOVERED:
      addUnique(next.equipment.recovered, p.id);
      break;
    case EVENT_TYPES.COFFEE_DRUNK:
      next.choices.drankCoffee = true;
      break;
    case EVENT_TYPES.CONFESSION_COMMITTED:
      next.choices.namedSarah = p.kind === 'name' && p.value === 'Sarah';
      break;
    default:
      break;
  }
  return next;
}
