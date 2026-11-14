import { WORK_ORDER_ROOMS } from '../data/work-order-sheet.js';
import { B3_SPEAKER_FLAGS } from './b3-speaker-disturbance.js';

const VERSION = 1;
const ROOMS = new Set(WORK_ORDER_ROOMS.map(({ roomId }) => roomId));
const LEVELS = 'setup:levels';
const INVESTIGATION = 'b3:investigate';
const validText = value => typeof value === 'string' && value.length > 0 && value.length <= 512;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const validMilestone = id => id === LEVELS || id === INVESTIGATION || (
  typeof id === 'string' && id.startsWith('take:') && ROOMS.has(id.slice(5))
);

function acceptedWorkOrderTakes(save) {
  const tapes = save?.rec?.tapes;
  if (!Array.isArray(tapes)) {
    const legacy = save?.rec?.takes ?? save?.takes;
    return Array.isArray(legacy) ? legacy.filter(roomId => ROOMS.has(roomId)).map(roomId => ({ roomId })) : [];
  }
  return tapes.filter(tape => tape && ROOMS.has(tape.roomId) && !tape.voided && !tape.lost && !tape.damage
    && tape.counted !== false && (!tape.status || tape.status === 'accepted'));
}

// Only used to seed a retry for a run saved before milestone checkpoints existed.
// Normal play offers a checkpoint at the event that earns it.
export function elleryCaughtMilestone(save) {
  const order = row => Number(row.ordinal ?? row.at ?? 0) || 0;
  const takes = acceptedWorkOrderTakes(save);
  const latest = takes.reduce((best, take) => {
    return !best || order(take) >= order(best) ? take : best;
  }, null);
  if (latest) return `take:${latest.roomId}`;
  if (save?.flags?.[B3_SPEAKER_FLAGS.silenced] === true) return INVESTIGATION;
  return save?.flags?.['setup.levels'] === true ? LEVELS : null;
}

function milestoneEvidence(save, id) {
  if (id === LEVELS) return save.flags?.['setup.levels'] === true ? LEVELS : null;
  if (id === INVESTIGATION) return save.flags?.[B3_SPEAKER_FLAGS.silenced] === true ? INVESTIGATION : null;
  if (!validMilestone(id)) return null;
  const take = acceptedWorkOrderTakes(save).findLast(row => row.roomId === id.slice(5));
  return take ? (validText(take.id) ? take.id : id) : null;
}

function normalizePose(value) {
  const { x, y, facing, yaw, pitch } = value || {};
  return [x, y, facing, yaw, pitch].every(Number.isFinite) ? { x, y, facing, yaw, pitch } : null;
}

export function normalizeElleryCaughtCheckpoint(value, { runId } = {}) {
  if (value?.version !== VERSION || !validText(runId) || value.runId !== runId
    || !positive(value.revision) || !validMilestone(value.milestoneId) || !validText(value.evidence)) return null;
  const pose = normalizePose(value.pose);
  const snapshot = value.snapshot;
  if (!pose || !record(snapshot) || snapshot.area !== 'conservatory'
    || snapshot.run?.id !== runId || snapshot.run.status !== 'active'
    || Object.hasOwn(snapshot, 'elleryCaughtCheckpoint') || Object.hasOwn(snapshot, 'elleryCaughtReceipt')
    || Object.hasOwn(snapshot, 'settings') || Object.hasOwn(snapshot, 'profile') || Object.hasOwn(snapshot, 'meta')
    || snapshot.px !== pose.x || snapshot.py !== pose.y || snapshot.facing !== pose.facing
    || snapshot.view?.yaw !== pose.yaw || snapshot.view?.pitch !== pose.pitch
    || milestoneEvidence(snapshot, value.milestoneId) !== value.evidence) return null;
  return { version: VERSION, runId, revision: value.revision, milestoneId: value.milestoneId,
    evidence: value.evidence, pose, snapshot };
}

