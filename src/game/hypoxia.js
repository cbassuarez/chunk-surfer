// WHAT THE BODY IS NOT TELLING HIM.
//
// The urge to breathe is a carbon dioxide alarm. Chemoreceptors read CO₂;
// oxygen has no alarm at all. That one fact is the whole of this module: the
// warning and the danger are on separate circuits, and the warning can be quiet
// while the danger is not. Freedivers hyperventilate the CO₂ away and lose
// consciousness with no sensation of suffocation whatsoever. Technicians have
// walked into a nitrogen-purged bay and gone down on one breath — and so have
// the people who went in after them.
//
// SO THERE IS NO HYPOXIA LEVEL HERE, AND THERE MUST NEVER BE ONE.
//
// A single monotonic slider would be both physiologically wrong and dramatically
// dead: it makes the state legible, and legibility is the exact thing the
// subject does not have. What is tracked instead is a small set of latent
// variables that move at different rates and do not agree with each other. The
// player never sees any of them. They only ever see the outputs disagree.
//
//   delivery     how much oxygen is actually reaching tissue. Falls silently.
//   drive        the CO₂ alarm. What he FEELS. Can be low while delivery is low,
//                which is the dangerous quadrant and the one nothing warns about.
//   calibration  how well his certainty matches his accuracy. Starts honest,
//                drifts past 1 — the loss of self-criticism that aviation
//                medicine describes before anything else, and the reason a
//                hypoxic pilot reports no problem.
//   clarity      contrast and colour. NOT a tunnel: the literature is clear that
//                moderate hypoxia costs contrast sensitivity and chromatic
//                discrimination, and that true tunnelling is a late, extreme
//                sign. Cones cost more oxygen than rods, so colour goes early.
//   attention    auditory GATING, not hearing. Early auditory evoked potentials
//                survive hypoxia; the P200 attentional component does not. His
//                ears keep working. He stops noticing with them.
//
// See also: the tape is the objective witness and is never touched by any of
// this (playback.js). The whole design depends on the recording staying honest
// while the man does not.

// INSIDIOUS MEANS SLOW. These are per second, and they are deliberately set so
// a bad room takes something like a quarter of an hour to finish the job — long
// enough that the player attributes the first ten minutes of it to the building,
// the lamp, the tiredness, anything but the air.
//
// The scrub rate is the important one: it is faster than production, so a
// frightened man breathing hard drives the alarm to zero and keeps it there
// while the oxygen goes anyway. That gap is the whole mechanism, and it has to
// be reachable in ordinary play or none of this means anything.
const ONSET_PER_SECOND = 0.0013;      // ~13 min at full exposure, before tolerance
const RECOVERY_PER_SECOND = 0.0055;   // ~3 min of clean air to come back from it
const CO2_PER_SECOND = 0.004;         // the alarm builds in a couple of minutes
const SCRUB_PER_SECOND = 0.018;       // and hard breathing empties it in under one

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

// EVERY BODY FAILS IN ITS OWN ORDER.
//
// Aircrew train in altitude chambers specifically to learn their PERSONAL
// symptom sequence, because it is idiosyncratic and consistent for one person
// and useless as a general description. The signature is drawn once per run and
// then never changes: this recordist, tonight, always goes the same way. It is
// what makes the tell learnable inside a run and unlearnable across runs.
export const HYPOXIA_TELL = Object.freeze([
  'fingers',      // paraesthesia — the classic hypocapnic tingle
  'warmth',       // a flush that reads as the building being kinder than it is
  'sweetness',    // a taste; reported often enough to be worth having
  'lightness',    // the head going woolly
  'yawn',         // air hunger arriving as tiredness rather than as alarm
]);

function hash(seed, salt) {
  let value = 0x811c9dc5;
  for (const char of `${seed}:${salt}`) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return (value >>> 0) / 4294967296;
}

