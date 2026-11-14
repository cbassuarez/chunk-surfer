// The elapsed time belongs to the take. Looking can expose a sound in the
// room, but this beat never advances the tape or changes the hunter.
const MINIMUM_TURN = Math.PI / 6;
const TURN_SETTLE_SECONDS = .56;
const LOWER_SETTLE_SECONDS = 1.15;
const MINIMUM_TAKE_SECONDS = 4;

export function createRecordingListenBeat() {
  let lowering = null, steppedAt = null;
  function reset() { lowering = null; steppedAt = null; }
  function update({ lowered, eligible, elapsed, yaw, duration }) {
    if (!lowered || !eligible || duration - elapsed < 2) {
      lowering = null;
      return null;
    }
    if (steppedAt !== null) return elapsed - steppedAt < 1.2 ? { listening: true } : null;
    if (!lowering) lowering = { at: elapsed, yaw, settledAt: elapsed, turn: 0 };
    const delta = Math.atan2(Math.sin(yaw - lowering.yaw), Math.cos(yaw - lowering.yaw));
    if (Math.abs(delta) > .003) {
      lowering.yaw = yaw;
      lowering.turn += delta;
      lowering.settledAt = elapsed;
    }
    if (Math.abs(lowering.turn) < MINIMUM_TURN) return null;
    const ready = elapsed >= MINIMUM_TAKE_SECONDS && elapsed - lowering.at >= LOWER_SETTLE_SECONDS
      && elapsed - lowering.settledAt >= TURN_SETTLE_SECONDS;
    if (!ready) return { listening: true };
    steppedAt = elapsed;
    return { listening: true, step: true, bearing: -Math.sign(lowering.turn) * 1.24 };
  }
  return { reset, update };
}
