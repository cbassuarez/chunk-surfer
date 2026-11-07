// The keepsake held in the hands: the input glue between the player and the
// winding mechanism. The owning scene translates raw pointer/wheel/controller
// input into this module's contract and receives back the winding state plus
// the events to voice and animate.
//
// Contract (per step):
//   pinHeld    - is the winding pin being held
//   crankDelta - signed pin rotation in turns this step (positive = forward);
//                from a wheel, a circular drag, or an analog stick
//   shake      - 0..1 impulse this step (a shake jostles the train)
//
// Crank rate is lightly smoothed so a jagged drag does not flutter the note
// rate; releasing the pin always slams the winding down through the mechanism.
import { freshWinding, stepWinding, WINDING_PHASE } from './winding.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export const HANDS_TUNING = Object.freeze({ crankSmoothingSeconds: 0.08, shakeWear: 0.004, shakeThreshold: 0.05 });

export function freshHands() {
  return { pinHeld: false, crankRate: 0, shake: 0, winding: freshWinding() };
}

export function stepHands(hands, input = {}, dt = 0) {
  const seconds = clamp(dt, 0, 0.25);
  const pinHeld = input.pinHeld === true;
  const crankDelta = finite(input.crankDelta, 0);
  const shakeImpulse = clamp(input.shake, 0, 1);

  // Instantaneous turn rate (turns per second), smoothed toward it.
  const instantaneous = seconds > 0 ? crankDelta / seconds : 0;
  const blend = 1 - Math.exp(-seconds / HANDS_TUNING.crankSmoothingSeconds);
  const crankRate = finite(hands.crankRate) + (instantaneous - finite(hands.crankRate)) * blend;

  const winding = stepWinding(hands.winding, { held: pinHeld, turn: crankRate }, seconds);
  const events = [...winding.events];

  // Shaking the box jostles the train: a rattle and a little extra wear, and it
  // can knock the pin out of a steady crank (a skip in the note stream).
  if (shakeImpulse > HANDS_TUNING.shakeThreshold) {
    events.push({ type: 'shake', at: 0, impulse: shakeImpulse });
    winding.state.wear = clamp(winding.state.wear + shakeImpulse * HANDS_TUNING.shakeWear, 0, 1);
  }

  return {
    hands: { ...hands, pinHeld, crankRate, shake: shakeImpulse, winding: winding.state },
    events,
    winding: winding.state,
  };
}

export function handsSummary(hands = freshHands()) {
  return { pinHeld: !!hands.pinHeld, crankRate: +finite(hands.crankRate).toFixed(3),
    shake: +finite(hands.shake).toFixed(3), phase: hands.winding?.phase ?? WINDING_PHASE.REST,
    score: +finite(hands.winding?.score).toFixed(3), wear: +finite(hands.winding?.wear).toFixed(3) };
}
