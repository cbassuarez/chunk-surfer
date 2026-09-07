// THE THING YOUR OWN VOICE FETCHES.
//
// A recording hallucination puts three bodies in the room with you while you are
// holding a minute of silence. The honest reaction to that is a sound — a breath,
// a word, a shout — and the microphone is listening to the real room. So the
// chain the game has always implied but never closed is:
//
//   the hallucination frightens you
//     -> you make a sound
//       -> the monitor trips
//         -> something comes, and you are not allowed to move
//
// The last step did not exist. Noise during a take spoiled the take, and only
// once the take was already broken did `onTakeBroken` summon a presence — by
// which point the minute was over and there was nothing left to be frightened
// of. `summonPresence`'s parameter even defaults to `reason='noise'`, and no
// caller ever passed it.
//
// WHY IT IS NOT THE PRESENCE. The building's own HUSH may already be active and
// hunting; this must not touch it, borrow its body, or move it. This is a
// separate thing with its own position that exists only inside a take.
//
// EXISTENCE IS A FUNCTION OF THE TAKE, NOT A LIFECYCLE.
//
// The requirement is that it ceases to exist when the recording ends *however*
// it ends — completed, spoiled, stopped, aborted, interrupted by a fight, by a
// scene, by death. Rather than find every one of those exits and remember to
// tear down in each, `step` takes `recording` and returns the absent state when
// it is false. There is no teardown to forget.
//
// THE TRAP IS THAT YOU CANNOT RUN. Holding a take means standing still; moving
// spoils it. So the only ways out are to let it reach you, or to stop the take
// yourself and lose the minute. That is the whole decision, and it is a good one.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const TAKE_HUNTER = Object.freeze({
  // Where it starts, in runtime cells. Far enough to be a sound before it is a
  // shape.
  startCells: 14,
  // Cells per second while it can still hear you. Slower than a walk: the point
  // is the arithmetic you are doing about the clock, not a chase you lose.
  closeCellsPerSec: 1.15,
  // WHAT IT FOLLOWS IS SOUND, so silence is the counterplay.
  //
  // Your voice fetched it; your silence is what sends it away. Below this it has
  // nothing to steer by: it stops closing, and after a moment it starts giving
  // ground. This is the same verb the whole game is about, which is why it is
  // the answer here rather than a dodge or a hiding place.
  hearFloor: 0.055,
  // It does not forget instantly. A held breath buys you distance slowly.
  loseCellsPerSec: 0.42,
  // And it gives up only when it has given back everything it gained AND held
  // quiet long enough to mean it. Distance alone is not enough: without the
  // clock, going silent the instant it arms sent it away in three seconds,
  // because it had not closed any ground to give back yet.
  forgetQuietSeconds: 5,
  // How much louder than the floor counts as "loud". A bare breath is not a
  // shout and must not close like one.
  loudSpan: 0.16,
  // Inside this it has you.
  contactCells: 1.2,
  // A second sound while it is already coming brings it on. Your own panic is
  // the thing that closes the distance.
  startleCells: 1.6,
  // It does not arrive instantly at arm time; there is a beat where you know
  // and it is not there yet.
  graceSeconds: 1.2,
  // THE STOP KEY STOPS WORKING.
  //
  // Ending the take yourself is the clean escape, and while this thing is
  // coming the machine will not take the instruction. You press stop and
  // nothing happens; you press it again and nothing happens. Somewhere in here
  // it finally lets go.
  //
  // A RANGE, drawn per arming, so it is never a counted number the player can
  // learn. Six presses is a fumble; eight is a man hammering a dead key.
  cancelMin: 6,
  cancelMax: 8,
  // ...BUT ONLY ONCE IT IS CLOSE.
  //
  // Seizing from the moment it arms made an early, unpanicked stop cost six
  // presses for nothing — the player had done the sensible thing immediately and
  // was punished for it. The clean exit should stay clean. It is the LATE exit,
  // the one taken when the thing is nearly on you, that must not be reliable.
  seizeCells: 7,
});

export function freshTakeHunter() {
  return { active: false, cells: 0, seconds: 0, cause: '', startles: 0, quiet: 0, cancelNeeds: 0, cancelTries: 0 };
}

