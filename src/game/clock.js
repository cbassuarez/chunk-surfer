// Take-file timestamps and their established erosion. The live night is owned
// by night-clock.js. New files keep its capture instant; legacy files retain
// their authored take-order stamps, which were never measured wall-clock time.
// Never backfill a precise capture time into an old tape.

export const START_MIN = 21 * 60 + 38;      // 21:38, the service door
export const PER_TAKE_MIN = 72;             // a room, and the walk to the next
export const DEAD = '--:--';                // after the confrontation

const pad = (n) => String(n).padStart(2, '0');

export function clockString(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// The original authored night position, retained only for unstamped old takes.
export function timeOfTake(index) {
  return clockString(START_MIN + (index + 1) * PER_TAKE_MIN + (index * 7) % 13);
}

// Erode `n` characters from the right, skipping the colon, which is the last
// thing to go because a colon is not a number and the building only takes
// numbers.
export function erode(stamp, n) {
  if (n <= 0) return stamp;
  const chars = [...stamp];
  let left = n;
  for (let i = chars.length - 1; i >= 0 && left > 0; i--) {
    if (chars[i] === ':') continue;
    chars[i] = '?';
    left--;
  }
  return chars.join('');
}

// How much of the fourth take's timestamp survives is not a property of the
// fourth take. It is a property of how many rooms are now inside you.
const EROSION = [1, 2, 3, 4, 4];

export function takeStamp(index, { dead = false, captured = null } = {}) {
  if (dead) return DEAD;
  if (index < 0) return '';
  const measured = captured?.schema === 1 && typeof captured.elapsedSeconds === 'number'
    && Number.isFinite(captured.elapsedSeconds) && captured.elapsedSeconds >= 0;
  const stamp = measured ? clockString(START_MIN + Math.floor(captured.elapsedSeconds / 60)) : timeOfTake(index);
  return `${measured && captured.priorUnmeasured !== false ? '~' : ''}${erode(stamp, EROSION[Math.min(index, EROSION.length - 1)])}`;
}

// The work order is printed. Print does not rot.
export const WORK_ORDER_STAMP = '21:38';