// Tolerance varies enormously between people and the same person on different
// days. A run whose recordist happens to be resilient is a real outcome, not a
// bug, and it is why the escalation can never be read off a clock.
export function hypoxiaSignature(seed = 0) {
  const tell = HYPOXIA_TELL[Math.floor(hash(seed, 'tell') * HYPOXIA_TELL.length) % HYPOXIA_TELL.length];
  return Object.freeze({
    tell,
    // 0.75–1.35. Below 1 he goes early; above 1 he lasts and is worse for it,
    // because the impairment arrives further from anything that felt like a cue.
    tolerance: .75 + hash(seed, 'tolerance') * .6,
    // Which faculty leads. Not everyone loses colour first.
    leads: hash(seed, 'leads') < .5 ? 'clarity' : 'attention',
  });
}

export function freshHypoxia(seed = 0) {
  return {
    schema: 1,
    signature: hypoxiaSignature(seed),
    // Nothing is wrong yet, and nothing would tell him if it were.
    exposure: 0,
    delivery: 1,
    drive: 0,
    stress: 0,
    seconds: 0,
  };
}

// EXPOSURE IS A RATE, NOT A COUNTDOWN.
//
// `source` is how fast this air is taking oxygen out of him, and it is set by
// the world — a plant room, a flooded floor, a sealed stair. `stress` is his
// own breathing. The two interact the wrong way round, which is the point:
// breathing harder does not help, because the air is not short of oxygen. It
// only blows off CO₂, which takes away the one sensation that would have told
// him anything.
export function stepHypoxia(state, dt = 0, { source = 0, stress = 0, fresh = false } = {}) {
  const next = { ...state, signature: state.signature };
  const seconds = Math.max(0, Number(dt) || 0);
  next.seconds = finite(state.seconds, 0) + seconds;
  const rate = clamp01(source) / Math.max(.35, next.signature?.tolerance || 1);
  next.stress = clamp01(stress);

  if (fresh) {
    // Air. The only thing that actually helps, and the only thing the fiction
    // is allowed to let help. Recovery is faster than onset but not instant —
    // he has to stay out, and staying out costs him the take.
    next.exposure = Math.max(0, finite(state.exposure, 0) - seconds * RECOVERY_PER_SECOND);
  } else {
    next.exposure = clamp01(finite(state.exposure, 0) + seconds * rate * ONSET_PER_SECOND);
  }
  next.delivery = clamp01(1 - next.exposure);

  // THE ALARM, ON ITS OWN CIRCUIT.
  //
  // Drive tracks CO₂. Working hard raises it; breathing hard scrubs it out.
  // A frightened man breathes hard, so fear quiets the alarm — which is exactly
  // backwards from what fear is for, and exactly what the physiology says.
  const produced = seconds * (CO2_PER_SECOND + rate * CO2_PER_SECOND * .6);
  const scrubbed = seconds * next.stress * SCRUB_PER_SECOND;
  next.drive = clamp01(finite(state.drive, 0) + produced - scrubbed);
  return next;
}

// The dangerous quadrant: oxygen going, and nothing saying so. Not surfaced as
// a number anywhere — it exists so the writing can know when a line should
// sound content rather than strained.
export function hypoxiaUnwarned(state) {
  return clamp01(finite(state?.exposure, 0)) > .18 && clamp01(finite(state?.drive, 0)) < .35;
}

