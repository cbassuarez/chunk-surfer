// What the recordist thinks is about to happen.
//
// This replaces a stat block. The card used to read INTENT · KIND · DMG ·
// COUNTER — four labels, none of them things a person thinks, and all four of
// them certain. Certainty was the problem. A readout cannot be wrong, so the
// opponent could never sell you anything, and the fight had no room in it for
// the one thing a night like this is actually made of: being sure, and being
// sure of the wrong thing.
//
// So the telegraph becomes a guess. The recordist watches the room and says
// what they reckon is coming and what they mean to do about it, in the first
// person, lowercase, hedged — "i think", "i should", and, when it goes wrong,
// "oh". The engine still commits honestly a beat ahead; what can be wrong is
// the read, and a read being wrong is a person being wrong, not a game lying.
//
// The hedging is load-bearing in both directions. It is why a miss lands as
// dread instead of as a bug, and it is why the trace can carry confidence at
// all: certainty, doubt and panic are the same information the old card showed,
// said the way a mind says it.
//
// Pure. No rendering, no audio, no state. The scene asks it for lines.

import { GRID } from './combat-damage.js';

const CONFIDENCE = Object.freeze({ SURE: 'sure', LIKELY: 'likely', UNSURE: 'unsure' });

// A mouth speaks; a mind types. Everything here is the mind, so everything here
// is lowercase — the one typographic tell that separates the recordist's own
// thinking from the room shouting at them in VFD capitals.
const quiet = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

