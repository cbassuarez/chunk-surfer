import { SOURCE_EARTHFALL } from '../data/source-earthfall.js';
import {
  freshSourceEarthfall, normalizeSourceEarthfall, stepSourceEarthfall,
  sourceEarthfallFrame, sourceEarthfallFocus,
} from './source-earthfall.js';

// This ending borrows the physical omen, never its ordinary Source II journey.
// Its checkpoint and every outward receipt belong to the ending's run.
export const ENDING_WRONG_DOOR_SEQUENCE_ID = 'ending-wrong-door';
const VERSION = 1;
const copy = value => JSON.parse(JSON.stringify(value));
const runKey = value => typeof value === 'string' || typeof value === 'number' && Number.isFinite(value)
  ? String(value) : '';
const innerRunId = runId => `${ENDING_WRONG_DOOR_SEQUENCE_ID}:${runId}:physical`;
const receiptId = (runId, type) => `${ENDING_WRONG_DOOR_SEQUENCE_ID}:${runId}:${type}`;
const finiteTree = value => typeof value === 'number' ? Number.isFinite(value)
  : value && typeof value === 'object' ? Object.values(value).every(finiteTree) : true;
function validPose(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !Number.isFinite(value.x) || !Number.isFinite(value.y) && !Number.isFinite(value.z)) return null;
  try {
    if (['x', 'y', 'z', 'feet', 'yaw', 'pitch', 'facing'].some(key =>
      value[key] != null && !Number.isFinite(value[key]))) return null;
    if (!finiteTree(value)) return null;
    return copy(value);
  } catch { return null; }
}
const publicPhysical = (value, runId) => ({
  ...value,
  returnPose: validPose(value.returnPose),
  receipts: value.receipts.map(item => ({ ...item, id: receiptId(runId, item.type) })),
  exitReceipt: value.status === 'completed'
    ? { id: receiptId(runId, 'source-IV'), delivered: !!value.exitReceipt?.delivered } : null,
});
function wrapPhysical(value, runId, delivered = false) {
  const physical = publicPhysical(value, runId);
  if (physical.exitReceipt) physical.exitReceipt.delivered ||= delivered;
  const status = physical.status === 'completed' ? 'ready-for-source-IV'
    : physical.status === 'returned' ? 'returned' : 'active';
  const receipts = physical.receipts.map(copy);
  if (physical.exitReceipt) receipts.push({
    id: physical.exitReceipt.id, type: 'enter-source-IV', at: physical.clock,
  });
  return {
    version: VERSION, sequenceId: ENDING_WRONG_DOOR_SEQUENCE_ID, runId, status,
    returnPose: validPose(physical.returnPose), physical, receipts,
    exitReceipt: physical.exitReceipt ? { ...physical.exitReceipt } : null,
  };
}

export function freshEndingWrongDoorDemolition({ runId = '', returnPose = null } = {}) {
  const id = runKey(runId);
  return wrapPhysical(freshSourceEarthfall({ runId: innerRunId(id), returnPose: validPose(returnPose) }), id);
}

export function normalizeEndingWrongDoorDemolition(value, { runId, returnPose } = {}) {
  const id = runKey(runId ?? value?.runId);
  const fresh = () => freshEndingWrongDoorDemolition({ runId: id, returnPose });
  if (!value || value.version !== VERSION || value.sequenceId !== ENDING_WRONG_DOOR_SEQUENCE_ID
    || runKey(value.runId) !== id || value.physical?.runId !== innerRunId(id)
    || value.physical?.version !== SOURCE_EARTHFALL.version
    || value.physical?.sequenceId !== SOURCE_EARTHFALL.sequenceId) return fresh();
  const pose = validPose(returnPose) || validPose(value.returnPose) || validPose(value.physical.returnPose);
  const physical = normalizeSourceEarthfall({ ...value.physical, returnPose: pose },
    { runId: innerRunId(id), returnPose: pose });
  const delivered = value.exitReceipt?.id === receiptId(id, 'source-IV') && !!value.exitReceipt.delivered;
  // Only the validated outer ending receipt can acknowledge this handoff.
  if(physical.exitReceipt)physical.exitReceipt.delivered=false;
  return wrapPhysical(physical, id, delivered);
}

function outwardEvent(event, runId) {
  if (event.type === 'enter-source-II') return {
    type: 'enter-source-IV', id: receiptId(runId, 'source-IV'), receipt: receiptId(runId, 'source-IV'),
  };
  if (event.type === 'return') return {
    ...event, id: receiptId(runId, 'return'), returnPose: validPose(event.returnPose),
  };
  const kind = event.type === 'door' ? `door:${event.id?.endsWith('entry') ? 'entry' : 'exit'}` : event.type;
  return { ...event, id: receiptId(runId, kind) };
}

export function stepEndingWrongDoorDemolition(value, input = {}) {
  const before = normalizeEndingWrongDoorDemolition(value);
  if (before.status !== 'active') return { state: before, events: [], event: null, saveDue: false };
  const result = stepSourceEarthfall(before.physical, input);
  const state = wrapPhysical(result.state, before.runId);
  const events = result.events.map(event => outwardEvent(event, before.runId));
  return {
    state, events,
    event: events.find(event => event.type === 'return' || event.type === 'enter-source-IV') || events.at(-1) || null,
    saveDue: result.saveDue,
  };
}

function outwardFocus(focus, runId) {
  return focus ? { ...focus, id: receiptId(runId, `door:${focus.kind}`) } : null;
}
export function endingWrongDoorDemolitionFocus(value) {
  const state = normalizeEndingWrongDoorDemolition(value);
  return outwardFocus(sourceEarthfallFocus(state.physical), state.runId);
}
export function endingWrongDoorDemolitionFrame(value) {
  const state = normalizeEndingWrongDoorDemolition(value);
  const frame = sourceEarthfallFrame(state.physical);
  return {
    ...frame, sequenceId: state.sequenceId, runId: state.runId, status: state.status,
    focus: outwardFocus(frame.focus, state.runId),
    entryDoor: { ...frame.entryDoor, id: receiptId(state.runId, 'door:entry') },
    exitDoor: { ...frame.exitDoor, id: receiptId(state.runId, 'door:exit') },
    exitReceipt: state.exitReceipt,
    events: frame.events.map(event => ({ ...event, id: receiptId(state.runId, event.type) })),
  };
}
