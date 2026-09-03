// THE MACHINE AT THE EDGE OF THE FIELD.
//
// The crossing used to begin on an unlabelled press. The pad at the end of the
// source was a floating line of this game's own reducer, and touching it either
// opened the POINT OF NO RETURN slate — if the night had laid a hand on you — or,
// for every other run, dropped you straight into a two-minute walk with no text
// on it at all. A sequence that long should not start by accident.
//
// So it starts with a transport that has to be threaded. Three dials, and they
// are deliberately the three things the walk itself is made of:
//
//   LENGTH  how long the recording runs   -> position is time
//   CENTRE  where the picture's mass sits -> follow the bright mass
//   DAMAGE  where it comes apart          -> the middle is ruined, the end is dark
//
// Getting them right is the tutorial for the crossing. By the time the tape
// runs, the player has been told, in the machine's own terms, what walking it
// will ask of them.
//
// EVERY ANSWER IS DERIVED FROM THE BAKE, never authored beside it. The readings
// below are measured off HORIZON_PROFILE at call time, so re-baking the tape
// re-answers the puzzle and the two cannot drift apart. This is the same reason
// the marker depths are read off the profile rather than typed in.
//
// Selection semantics only. Presentation, saving and the window cue stay with
// main.js, exactly as key-cabinet.js keeps them.

import { HORIZON_PROFILE } from '../data/generated/horizon-profile.js';
import { SOURCE_HORIZON } from '../data/source-level.js';

// A reading is "off centre" once the picture's mass sits this far from the
// middle, in tape units. Below it the head is genuinely ambiguous and the dial
// would be a coin toss.
const CENTRE_DEADBAND = 2.5;
// What counts as the picture coming apart. The profile's mosh channel runs 0 to
// about 0.77; half of that is comfortably clear of the clean stretches at both
// ends and comfortably inside the ruined middle.
const DAMAGE_THRESHOLD = 0.5;