// Arm it. `cause` is only for the line he says and the diagnostics.
export function armTakeHunter(state, { cause = 'noise', roll = Math.random() } = {}) {
  const previous = state || freshTakeHunter();
  // Already coming: a second sound does not summon a second one, it brings the
  // one you have closer. See startleCells.
  if (previous.active) {
    return {
      ...previous,
      cells: Math.max(TAKE_HUNTER.contactCells, previous.cells - TAKE_HUNTER.startleCells),
      startles: previous.startles + 1,
    };
  }
  return {
    active: true, cells: TAKE_HUNTER.startCells, seconds: 0,
    cause: String(cause || 'noise'), startles: 0, quiet: 0,
    // Drawn now rather than compared later, so one arming has one answer and
    // the player cannot re-roll it by letting go of the key.
    cancelNeeds: TAKE_HUNTER.cancelMin
      + Math.floor(clamp01(Number(roll)) * (TAKE_HUNTER.cancelMax - TAKE_HUNTER.cancelMin + 1)),
    cancelTries: 0,
  };
}

// Pure step. `recording` false is the whole teardown contract.
//
// `heard` is how audible the player is RIGHT NOW, 0..1 — their own noise
// envelope and their real microphone, whichever is louder. It is what the
// hunter steers by, and going quiet is the only thing that stops it. An earlier
// version took `still` (did the player's cell change), which during a take is
// always true — movement spoils the take anyway — so the parameter was dead and
// the hunter closed relentlessly no matter what the player did.
export function stepTakeHunter(state, dt = 0, { recording = false, heard = 1 } = {}) {
  const previous = state || freshTakeHunter();
  if (!recording) return { state: freshTakeHunter(), contact: false, ended: previous.active, closing: false };
  if (!previous.active) return { state: previous, contact: false, ended: false, closing: false };

  const seconds = Math.max(0, Math.min(0.25, Number(dt) || 0));
  const next = { ...previous, seconds: previous.seconds + seconds };
  if (next.seconds < TAKE_HUNTER.graceSeconds) {
    return { state: next, contact: false, ended: false, closing: false };
  }

  const level = clamp01(heard);
  const audible = level > TAKE_HUNTER.hearFloor;
  if (audible) {
    // How fast it comes is how loud you are. A bare breath draws it in slowly;
    // a shout brings it at a walk.
    const loudness = Math.min(1, (level - TAKE_HUNTER.hearFloor) / TAKE_HUNTER.loudSpan);
    next.cells = Math.max(0,
      previous.cells - seconds * TAKE_HUNTER.closeCellsPerSec * (0.4 + 0.6 * loudness));
    next.quiet = 0;
  } else {
    // Held breath. It stops, then gives ground — and gives up only once it is
    // back where it started AND has had nothing to steer by for a while.
    next.quiet = previous.quiet + seconds;
    next.cells = Math.min(TAKE_HUNTER.startCells, previous.cells + seconds * TAKE_HUNTER.loseCellsPerSec);
    if (next.cells >= TAKE_HUNTER.startCells && next.quiet >= TAKE_HUNTER.forgetQuietSeconds) {
      return { state: freshTakeHunter(), contact: false, ended: false, closing: false, lost: true };
    }
  }

  const contact = next.cells <= TAKE_HUNTER.contactCells;
  return { state: next, contact, ended: false, closing: audible };
}

// TRY TO STOP THE TAKE.
//
// Returns the state and whether the machine actually let go. While this thing is
// coming, the stop key is not a stop key — it is a thing you press.
export function tryCancelTake(state) {
  const previous = state || freshTakeHunter();
  if (!previous.active) return { state: previous, released: true, tries: 0, resisted: false };
  // Far off, the machine still belongs to you. Stop it now and you lose the
  // minute and nothing else — which is exactly the deal, and it should be
  // available to anyone who reads the meter and acts on it.
  if (previous.cells > TAKE_HUNTER.seizeCells) {
    return { state: previous, released: true, tries: previous.cancelTries, resisted: false, early: true };
  }
  const tries = previous.cancelTries + 1;
  const released = tries >= (previous.cancelNeeds || TAKE_HUNTER.cancelMax);
  return {
    state: { ...previous, cancelTries: tries },
    released,
    tries,
    resisted: !released,
  };
}

// 0 while it is far, 1 at contact. For the dread the player can actually feel —
// the monitor, the light, the narrator — without ever printing a distance.
export function takeHunterPressure(state) {
  if (!state?.active) return 0;
  const span = Math.max(1, TAKE_HUNTER.startCells - TAKE_HUNTER.contactCells);
  return clamp01(1 - (state.cells - TAKE_HUNTER.contactCells) / span);
}
