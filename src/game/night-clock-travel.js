// A cheap receipt seam, independent of audio and look/camera animation. Each
// producer reports only accepted, supported player travel in physical metres.
let travelled = 0;
export function recordNightClockTravel(distance) {
  if (typeof distance === 'number' && Number.isFinite(distance) && distance > .00001 && distance <= 5)
    travelled = Math.min(100, travelled + distance);
}
export function consumeNightClockTravel() { const result = travelled; travelled = 0; return result; }
export function clearNightClockTravel() { travelled = 0; }
