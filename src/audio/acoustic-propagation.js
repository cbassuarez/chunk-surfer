// Pure, deterministic approximation of how a semantic sound reaches the HUSH.
// The runtime may supply room/floor data and an authored occlusion callback;
// user output volume is intentionally not part of this calculation.

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp01 = (value) => Math.max(0, Math.min(1, finite(value, 0)));

export function distanceLossDb(distance, { referenceDistance = 2, maxLossDb = 54 } = {}) {
  const d = Math.max(0, finite(distance, 0));
  return Math.min(maxLossDb, 20 * Math.log10(1 + d / Math.max(.001, referenceDistance)));
}

export function propagateSpectrum(spectrum, { occlusion = 0, crossRoom = false } = {}) {
  const block = clamp01(occlusion);
  return {
    low: clamp01((spectrum?.low ?? .33) * (1 - block * .18)),
    mid: clamp01((spectrum?.mid ?? .66) * (1 - block * .46) * (crossRoom ? .92 : 1)),
    high: clamp01((spectrum?.high ?? .33) * (1 - block * .78) * (crossRoom ? .78 : 1)),
  };
}

export function propagateNoise({ event, listener, occlusionDb = 0, roomLossDb = 0, floorLossDb = 0, maskingDb = 0 } = {}) {
  if (!event?.semantics?.audibleToHush) return { heard: false, reason: 'NOT_AUDIBLE_TO_HUSH', effectiveLevelDb: -Infinity };
  if (!listener?.position) return { heard: false, reason: 'NO_LISTENER', effectiveLevelDb: -Infinity };

  const source = event.spatial.position;
  const distance = Math.hypot(source.x - listener.position.x, source.y - listener.position.y);
  const sameRoom = !!event.spatial.roomId && event.spatial.roomId === listener.roomId;
  const sameFloor = !event.spatial.floorId || !listener.floorId || event.spatial.floorId === listener.floorId;
  const geometricLossDb = distanceLossDb(distance, { referenceDistance: sameRoom ? 4 : 2.5 });
  const crossRoomLossDb = sameRoom ? 0 : 7;
  const verticalLossDb = sameFloor ? 0 : Math.max(10, finite(floorLossDb, 14));
  const totalLossDb = geometricLossDb + crossRoomLossDb + verticalLossDb
    + Math.max(0, finite(occlusionDb, 0)) + Math.max(0, finite(roomLossDb, 0)) + Math.max(0, finite(maskingDb, 0));
  const effectiveLevelDb = event.acoustic.levelDb - totalLossDb;
  const uncertainty = clamp01((sameRoom ? .05 : .22) + Math.max(0, occlusionDb) / 42 + (sameFloor ? 0 : .24));
  const dx = source.x - listener.position.x;
  const dy = source.y - listener.position.y;
  const length = Math.hypot(dx, dy) || 1;

  return {
    heard: true,
    reason: 'PROPAGATED',
    eventId: event.id,
    distance,
    effectiveLevelDb,
    totalLossDb,
    components: { geometricLossDb, crossRoomLossDb, verticalLossDb, occlusionDb, roomLossDb, maskingDb },
    sameRoom,
    sameFloor,
    uncertainty,
    bearing: { x: dx / length, y: dy / length },
    spectralEvidence: propagateSpectrum(event.acoustic.spectrum, { occlusion: Math.max(0, occlusionDb) / 24, crossRoom: !sameRoom }),
  };
}

export function isAudibleToHush(propagation, policy) {
  return !!propagation?.heard && propagation.effectiveLevelDb >= finite(policy?.hearingThresholdDb, -36);
}