export function createElleryCaughtCheckpoint(save, { milestoneId, pose: requestedPose } = {}) {
  const runId = save?.run?.id;
  const pose = normalizePose(requestedPose);
  if (!pose || !validText(runId) || save.run.status !== 'active' || save.area !== 'conservatory') return null;
  const evidence = milestoneEvidence(save, milestoneId);
  if (!evidence) return null;
  const previous = normalizeElleryCaughtCheckpoint(save.elleryCaughtCheckpoint, { runId });
  if (previous?.milestoneId === milestoneId && previous.evidence === evidence) return null;
  const { elleryCaughtCheckpoint, elleryCaughtReceipt, settings, profile, meta, ...runState } = save;
  return {
    version: VERSION, runId, revision: (previous?.revision || 0) + 1, milestoneId, evidence, pose,
    snapshot: structuredClone({ ...runState, px: pose.x, py: pose.y, facing: pose.facing,
      view: { yaw: pose.yaw, pitch: pose.pitch } }),
  };
}

export function normalizeElleryCaughtReceipt(value, { runId } = {}) {
  if (value?.version !== VERSION || !validText(runId) || value.runId !== runId
    || !validText(value.eventId) || !positive(value.sequence) || !positive(value.checkpointRevision)) return null;
  return { version: VERSION, runId, eventId: value.eventId, sequence: value.sequence,
    checkpointRevision: value.checkpointRevision };
}

export function elleryCaughtRestore(save, { eventId, expectedCheckpointRevision } = {}) {
  const runId = save?.run?.id;
  if (!validText(eventId) || save?.run?.status !== 'active') return null;
  const checkpoint = normalizeElleryCaughtCheckpoint(save.elleryCaughtCheckpoint, { runId });
  const previous = normalizeElleryCaughtReceipt(save.elleryCaughtReceipt, { runId });
  if (!checkpoint || eventId === previous?.eventId
    || (expectedCheckpointRevision !== undefined && checkpoint.revision !== expectedCheckpointRevision)) return null;
  const receipt = { version: VERSION, runId, eventId, sequence: (previous?.sequence || 0) + 1,
    checkpointRevision: checkpoint.revision };
  const restored = structuredClone(checkpoint.snapshot);
  // Shift tuning and certification are the live rules under which a player
  // is attempting the run. Rewinding the world cannot undo a setting change
  // or make an already disqualified challenge eligible again.
  restored.run.rules = structuredClone(save.run.rules ?? restored.run.rules);
  restored.run.integrity = structuredClone(save.run.integrity ?? restored.run.integrity);
  // Front-end pose leases compare these revisions for the same run. A rewind
  // changes the pose, so its revisions advance even though the night rewinds.
  restored.cameraRevision = (Number(save.cameraRevision) || 0) + 1;
  restored.checkpointRevision = (Number(save.checkpointRevision) || 0) + 1;
  return { ...restored, settings: save.settings, elleryCaughtCheckpoint: checkpoint, elleryCaughtReceipt: receipt };
}

// The synchronous mirror can be one committed rewind ahead when the native
// process stops before its save queue drains. Prefer it only for the same run
// and an acknowledged transaction newer than the durable autosave's receipt.
export function preferElleryCaughtRecoveryMirror(durable, mirror) {
  const runId = durable?.run?.id;
  if (durable?.run?.status !== 'active' || mirror?.run?.status !== 'active' || mirror.run.id !== runId) return durable;
  const recovery = normalizeElleryCaughtReceipt(mirror.elleryCaughtReceipt, { runId });
  const checkpoint = normalizeElleryCaughtCheckpoint(mirror.elleryCaughtCheckpoint, { runId });
  const previous = normalizeElleryCaughtReceipt(durable.elleryCaughtReceipt, { runId });
  return recovery && checkpoint && recovery.checkpointRevision <= checkpoint.revision
    && recovery.sequence > (previous?.sequence || 0) ? mirror : durable;
}