// WHAT COMES OUT, AND IN WHICH ORDER.
//
// Deliberately not proportional to one another. Confidence miscalibration leads,
// because loss of self-criticism is the first thing aviation medicine reports
// and the last thing anyone notices in themselves. Vision follows. Auditory
// gating goes last and never becomes deafness.
export function hypoxiaFrame(state) {
  const exposure = clamp01(finite(state?.exposure, 0));
  const leadsClarity = state?.signature?.leads !== 'attention';
  const ramp = (from, to) => clamp01((exposure - from) / Math.max(.01, to - from));

  return Object.freeze({
    // 1 is honest. Above 1 he is surer than he has any right to be. This is the
    // headline output and the only one that is not a degradation — it is an
    // INFLATION, which is why it reads as wrongness rather than as damage.
    calibration: 1 + ramp(.10, .85) * .95,
    // Contrast and colour, not a tunnel. The narrowing term stays near zero
    // until the very end, where it is a symptom of imminent unconsciousness
    // rather than a difficulty dial.
    contrast: 1 - ramp(leadsClarity ? .12 : .26, .9) * .55,
    colour: 1 - ramp(leadsClarity ? .08 : .22, .8) * .8,
    narrowing: ramp(.82, 1) * .6,
    // Auditory ATTENTION. The audio bus is never touched by this — see the
    // module note. What degrades is which sounds get noticed and how they are
    // labelled, never how they sound.
    gating: 1 - ramp(leadsClarity ? .3 : .16, .95) * .7,
    // How wrong the read is allowed to be. Kept well behind calibration so the
    // gap between them — right less often, sure more often — opens early.
    error: ramp(.22, 1) * .55,
    unwarned: hypoxiaUnwarned(state),
    tell: state?.signature?.tell || HYPOXIA_TELL[0],
    // For the writing only. Never rendered as a quantity.
    stage: exposure < .1 ? 'clear'
      : exposure < .3 ? 'onset'
        : exposure < .6 ? 'euphoric'
          : exposure < .85 ? 'unreliable' : 'failing',
  });
}

// WHAT THE RENDERER IS TOLD, AND WHAT IT IS NOT.
//
// One rule governs all of this: the simulation does not change, the perception
// of it does. The lamp keeps its battery, the room keeps its lights, the HUD
// keeps its readouts — and less of it arrives. A player who suspects the torch
// will check the meter, and the meter will say the torch is fine.
//
// `reducedDread` is honoured here rather than at the call sites, because these
// effects are genuinely disorienting and that is exactly why they work. The
// audio channel staying honest is what makes the accessibility gate cheap: a
// player who turns the visuals down still gets the whole beat through the tape.
export function hypoxiaPerception(frame, { reducedDread = false } = {}) {
  if (!frame || reducedDread) {
    return Object.freeze({ torch: 1, coverage: 1, chroma: 1, narrowing: 0 });
  }
  return Object.freeze({
    // Feeds resolveTorchLook's `perception`. Reach and throw only.
    torch: clamp01(frame.contrast),
    // Feeds r3dSetWhitePointZoneAmount. The halftone's coverage IS this game's
    // contrast sensitivity — dim rooms are already extinguished by a negative
    // coverage bias, so lowering the ceiling is the same failure the retina has.
    coverage: clamp01(.45 + frame.contrast * .55),
    // Cones cost more oxygen than rods, so colour goes before form.
    chroma: clamp01(frame.colour),
    // Held near zero until the very end. A closing field is a sign of imminent
    // unconsciousness, not a difficulty dial — see the note on `narrowing`.
    narrowing: clamp01(frame.narrowing),
  });
}

// CONFIDENCE, DECOUPLED FROM ACCURACY.
//
// The game's honest model is calibrated: a poor read is hedged, and the hedging
// is how the player knows to be careful. Hypoxia breaks that, and breaking it is
// the entire dramatic device — the card stops saying `probably` at exactly the
// point it stops being right.
//
// Two stages, because going straight to the second is unbelievable:
//
//   floor   the hedging simply stops arriving. He is not overclaiming, he has
//           merely lost the part that adds `I think`. Modest, and unsettling
//           precisely because nothing obviously wrong has happened.
//   certain outright conviction in an error. Reserved for the last stage, used
//           rarely, because a narrator who is confidently wrong all the time is
//           just a narrator nobody believes.
export function hypoxiaConfidence(fidelity, calibration = 1) {
  const honest = clamp01(fidelity);
  const inflated = clamp01(honest * Math.max(0, Number(calibration) || 1));
  return {
    stated: inflated,
    // Above ~1.55 the inflation stops being a floor and becomes a claim.
    pathological: Number(calibration) >= 1.55 && honest < .55,
  };
}
