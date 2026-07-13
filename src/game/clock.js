// What time it is, and how much of that you still know.
//
// There is no timer on this screen and there never will be. The recordist owns
// a watch, the recorder writes a timestamp on every file, and both of them are
// correct. What rots is the reading of them.
//
// The previous recordist's log does this in his own hand, and the player has
// already watched it happen: 21:40, 22:15, 23:02, 00:20, 01:35, 02:10, 02:5?,
// ??:??. He was not confused and he was not lying. He simply stopped being able
// to write the number down, in a building where he had by then listened to four
// rooms and was about to listen to a fifth.
//
// So the player's own bag does exactly the same thing, take by take, quietly,
// where anybody can check it and almost nobody will. By the fifth room the
// night has no numbers in it. Nobody is ever told why.
//
// This is the whole demolition clock. There is no other one, until the end.

export const START_MIN = 21 * 60 + 38;      // 21:38, the service door
export const PER_TAKE_MIN = 72;             // a room, and the walk to the next
export const DEAD = '--:--';                // after the confrontation

const pad = (n) => String(n).padStart(2, '0');

export function clockString(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// The wall-clock time a take was made, if anyone could still read a clock.
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

export function takeStamp(index, { dead = false } = {}) {
  if (dead) return DEAD;
  if (index < 0) return '';
  return erode(timeOfTake(index), EROSION[Math.min(index, EROSION.length - 1)]);
}

// The work order is printed. Print does not rot.
export const WORK_ORDER_STAMP = '21:38';