// FNV-1a over the beat, so a thought is stable for as long as the beat it
// belongs to. The trace must not reshuffle its wording every animation frame,
// and it must not re-word itself mid-beat when the player is still reading it.
function hash32(...parts) {
  const key = parts.join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const phrase = (bank, ...parts) => (bank.length ? bank[hash32(...parts) % bank.length] : '');

// What the recordist means to do about it, in their own words rather than the
// name of a button. The tile still lights; this is the reason it lights.
const PLAN = Object.freeze({
  monitor: ['get it on tape.', 'tape it.', 'roll on it.'],
  hold: ['brace.', 'take it on my hands.', 'hold.'],
  expose: ['put the torch on it.', 'light it up.', 'torch it.'],
  invert: ['turn it back on itself.', 'run it backwards.', 'invert it.'],
  'radio-decoy': ['throw my voice.', 'give it something else to hear.'],
  parry: ['meet it.', 'catch it coming in.'],
  whiteout: ['burn it out.', 'everything on the torch.'],
  'master-take': ['take the definitive one.', 'this is the take.'],
  'runaway-feedback': ['let it eat itself.', 'feed it back.'],
  playback: ['play it back at it.', 'give it its own voice.'],
});

// When the bag has no answer to what is coming. Not a failure state — most
// beats have no perfect counter — but the thought should sound like a person
// noticing that, not like a disabled button.
const NO_ANSWER = Object.freeze([
  'i have nothing for that.',
  'nothing in the bag answers that.',
  'i just have to wear it.',
]);

// What a mood sounds like from the outside. Guided says it; every other preset
// gets the same fact as a terse readout in the header, because a fight with no
// prose in it still has to be readable.
const STANCE_READ = Object.freeze({
  testing: ["it's still taking my measure.", "it hasn't decided about me yet."],
  pressing: ["it's pressing. it wants to hit.", "it's leaning on me now."],
  setting: ["it's setting something up.", "it isn't swinging. it's arranging."],
  mirroring: ["it's learned how i answer.", "it's stopped offering me the easy ones."],
  cornered: ["it's hurt, and it knows.", "it's cornered. that's when they're worst."],
});

const CHAIN_WARNING = Object.freeze([
  "that one comes twice. the guard only covers the first.",
  "there's a second one behind it. bracing won't catch both.",
]);

const CHARGE_PROMPT = Object.freeze([
  'i can afford to be loud.',
  "there's enough in the bag for something big.",
]);

const HEDGE = Object.freeze({
  sure: [''],
  likely: [' i think.', ' probably.', ' that\'s my read.'],
  unsure: [' maybe. i don\'t know.', ' or something else. i can\'t tell.', ' i\'m guessing.'],
});

// The second half of a two-thought read already carries the doubt in its shape,
// so it takes the short hedge — "or X. or something else. i can't tell." is a
// person stalling, not a person unsure.
const UNRESOLVED = Object.freeze([' i can\'t tell.', ' one of those.', ' i don\'t know.']);

// The beat after a read misses. Short, because there is no time — the blow has
// already landed and the next one is already coming.
const WRONG = Object.freeze([
  'oh — that wasn\'t it.',
  'no. i had that wrong.',
  'that\'s not what i thought.',
  'wrong. i read it wrong.',
]);

// Composure is the dial the player can feel without being told. As it goes, the
// thinking stops being sentences: the read repeats itself, loses its ending,
// starts again. Nothing is hidden — the same words are there — they just stop
// arriving in order.
const spoken = (word) => word.replace(/[^a-z']/gi, '').length >= 3;

function fray(text, pressure, seedKey) {
  if (pressure < .6 || !text) return text;
  const words = text.split(' ');
  if (words.length < 3) return text;
  // Far gone: the thought catches on a word and has to start it again. Once —
  // a caught breath, not a stutter loop.
  if (pressure >= .82) {
    const at = words.findIndex(spoken);
    if (at < 0) return text;
    return [...words.slice(0, at), `${words[at].replace(/[.,?]+$/, '')}—`, ...words.slice(at)].join(' ');
  }
  const at = 1 + (hash32(seedKey, 'fray') % Math.max(1, words.length - 1));
  if (!spoken(words[at - 1])) return text;
  return [...words.slice(0, at), words[at - 1], ...words.slice(at)].join(' ');
}

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

// How good the recordist's read is this beat, 0..1.
//
// Everything that feeds this is something the player can feel and change: the
// difficulty they chose, whether they spent the fork, which way the stance
// triangle is leaning, whether the room is still ringing, and how much composure
// they have left. Nothing here is hidden and nothing here is a die roll — a
// player who wants a clean read can go and buy one.
//
//   guided  ≈ .92  (≈1.0 in SIGNAL)  — effectively never wrong; that is what guided is
//   standard≈ .62  (≈.72 in SIGNAL)
//   severe  ≈ .47
//   dead-air≈ .32  — floored at .35, so it is never pure noise
export function readFidelity(state) {
  const composure = Math.max(0, Number(state?.composure) || 0);
  const max = Math.max(1, Number(state?.maxComposure) || 1);
  // composureBonus is in GRID units (see combat-damage.js), so it is divided
  // back down before the clamp. Clamping the raw number to ±2 collapsed the
  // ladder the moment the grid was rescaled: severe (-5) and dead-air (-10) both
  // saturated at -2 and the two hardest presets stopped reading differently.
  let fidelity = .62 + .15 * clamp((Number(state?.difficulty?.composureBonus) || 0) / GRID, -2, 2);
  if (state?.tuneUsedMovement === state?.movementIndex) fidelity += .25;
  if (state?.snr === 'signal') fidelity += .10;
  if (state?.snr === 'noise') fidelity -= .10;
  if (state?.ringing) fidelity -= .10;
  fidelity -= .15 * (1 - composure / max);
  return clamp(fidelity, .35, 1);
}

// CERTAINTY IS A SEPARATE FACULTY FROM ACCURACY, AND IT FAILS SEPARATELY.
//
// The honest model is calibrated: a poor read is hedged, and the hedging is how
// the player knows to be careful. It is the single most trusted thing on the
// screen, which is exactly why it is worth breaking.
//
// `calibration` comes from game/hypoxia.js and is 1 when he is himself. Above 1
// his stated certainty runs ahead of his actual read — the loss of
// self-criticism that aviation medicine describes as the FIRST effect, before
// anything he could notice. It arrives in two stages, because going straight to
// conviction is unbelievable:
//
//   the floor      the hedging stops arriving. He is not overclaiming; the part
//                  that adds `I think` has simply gone. Nothing looks wrong.
//   the conviction outright certainty in an error. The last stage only, and
//                  rarely — a narrator confidently wrong all the time is just a
//                  narrator nobody believes.
export function readConfidence(state, fidelity = 1, calibration = 1) {
  const composure = Math.max(0, Number(state?.composure) || 0);
  const max = Math.max(1, Number(state?.maxComposure) || 1);
  const trust = Math.max(0, Number(calibration) || 1);
  // Inflated: what he WOULD say. The honest fidelity is untouched and still
  // decides whether he is right — only the hedging moves.
  const stated = Math.min(1, Math.max(0, fidelity) * trust);
  if (trust >= 1.55 && fidelity < .55) return CONFIDENCE.SURE;
  if (stated >= .92) return CONFIDENCE.SURE;
  if (stated >= .68 && (composure / max > .35 || trust > 1.2)) return CONFIDENCE.LIKELY;
  return CONFIDENCE.UNSURE;
}

// The whole trace for one beat.
//
//   intent      what the recordist believes is coming (the READ, never ground
//               truth — the caller decides which of those it is handing over)
//   alternative the other thing it might be, shown only when unsure
//   counters    the moves that would answer `intent`, already filtered to what
//               the player can actually do right now
//   wrong       the previous read missed; lead with the recognition
//   fidelity    0..1, how good the recordist's read is this beat
//
// Returns lines in reading order. `tone` is a hint for the renderer, not a
// colour: 'read' is the guess, 'plan' is the intention, 'miss' is the correction.
export function thoughtTrace(state, {
  intent = null,
  alternative = null,
  counters = [],
  wrong = false,
  fidelity = 1,
  // 'full' adds the mood, the chain warning and the charge prompt. Anything
  // less gets the read and the plan; the caller decides whether to draw it at
  // all. See COMBAT_GUIDANCE.
  guidance = 'trace',
  // 1 while he is himself. See readConfidence — this is the only input that can
  // make the trace surer than it has any right to be.
  calibration = 1,
  stance = null,
  chained = false,
  chargeReady = false,
  // The Hall roster. `house` remains a compatibility input for old callers.
  apparitions = null,
  house = null,
} = {}) {
  const lines = [];
  const beat = `${state?.definition?.id || ''}:${state?.movementIndex ?? 0}:${state?.cycleIndex ?? 0}`;
  const composure = Math.max(0, Number(state?.composure) || 0);
  const max = Math.max(1, Number(state?.maxComposure) || 1);
  const pressure = 1 - composure / max;

  if (wrong) lines.push({ text: phrase(WRONG, beat, 'wrong'), tone: 'miss' });
  if (!intent) {
    if (!lines.length) lines.push({ text: 'nothing yet.', tone: 'read' });
    return { lines, confidence: CONFIDENCE.SURE };
  }

  const confidence = readConfidence(state, fidelity, calibration);
  const named = quiet(intent.label || intent.kind);
  const hedge = phrase(HEDGE[confidence], beat, 'hedge');

  // The read. Sure of it, that is one thought. Unsure, it is two thoughts that
  // will not resolve into one — the honest shape of not knowing, and the shape
  // TUNE collapses back down to a single line.
  if (confidence === CONFIDENCE.UNSURE && alternative) {
    lines.push({ text: fray(`${named}?`, pressure, `${beat}:read`), tone: 'read' });
    const unresolved = phrase(UNRESOLVED, beat, 'alt');
    lines.push({ text: fray(`or ${quiet(alternative.label || alternative.kind)}.${unresolved}`, pressure, `${beat}:alt`), tone: 'read' });
  } else {
    lines.push({ text: fray(`${named}.${hedge}`, pressure, `${beat}:read`), tone: 'read' });
  }

  // The plan. Named as an intention, never as a key — the tile lighting in the
  // command band is what tells you where the intention lives.
  const answer = counters.find((move) => PLAN[move.id]);
  const plan = answer
    ? phrase(PLAN[answer.id], beat, 'plan')
    : phrase(NO_ANSWER, beat, 'plan');
  lines.push({ text: fray(plan, pressure, `${beat}:plan`), tone: 'plan' });

  // WHICH ONE. Each body is a real target, and the thought names a mismatch
  // between the next actor and the selected primary without calling either one
  // a row, section, or piece of architecture.
  const roster = apparitions || house;
  if (roster?.members?.length) {
    const acting = roster.members.find((member) => member.id === roster.activeActorId)
      || roster.members.find((member) => !member.defeated);
    const aimed = roster.members.find((member) => member.primary)
      || roster.members.find((member) => member.targeted);
    if (acting && aimed && acting.id !== aimed.id) {
      lines.push({ text: fray(`${quiet(acting.label)} moves.`, pressure, `${beat}:aim`), tone: 'warn' });
      lines.push({ text: fray(`i'm aimed at ${quiet(aimed.label)}.`, pressure, `${beat}:aim2`), tone: 'warn' });
    } else if (aimed) {
      lines.push({ text: fray(`${quiet(aimed.label)}. ${aimed.health} left.`, pressure, `${beat}:aim`), tone: 'read' });
    }
  }

  // The guided extras. Not decoration: each one is a rule of this fight that a
  // player would otherwise learn by being hit with it. A chain slips a guard
  // because prevention only covers the first hit, and the charge economy is
  // brand new and has nothing else teaching it.
  if (guidance === 'full') {
    if (chained) lines.push({ text: phrase(CHAIN_WARNING, beat, 'chain'), tone: 'warn' });
    if (stance && STANCE_READ[stance]) {
      lines.unshift({ text: phrase(STANCE_READ[stance], beat, 'stance'), tone: 'stance' });
    }
    if (chargeReady) lines.push({ text: phrase(CHARGE_PROMPT, beat, 'charge'), tone: 'plan' });
  }

  return { lines, confidence };
}

export { CONFIDENCE };
