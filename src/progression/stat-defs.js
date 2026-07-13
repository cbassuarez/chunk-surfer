// Canonical monotonic stats shared by local profiles and future native
// platforms. Gameplay code uses local keys; platform adapters receive stable
// platform IDs so the Steam partner configuration can be created once.

export const STAT_DEFS = Object.freeze({
  runsStarted: Object.freeze({ platformId: 'STAT_RUNS_STARTED' }),
  runsCompleted: Object.freeze({ platformId: 'STAT_RUNS_COMPLETED' }),
  takesCompleted: Object.freeze({ platformId: 'STAT_TAKES_COMPLETED' }),
  takesSpoiled: Object.freeze({ platformId: 'STAT_TAKES_SPOILED' }),
  battlesWon: Object.freeze({ platformId: 'STAT_BATTLES_WON' }),
  endingsSeen: Object.freeze({ platformId: 'STAT_ENDINGS_SEEN' }),
  disclosuresFound: Object.freeze({ platformId: 'STAT_DISCLOSURES_FOUND' }),
  objectsInspected: Object.freeze({ platformId: 'STAT_OBJECTS_INSPECTED' }),
});

export const LOCAL_STAT_BY_PLATFORM_ID = Object.freeze(
  Object.fromEntries(
    Object.entries(STAT_DEFS).map(([localKey, def]) => [def.platformId, localKey]),
  ),
);

export function platformStatId(localKey) {
  return STAT_DEFS[localKey]?.platformId || null;
}

export function localStatKey(platformId) {
  return LOCAL_STAT_BY_PLATFORM_ID[platformId] || null;
}

export function queueChangedStats(previous = {}, next = {}, pending = {}) {
  const out = { ...pending };
  for (const [localKey, def] of Object.entries(STAT_DEFS)) {
    const before = Math.max(0, Number(previous?.[localKey]) || 0);
    const after = Math.max(0, Number(next?.[localKey]) || 0);
    if (after > before) out[def.platformId] = Math.max(Number(out[def.platformId]) || 0, after);
  }
  return out;
}
