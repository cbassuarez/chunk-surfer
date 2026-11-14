import { MEMORY_FIELD_VISIT } from './memory-field.js';
import { stationFieldVisit } from './station-field-visits.js';

// These are local returns to an already authored place. They never deliver a
// canonical memory visit: the fifth visit still belongs to the onward route.
export const STATION_FIELD_IDS = Object.freeze(['first', 'second', 'third', 'fourth']);
export const STATION_TOWER_CONNECTIONS = Object.freeze(['field-return-a', 'field-return-b']);
export const STATION_FIELD_CONNECTION = 'field-return';

// The rolling journal is descriptive history, never the authority for a gate.
// Each run has at most 32 numbered station doors, four remembered field states
// and two named tower returns, regardless of how often a player retreats.
export function normalizeStationFieldReturns(value = null, entries = []) {
  const source = value && typeof value === 'object' ? value : {};
  const earned = (Array.isArray(entries) ? entries : []).filter((entry) => entry?.meaningful === true
    && entry.landmarkWitnessed === true && entry.failed !== true && entry.returnedAt != null && STATION_FIELD_IDS.includes(entry.fieldId));
  const unique = (values, allowed) => [...new Set(values.filter(allowed))];
  return {
    legacyHome: source.legacyHome === true || ['burning', 'flood', 'inverted', 'two-moons', 'glass-storm']
      .every((world) => (Array.isArray(entries) ? entries : []).some((entry) => entry?.world === world && !entry.home && entry.returnedAt != null)),
    fieldIds: unique([...(Array.isArray(source.fieldIds) ? source.fieldIds : []), ...earned.map((entry) => entry.fieldId)], (id) => STATION_FIELD_IDS.includes(id)),
    connectionIds: unique([...(Array.isArray(source.connectionIds) ? source.connectionIds : []), ...earned.map((entry) => entry.connectionId)], (id) => STATION_TOWER_CONNECTIONS.includes(id)),
    doorIds: unique([...(Array.isArray(source.doorIds) ? source.doorIds : []), ...earned.map((entry) => entry.doorId)],
      (id) => typeof id === 'string' && /^source-(chapel|tower)-door-(?:[0-9]|1[0-5])$/.test(id)),
  };
}

export function stationDoorDestination(route, index) {
  if (!['chapel', 'tower'].includes(route) || !Number.isInteger(index) || index < 0) return null;
  if (route === 'chapel' && index === 4) return Object.freeze({ kind: 'home', variant: 5, label: 'A house in the snow' });
  if (index === 5) return Object.freeze({ kind: 'coastal', variant: 6, label: 'The coast' });
  const fieldId = STATION_FIELD_IDS[index % STATION_FIELD_IDS.length];
  const connectionId = route === 'tower' && index < 2 ? STATION_TOWER_CONNECTIONS[index] : STATION_FIELD_CONNECTION;
  const canonical = MEMORY_FIELD_VISIT[fieldId];
  return Object.freeze({ kind: 'field', fieldId, variant: index % 4,
    day: canonical.day, deformation: stationFieldVisit(fieldId).snapshotDecay,
    connectionId, connectionNumber: STATION_TOWER_CONNECTIONS.indexOf(connectionId) + 1,
    label: connectionId === 'field-return-a' ? 'Return connection I'
      : connectionId === 'field-return-b' ? 'Return connection II' : 'The field',
  });
}

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, number(value)));
const connections = new Set([STATION_FIELD_CONNECTION, ...STATION_TOWER_CONNECTIONS]);

// The nested scene owns its plain checkpoint, never its borrowed Source pose or
// destination. Bound saved JSON while preserving the scene's editable schema.
export function stationFieldCheckpoint(value) {
  const seen = new WeakSet();
  let nodes = 0;
  const copy = (input, depth) => {
    if (++nodes > 8192 || depth > 16) return null;
    if (input == null || typeof input === 'boolean' || typeof input === 'string') return input;
    if (typeof input === 'number') return Number.isFinite(input) ? input : null;
    if (typeof input !== 'object' || seen.has(input)) return null;
    seen.add(input);
    if (Array.isArray(input)) return input.slice(0, 2048).map((entry) => copy(entry, depth + 1));
    return Object.fromEntries(Object.entries(input).slice(0, 256)
      .filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key))
      .map(([key, entry]) => [key, copy(entry, depth + 1)]));
  };
  return value && typeof value === 'object' && !Array.isArray(value) ? copy(value, 0) : null;
}

export function normalizeStationFieldSession(value) {
  if (!value || !value.active || !STATION_FIELD_IDS.includes(value.fieldId)
    || typeof value.entryDoorId !== 'string' || !value.entryDoorId
    || !connections.has(value.connectionId)
    || !Number.isFinite(Number(value.returnPose?.x)) || !Number.isFinite(Number(value.returnPose?.y))) return null;
  return { version: 1, active: true, fieldId: value.fieldId, entryDoorId: value.entryDoorId,
    connectionId: value.connectionId, enteredAt: Math.max(0, number(value.enteredAt)),
    seed: number(value.seed), returnPose: { x: number(value.returnPose.x), y: number(value.returnPose.y),
      facing: number(value.returnPose.facing), yaw: number(value.returnPose.yaw), pitch: clamp(value.returnPose.pitch, -1.4, 1.4) },
    checkpoint: stationFieldCheckpoint(value.checkpoint) };
}

export function stationFieldReceipt(session, value = {}) {
  const field = normalizeStationFieldSession(session), receipt = value.receipt || value;
  if (!field) return null;
  const checkpoint = value.checkpoint || field.checkpoint;
  const visit = stationFieldVisit(field.fieldId, { connectionId: field.connectionId });
  const witnessed = checkpoint?.version === 1 && checkpoint.fieldId === field.fieldId
    && checkpoint.connectionId === field.connectionId && checkpoint.witness?.landmarkId === visit.landmark.id
    && checkpoint.witness.inspected === true;
  const returned = checkpoint?.stage === 'returning'
    && ['crossed-return', 'used-return'].includes(checkpoint.returnReason);
  return { fieldId: field.fieldId, connectionId: field.connectionId,
    failed: value.reason === 'unavailable' || !!value.error,
    meaningful: witnessed && returned && value.meaningful === true && receipt.fieldId === field.fieldId
      && receipt.connectionId === field.connectionId && receipt.landmarkWitnessed === true && receipt.returned === true
      && value.reason !== 'unavailable' && !value.error,
    landmarkWitnessed: witnessed,
    returned: true };
}
