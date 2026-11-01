import { CELL } from '../data/floorplan/legend.js';
import { normalizeHushDensityPose } from '../game/hush-density-performance.js';

// The copied rooms simulate in metres. The ordinary pressure renderer accepts
// half-metre cell centres; keep that conversion at this single boundary.
export function fakeElleryHushActor(value, { reducedMotion = false } = {}) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  const contact = value.phase === 'contact';
  return { id: String(value.eventId || 'fake-ellery-hush').slice(0,96),
    x: value.x / CELL - .5, y: value.z / CELL - .5,
    floorH: Number.isFinite(value.feet) ? value.feet : 0,
    heightM: 2.18, widthM: .68, strength: 1, glow: 1.05,
    performance: { version: 1, role: 'source-rear',
      heading: Number.isFinite(value.yaw) ? value.yaw : 0,
      clip: contact ? 'pressure_arrest' : 'pressure_advance',
      time: Math.max(0, Number(value.elapsed) || 0), loop: !contact,
      seed: 37, manifestation: 1, motion: contact ? 'idle' : 'hunt',
      density:normalizeHushDensityPose(value.density),
      cue: null, reducedMotion: !!reducedMotion } };
}
