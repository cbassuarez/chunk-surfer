import { STANDING_TEAR_MEMORIES, STANDING_TEAR_PRESSURE } from './standing-tear-pressure.js';

const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

/** Metres in the detached Source world. Rendered masonry uses these bounds too. */
export const STANDING_TEAR_LAYOUT = freeze({
  bounds: { minX: -80, maxX: 80, minZ: -30, maxZ: 210 },
  eyeHeight: 1.62,
  bodyRadius: .25,
  walkingSpeed: 2.2,
  rendererRange: 320,
  barSeconds: 1.04,
  entryFoldSeconds: 2.4,
  spawn: { x: 0, z: .5, feet: 0, yaw: Math.PI, pitch: 0 },
  entry: { x: 0, z: 0, width: 1.4, height: 2.5 },
  memories: STANDING_TEAR_MEMORIES,
  pressure: STANDING_TEAR_PRESSURE,
  // The practice arrival hall runs east/west. Centre the tear between its
  // north/south walls so both edges retain a supported bodily bypass.
  site: { x: 68, z: 45, feet: 4.8, width: 1.4, height: 2.5, normalX: 1, normalZ: 0, yaw: -Math.PI / 2 },
  // Version-one checkpoint metadata. These are no longer active destinations.
  stations: {
    correction: { id: 'correction', x: -4, z: 18, y: .85, width: 2.1, depth: .9, reach: 1.35 },
    reference: { id: 'reference', x: 7, z: 43, y: .95, width: 1.3, depth: .9, reach: 1.35 },
  },
  label: { text: 'CHUNK SURFER', source: 'student-monitoring-notes', isBirthName: false },
  cinematic: { fadeOutAt: .35, blackAt: .9, revealAt: 1.15, revealSeconds: .8, agencyAt: 2.3 },
});