const mmss = (seconds) => {
  const whole = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

// Where the damage actually is, as a fraction of the tape. Measured, not typed.
function damageSpan(profile = HORIZON_PROFILE) {
  const mosh = profile?.mosh || [];
  let first = -1;
  let last = -1;
  for (let i = 0; i < mosh.length; i += 1) {
    if (mosh[i] < DAMAGE_THRESHOLD) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0) return null;
  const count = Math.max(1, mosh.length);
  return { first, last, from: first / count, to: (last + 1) / count };
}

export const HORIZON_TRANSPORT_DIALS = Object.freeze(['length', 'centre', 'damage']);

export const HORIZON_TRANSPORT_OPTIONS = Object.freeze({
  length: Object.freeze(['2:19', '4:19', '6:47']),
  centre: Object.freeze(['LEFT OF FRAME', 'CENTRED', 'RIGHT OF FRAME']),
  damage: Object.freeze(['FROM THE HEAD', 'THROUGH THE MIDDLE', 'AT THE TAIL']),
});

export const HORIZON_TRANSPORT_LABELS = Object.freeze({
  length: 'RUN LENGTH',
  centre: 'PICTURE CENTRE, AT THE HEAD',
  damage: 'WHERE IT BREAKS UP',
});

export function freshHorizonTransport() {
  return { schema: 1, length: null, centre: null, damage: null, attempts: 0, threaded: false };
}

export function normalizeHorizonTransport(value = {}) {
  const base = freshHorizonTransport();
  if (!value || typeof value !== 'object') return base;
  const pick = (dial) => (HORIZON_TRANSPORT_OPTIONS[dial].includes(value[dial]) ? value[dial] : null);
  return {
    ...base,
    length: pick('length'),
    centre: pick('centre'),
    damage: pick('damage'),
    attempts: Math.max(0, Math.floor(Number(value.attempts) || 0)),
    threaded: !!value.threaded,
  };
}

/**
 * What the tape actually is, measured off the bake. Both the answers and the
 * readings the machine shows come from here, so they can never disagree.
 */
export function horizonTransportTruth(profile = HORIZON_PROFILE, horizon = SOURCE_HORIZON) {
  // The profile describes the PICTURE (slices, drift, damage); the tape's own
  // duration belongs to the level, which is the one place that knows how long
  // the recording is. Both, so neither can be typed in beside the puzzle.
  const runSeconds = Number(horizon?.tapeSeconds) || 259.375;
  const headCom = Number(profile?.com?.[0]) || 0;
  const span = damageSpan(profile);

  const centre = Math.abs(headCom) < CENTRE_DEADBAND ? 'CENTRED'
    : headCom > 0 ? 'RIGHT OF FRAME' : 'LEFT OF FRAME';

  // Which third the damage lives in. A span that starts in the first fifth is
  // "from the head"; one that ends in the last fifth is "at the tail"; anything
  // that sits inside is the middle.
  const damage = !span ? 'FROM THE HEAD'
    : span.from < 0.2 ? 'FROM THE HEAD'
      : span.to > 0.8 ? 'AT THE TAIL'
        : 'THROUGH THE MIDDLE';

  return Object.freeze({
    runSeconds,
    length: mmss(runSeconds),
    centre,
    damage,
    headCom,
    span,
  });
}

/**
 * THE READINGS ON THE MACHINE, one per part, each readable on its own.
 *
 * This is the half that keeps the puzzle honest: the raw figures are all in the
 * room, one inspect at a time, so a browser build with every window effect
 * refused loses the convenience of seeing them together and never loses the
 * answer. The window surfaces show exactly these three and nothing else.
 */
export function horizonTransportReadings(profile = HORIZON_PROFILE) {
  const truth = horizonTransportTruth(profile);
  const com = profile?.com || [];
  const span = truth.span;
  const slices = Math.max(1, Number(profile?.slices) || com.length || 1);
  const pct = (v) => `${Math.round(v * 100)}%`;
  return Object.freeze([
    Object.freeze({
      dial: 'length',
      part: 'THE REEL',
      title: 'RUN LENGTH',
      reading: `${truth.runSeconds.toFixed(3)} s`,
      note: 'Stamped on the reel, in seconds, the way a lab stamps it. The dial is asking for it the way a person says it.',
    }),
    Object.freeze({
      dial: 'centre',
      part: 'THE GATE',
      title: 'PICTURE CENTRE',
      reading: `${truth.headCom >= 0 ? '+' : ''}${truth.headCom.toFixed(1)} of 64`,
      note: 'Where the mass of the first frame sits, measured out from the middle of the gate. Positive is toward the right of the frame.',
    }),
    Object.freeze({
      dial: 'damage',
      part: 'THE LOG',
      title: 'BREAK-UP',
      reading: span
        ? `slices ${span.first}-${span.last} of ${slices}  (${pct(span.from)}-${pct(span.to)})`
        : 'none logged',
      note: 'The stretch the previous operator marked as unrecoverable. The dial is asking whereabouts on the tape that is.',
    }),
  ]);
}

/** Which dials are set, and whether the machine will run. */
export function horizonTransportThreaded(value = {}, profile = HORIZON_PROFILE) {
  const state = normalizeHorizonTransport(value);
  const truth = horizonTransportTruth(profile);
  const wrong = HORIZON_TRANSPORT_DIALS.filter((dial) => state[dial] !== truth[dial]);
  return {
    ready: HORIZON_TRANSPORT_DIALS.every((dial) => state[dial] !== null),
    ok: wrong.length === 0,
    wrong,
  };
}

/**
 * Try to run it. Refusing is diegetic and it is INFORMATIVE WITHOUT BEING THE
 * ANSWER: the machine says how many settings it disagrees with, never which,
 * because "one of these three is wrong" is a reason to go back and read, and
 * "the middle one is wrong" is the solution with extra steps.
 */
export function threadHorizonTransport(value = {}, profile = HORIZON_PROFILE) {
  const state = normalizeHorizonTransport(value);
  const { ready, ok, wrong } = horizonTransportThreaded(state, profile);
  if (!ready) {
    return {
      state,
      ran: false,
      reason: 'unset',
      text: 'The transport will not turn over with a dial unset. It wants all three before it commits to anything.',
    };
  }
  const next = { ...state, attempts: state.attempts + 1, threaded: ok };
  if (!ok) {
    return {
      state: next,
      ran: false,
      reason: 'wrong',
      wrongCount: wrong.length,
      text: wrong.length === 1
        ? 'The reels turn a quarter and stop. One of the three does not match what is on the tape.'
        : `The reels turn a quarter and stop. ${wrong.length} of the three do not match what is on the tape.`,
    };
  }
  return {
    state: next,
    ran: true,
    reason: 'threaded',
    text: 'The reels take up. Somewhere past the last of the field, the dark stops being empty and starts being a picture.',
  };
}
