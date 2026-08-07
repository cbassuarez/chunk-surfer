export const REFERENCE_EXPOSURE_SCHEMA = 1;

export const REFERENCE_THRESHOLDS = Object.freeze([
  Object.freeze({ id: 'TRACE', density: 20 }),
  Object.freeze({ id: 'COHERENT', density: 45 }),
  Object.freeze({ id: 'ORGANIZED', density: 70 }),
  Object.freeze({ id: 'SATURATED', density: 90 }),
]);

const clampDensity = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const uniqueStrings = (value) => [...new Set((Array.isArray(value) ? value : [])
  .filter((entry) => typeof entry === 'string' && entry))];

export function freshReferenceExposure() {
  return {
    schema: REFERENCE_EXPOSURE_SCHEMA,
    roomsHeard: [],
    playbackCounts: {},
    breadth: 0,
    density: 0,
    thresholdsCrossed: [],
    propagatedBattles: [],
  };
}

function crossedThresholds(density) {
  return REFERENCE_THRESHOLDS
    .filter((threshold) => density >= threshold.density)
    .map((threshold) => threshold.id);
}

export function normalizeReferenceExposure(value, { legacyFlags = null } = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const legacyRooms = !value && legacyFlags && typeof legacyFlags === 'object'
    ? Object.keys(legacyFlags)
      .filter((key) => key.startsWith('listened.') && key !== 'listened.count' && key !== 'listened.all' && legacyFlags[key])
      .map((key) => key.slice('listened.'.length))
    : [];
  const roomsHeard = uniqueStrings(source.roomsHeard?.length ? source.roomsHeard : legacyRooms);
  const playbackCounts = {};
  const rawCounts = source.playbackCounts && typeof source.playbackCounts === 'object' && !Array.isArray(source.playbackCounts)
    ? source.playbackCounts
    : {};
  for (const roomId of roomsHeard) {
    playbackCounts[roomId] = Math.max(1, Math.min(999, Math.floor(Number(rawCounts[roomId]) || 1)));
  }
  for (const [roomId, count] of Object.entries(rawCounts)) {
    if (!roomId || playbackCounts[roomId]) continue;
    const normalized = Math.max(0, Math.min(999, Math.floor(Number(count) || 0)));
    if (normalized) playbackCounts[roomId] = normalized;
  }
  const migratedDensity = legacyRooms.length * 15;
  const density = clampDensity(value ? source.density : migratedDensity);
  return {
    schema: REFERENCE_EXPOSURE_SCHEMA,
    roomsHeard,
    playbackCounts,
    breadth: roomsHeard.length,
    density,
    thresholdsCrossed: crossedThresholds(density),
    propagatedBattles: uniqueStrings(source.propagatedBattles),
  };
}

export function applyPlaybackExposure(value, roomId) {
  const current = normalizeReferenceExposure(value);
  if (typeof roomId !== 'string' || !roomId) return current;
  const first = !current.roomsHeard.includes(roomId);
  const density = clampDensity(current.density + (first ? 15 : 5));
  const roomsHeard = first ? [...current.roomsHeard, roomId] : current.roomsHeard;
  return {
    ...current,
    roomsHeard,
    playbackCounts: {
      ...current.playbackCounts,
      [roomId]: (current.playbackCounts[roomId] || 0) + 1,
    },
    breadth: roomsHeard.length,
    density,
    thresholdsCrossed: crossedThresholds(density),
  };
}

export function applyPerformancePropagation(value, battleId) {
  const current = normalizeReferenceExposure(value);
  if (typeof battleId !== 'string' || !battleId || current.propagatedBattles.includes(battleId)) return current;
  const density = clampDensity(current.density + 5);
  return {
    ...current,
    density,
    thresholdsCrossed: crossedThresholds(density),
    propagatedBattles: [...current.propagatedBattles, battleId],
  };
}

export function referenceExposureBand(value) {
  const exposure = normalizeReferenceExposure(value);
  return REFERENCE_THRESHOLDS.reduce(
    (band, threshold) => exposure.density >= threshold.density ? threshold.id : band,
    'DIFFUSE',
  );
}
