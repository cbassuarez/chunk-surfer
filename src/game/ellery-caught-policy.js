import { ZONE } from '../data/floorplan/legend.js';

const elleryInteriors = new Set([
  ZONE.foyer, ZONE.studio, ZONE.natatorium, ZONE.hall, ZONE.practice,
  ZONE.chapel, ZONE.chapelOuter, ZONE.plant, ZONE.stair, ZONE.academic,
  ZONE.danceStudio, ZONE.store, ZONE.getIn, ZONE.glasshouse, ZONE.poolChanging,
]);

export const isElleryCaughtInterior = zone => elleryInteriors.has(zone);

export function elleryCaughtEligible({
  zone, interiorCorridor, ordinaryWorld, foreground, protectedOwner, hushLive, checkpointReady,
  transportHeld, protectedTake, rearmerReady,
}) {
  return (isElleryCaughtInterior(zone) || zone === ZONE.none && interiorCorridor === true) && ordinaryWorld && foreground && hushLive
    && checkpointReady && rearmerReady && !protectedOwner && !transportHeld && !protectedTake;
}

// A restored take starts with a fresh acoustic window. Persistent room input
// must go quiet before it can expose the recordist again.
export function elleryCaughtRearm(state, quiet, dt) {
  const quietMs = quiet ? state.quietMs + Math.max(0, dt) * 1000 : 0;
  return { quietMs, ready: quietMs >= 400 };
}

// Hard-floor sprint impacts sustain HOT. A jog can accumulate on a resonant
// surface, but only with overlapping footfalls.
export function elleryCaughtFootstep(kind, level, muffled = false) {
  if (kind === 'footstep_sprint' && !muffled) return { levelDb: -17, durationMs: 340 };
  if (kind === 'footstep_jog' && level >= .32) return { levelDb: -19, durationMs: 340 };
  return null;
}
