// Semantic world-noise bus. Gameplay emits facts here even when the matching
// sound file is muted, missing, or inaudible to the player.

import { catalogueEntry, gameNoiseToDb } from './acoustic-catalogue.js';

const listeners = new Set();
let sequence = 0;
let clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp01 = (value) => Math.max(0, Math.min(1, finite(value, 0)));

export function setAcousticClock(provider) {
  clock = typeof provider === 'function' ? provider : clock;
}

export function normalizeAcousticEvent(input = {}) {
  const def = catalogueEntry(input.kind) || {};
  const acoustic = { ...def, ...(input.acoustic || {}) };
  const source = input.source && typeof input.source === 'object' ? input.source : { kind: 'environment', id: 'unknown' };
  const spatial = input.spatial && typeof input.spatial === 'object' ? input.spatial : {};
  const semantics = input.semantics && typeof input.semantics === 'object' ? input.semantics : {};
  const emittedAt = finite(input.emittedAt, clock());

  return Object.freeze({
    schema: 1,
    id: input.id || `noise:${String(++sequence).padStart(7, '0')}`,
    emittedAt,
    kind: String(input.kind || 'handling_noise'),
    source: Object.freeze({ kind: String(source.kind || 'environment'), id: String(source.id || 'unknown') }),
    spatial: Object.freeze({
      areaId: spatial.areaId == null ? null : String(spatial.areaId),
      roomId: spatial.roomId == null ? null : String(spatial.roomId),
      floorId: spatial.floorId == null ? null : String(spatial.floorId),
      position: Object.freeze({ x: finite(spatial.position?.x, finite(spatial.x, 0)), y: finite(spatial.position?.y, finite(spatial.y, 0)) }),
    }),
    acoustic: Object.freeze({
      levelDb: finite(acoustic.levelDb, gameNoiseToDb(input.level, -36)),
      durationMs: Math.max(1, finite(acoustic.durationMs, 300)),
      spectrum: Object.freeze({
        low: clamp01(acoustic.spectrum?.low ?? .33),
        mid: clamp01(acoustic.spectrum?.mid ?? .66),
        high: clamp01(acoustic.spectrum?.high ?? .33),
      }),
      impulsiveness: clamp01(acoustic.impulsiveness ?? .5),
      repetition: Math.max(0, finite(acoustic.repetition, 0)),
      directivity: acoustic.directivity || 'omni',
    }),
    semantics: Object.freeze({
      playerGenerated: semantics.playerGenerated ?? source.kind === 'player',
      deliberate: !!semantics.deliberate,
      audibleToHush: semantics.audibleToHush !== false,
      audibleToMonitor: semantics.audibleToMonitor !== false,
      audibleInWorld: semantics.audibleInWorld !== false,
      canBeMimicked: semantics.canBeMimicked ?? !!def.canBeMimicked,
      canSpoilTake: !!semantics.canSpoilTake,
      family: semantics.family || def.family || 'handling',
      tags: Object.freeze(Array.isArray(semantics.tags) ? semantics.tags.filter((v) => typeof v === 'string') : []),
    }),
    provenance: Object.freeze({ ...(input.provenance || {}) }),
  });
}

export function validateAcousticEvent(event) {
  const errors = [];
  if (event?.schema !== 1) errors.push('schema');
  if (!event?.id || typeof event.id !== 'string') errors.push('id');
  if (!event?.kind || typeof event.kind !== 'string') errors.push('kind');
  if (!Number.isFinite(event?.acoustic?.levelDb)) errors.push('levelDb');
  if (!Number.isFinite(event?.spatial?.position?.x) || !Number.isFinite(event?.spatial?.position?.y)) errors.push('position');
  if (typeof event?.semantics?.audibleToHush !== 'boolean') errors.push('audibleToHush');
  return { ok: errors.length === 0, errors };
}

export function emitAcousticEvent(input) {
  const event = normalizeAcousticEvent(input);
  const valid = validateAcousticEvent(event);
  if (!valid.ok) {
    console.warn('[acoustics] invalid event', valid.errors, input);
    return null;
  }
  for (const listener of [...listeners]) {
    try { listener(event); } catch (error) { console.error('[acoustics] listener failed', error); }
  }
  return event;
}

export function onAcousticEvent(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetAcousticEventsForTest() {
  listeners.clear();
  sequence = 0;
}
