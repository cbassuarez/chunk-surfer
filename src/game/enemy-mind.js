// The opponent's mind.
//
// It used to be a modulo. `intents[intentIndex % intents.length]`, forever, and
// difficulty changed nothing but the order of the array. Whatever the player
// did — hoard a take for six beats, burn the torch flat, answer every broadcast
// the same way — the thing across from them counted to three and started again.
//
// This chooses instead. Two layers, and the reason there are two is worth
// stating because one would have been easier:
//
//   STANCE is the mood, and it PERSISTS. A bare utility score recomputed every
//   beat produces an opponent that twitches — mathematically responsive and
//   completely unreadable, which is a worse fight than the metronome. A pool is
//   three or four intents wide; a softmax over four items is not something a
//   player can learn. A mood held for several beats is.
//
//   THE DRAW is the variety, inside the mood. Weighted, seeded, deterministic.
//
// And the stance is PUBLIC. This is what makes the misread survivable: the
// opponent never lies about its posture, only about which blow inside that
// posture is coming. A player who reads `pressing` knows it is overload-or-loop
// even when the label is wrong, so they can still play the odds and still land
// a perfect counter. Without an honest floor underneath it, a fallible read
// would quietly delete TEMPO and turn the drill into a coin toss.
//
// Pure, and deliberately ignorant of combat-state: everything it needs arrives
// as a plain context object, so there is no import cycle and no way for it to
// reach around the rules and touch the fight directly.

import { GRID } from './combat-damage.js';

export const ENEMY_STANCE = Object.freeze({
  TESTING: 'testing',
  PRESSING: 'pressing',
  SETTING: 'setting',
  MIRRORING: 'mirroring',
  CORNERED: 'cornered',
});

// How much each mood wants each kind of blow. Not damage — appetite.
const STANCE_APPETITE = Object.freeze({
  testing: { broadcast: 1.5, conceal: 1.1, overload: 0.9, loop: 0.9, silence: 0.3 },
  pressing: { broadcast: 0.8, conceal: 0.4, overload: 2.0, loop: 1.6, silence: 0.2 },
  setting: { broadcast: 0.6, conceal: 2.0, overload: 0.5, loop: 0.8, silence: 1.6 },
  cornered: { broadcast: 1.0, conceal: 0.8, overload: 1.8, loop: 1.8, silence: 0.4 },
  // `mirroring` has no table: it is computed against the player's habits.
  mirroring: null,
});

// Beats the opponent has actually TAKEN in this mood. Counted on its own turns,
// not on the player's — a recordist chaining perfect counters skips the enemy
// beat entirely, and if dwell ticked there they could rush the opponent through
// moods it never got to express.
const MIN_DWELL = 2;
const CORNERED_AT = 0.34;
const DESPERATE_COMPOSURE = 0.34;

// How sharply the mood's appetite is followed. At 0.9 the draw is nearly even
// and the opponent is mostly still reading its script.
//
// Dead air used to sit at 0.12 — effectively argmax, taking the single best
// move against you every beat. Measured, that made it EASIER than severe, and
// the reason is obvious in hindsight: an opponent that always plays optimally
// is an opponent that always plays predictably, and this whole fight is about
// reading what is coming. Ruthlessness is not the same as unreadability. The
// meaner presets get their edge from the recordist's read failing more often
// and from being cornered on a worn bag — not from being easy to forecast.
const TEMPERATURE = Object.freeze({
  guided: 0.90, standard: 0.60, severe: 0.45, 'dead-air': 0.35,
});

function hash32(...parts) {
  const key = parts.join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// 0..1 from a key. Stateless on purpose: no mutable stream to keep in the save,
// no way for an extra call somewhere to shift every later decision, and a fight
// that replays exactly from its inputs alone.
const unit = (...parts) => hash32(...parts) / 4294967296;

export function emptyEnemyRead() {
  return {
    // How the player answers each kind, and how often they land it. Reaching
    // for a verb and landing it are different facts about a person.
    answers: {},
    landed: {},
    // Within the current movement.
    thrown: {},
    recent: [],
    // Board habits.
    takeDwell: 0,
    perfectStreak: 0,
    beats: 0,
  };
}

export function openingStance() {
  return { id: ENEMY_STANCE.TESTING, dwell: 0 };
}

// What the player leans on, most-used first. The basis of `mirroring`: an
// opponent that has watched you answer everything with the recorder starts
// throwing the things the recorder does not answer.
export function favouredAnswers(read) {
  return Object.entries(read?.answers || {})
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([action]) => action);
}

// The mood for the beat about to be chosen. First match wins; `cornered` is a
// hard override that ignores dwell, because being hurt is not a mood you finish
// your sentence in.
export function nextStance(context) {
  const { stance, read, board, difficulty } = context;
  const current = stance?.id || ENEMY_STANCE.TESTING;
  const dwell = Math.max(0, Number(stance?.dwell) || 0);
  const coherence = board.maxCoherence > 0 ? board.coherence / board.maxCoherence : 1;
  const composure = board.maxComposure > 0 ? board.composure / board.maxComposure : 1;

  if (coherence > 0 && coherence <= CORNERED_AT) return ENEMY_STANCE.CORNERED;
  if (dwell < MIN_DWELL) return current;
  if ((read.perfectStreak || 0) >= 2) return ENEMY_STANCE.MIRRORING;
  if (composure <= DESPERATE_COMPOSURE) return ENEMY_STANCE.PRESSING;
  if ((read.takeDwell || 0) >= 2) return ENEMY_STANCE.SETTING;
  if (coherence >= 0.80) return ENEMY_STANCE.TESTING;
  // A pressured player gets leaned on; a struggling one gets a breath. This is
  // where the psychological profile's adaptive band lands, as one term among
  // several rather than as a silent re-sort of the authored script.
  const lean = 0.5 + 0.25 * (Number(difficulty?.pressureBias) || 0);
  return unit(context.seed, 'stance', read.beats) < lean ? ENEMY_STANCE.PRESSING : ENEMY_STANCE.SETTING;
}

function appetiteFor(stanceId, kind, read, counterFor) {
  const table = STANCE_APPETITE[stanceId];
  if (table) return table[kind] ?? 1;
  // MIRRORING: lean hard into the kinds the player's two favourite answers do
  // not cover, and away from the ones they do. It is not a punishment for
  // playing well — it is the fight asking you to open the rest of the bag.
  const favourites = favouredAnswers(read).slice(0, 2);
  const covered = new Set(favourites.map((action) => counterFor[action]).filter(Boolean));
  return covered.has(kind) ? 0.5 : 2.2;
}

// The closed set of board conditions an authored `wants` (or the older
// `reactions`) may test. Exported so the validator can reject a condition this
// never learned to answer — an unknown `when` used to fall through to false and
// disable the authoring in silence, which is exactly how `reactions` came to be
// authored and dead in the first place.
export const BOARD_CONDITIONS = Object.freeze([
  'take-loaded', 'low-composure', 'noise', 'silence', 'signal', 'ringing',
]);

export function boardConditionMet(when, threshold, board) {
  switch (when) {
    case 'take-loaded': return !!board.take;
    // GRID units, matching reactionMatches in combat-state.js. A bare 3 was a
    // fifth of composure before the rescale and is a fourteenth of it now, which
    // would have made this reaction all but unreachable.
    case 'low-composure': return board.composure <= (threshold || 3 * GRID);
    case 'noise': return board.snr === 'noise';
    case 'silence': return board.snr === 'silence';
    case 'signal': return board.snr === 'signal';
    case 'ringing': return !!board.ringing;
    default: return false;
  }
}

// The blows a movement MUST throw before it ends, whatever the weights want.
//
// Two things in this fight are load-bearing and would be quietly destroyed by an
// opponent that simply preferred other moves. A recordable broadcast is the
// player's only source of takes — decline to offer one and the recorder branch,
// PLAYBACK, INVERT and the take economy all just stop. And a loop is what the
// chapel's INVERT proofs are earned against; skip it and `route.inversion` is
// locked by nothing more than the opponent's mood. An ending must never be
// closed off because a weighted draw went the other way.
//
// Authored per movement when a fight needs something else guaranteed; derived
// otherwise, so no existing profile has to be touched to be safe.
export function guaranteedIds(movement, intents) {
  if (Array.isArray(movement?.guarantee) && movement.guarantee.length) return movement.guarantee;
  const firstRecordable = intents.find((intent) => intent.recordable);
  return [
    ...(firstRecordable ? [firstRecordable.id] : []),
    ...intents.filter((intent) => intent.invertible).map((intent) => intent.id),
  ];
}

// The opening beat of a movement is always the authored one. Every shipped
// movement opens on a recordable broadcast, so this hands the player a take
// before anything else happens — and it is what lets the bench drill teach
// MONITOR against a broadcast on the beat it says it will.
export function openingIntent(intents, read, cursor) {
  return (read.beats || 0) === 0 ? intents[cursor % intents.length] : null;
}

// A guarantee the movement still owes. Forced rather than weighted, because a
// score can lose and this may not.
//
// Two triggers. The movement is nearly over and the debt is unpaid — last call.
// Or the player has gone DROUGHT beats without a recordable blow to capture,
// which starves the recorder branch: no take means no PLAYBACK, no INVERT, no
// proofs, and a bag that quietly closes down to the torch. The opponent is
// allowed to be cruel; it is not allowed to be boring.
const DROUGHT = 3;

// Has the player gone DROUGHT beats with nothing to capture?
//
// Gated on how many beats have been SEEN, not on how far into this movement we
// are. `read.beats` resets at a phase boundary, which switched the guard off for
// three beats every transition — long enough for a movement to close on two dry
// beats and the next to open on two more.
//
// Exported because the drought is a GUARANTEE, and every path that can decide a
// blow has to respect it — including the authored `reactions` override, which
// lives in combat-state.js and used to win outright.
export function isParched(intents, read) {
  const recent = read?.recent || [];
  return recent.length >= DROUGHT
    && !recent.slice(0, DROUGHT).some((id) => intents.find((intent) => intent.id === id)?.recordable);
}

export function dutyIntent(movement, intents, read, board) {
  // A drought is about the LAST few beats, not about a debt: once the movement
  // has thrown its broadcast one time the debt is paid forever, and an opponent
  // that then never offers another one starves the recorder just as completely.
  const parched = isParched(intents, read);
  if (parched) {
    // The HEAVIEST recordable, not the first. Guaranteeing the take economy
    // means forcing a broadcast every few beats, and broadcasts are the softest
    // blows in every pool — reach for the nearest one each time and the
    // guarantee quietly discounts the whole fight below the pace it was tuned
    // at. Prefer one it has not thrown yet, so the offer also stays varied.
    const recordable = intents.filter((intent) => intent.recordable);
    if (recordable.length) {
      const fresh = recordable.filter((intent) => !(read.thrown || {})[intent.id]);
      const pool = fresh.length ? fresh : recordable;
      return pool.reduce((best, intent) => (
        (Number(intent.damage) || 0) > (Number(best.damage) || 0) ? intent : best
      ), pool[0]);
    }
  }
  // Last call: a guarantee this movement still owes, with the movement nearly
  // over and no more beats to spend putting it off.
  const ratio = board.maxCoherence > 0 ? board.coherence / board.maxCoherence : 1;
  if (ratio > 0.45) return null;
  const owed = guaranteedIds(movement, intents).find((id) => !(read.thrown || {})[id]);
  return owed ? intents.find((intent) => intent.id === owed) || null : null;
}

export function scoreIntent(intent, context) {
  const { stanceId, read, board, movement, difficulty, canAnswer, counterFor } = context;
  let score = appetiteFor(stanceId, intent.kind, read, counterFor);
  score *= Math.max(0.05, Number(intent.weight) || 1);

  // Spread across the pool before repeating: an opponent that finds one good
  // move and throws it eight times is a bug that looks like a strategy.
  if (!(read.thrown || {})[intent.id]) score *= 1.6;
  const recent = read.recent || [];
  if (recent[0] === intent.id) score *= 0.25;
  else if (recent[1] === intent.id) score *= 0.60;
  if (Number(intent.cooldown) > 0 && recent.slice(0, intent.cooldown).includes(intent.id)) score *= 0.2;

  // Authored board reading. `wants` generalises the old `reactions`.
  for (const want of (intent.wants || [])) {
    if (boardConditionMet(want.when, want.threshold, board)) score *= 1 + 0.8 * (Number(want.by) || 1);
  }

  // Never throw a blow the player physically cannot answer. On guided this is
  // absolute; elsewhere it is a heavy thumb on the scale, and dead air barely
  // cares — cornering you is the point of dead air.
  //
  // A blow that cannot hurt anybody is exempt: the source's SILENCE is the
  // opponent catching its breath, authored to have no counter and no damage,
  // and it would be strange to forbid it on the grounds that you cannot stop it.
  if (canAnswer[intent.kind] === false && (Number(intent.damage) || 0) > 0) {
    score *= difficulty?.id === 'guided' ? 0 : difficulty?.id === 'dead-air' ? 0.7 : 0.35;
  }

  // The echo signature carries a +1 into the next beat regardless of what that
  // beat is. Spend it on a 0-damage move and the signature stops being legible.
  if (board.signaturePressure > 0 && !Number(intent.damage)) score *= 0.1;

  // The ensemble stack is a beat the player can hear coming. Meeting it with
  // the heavy thing is the readable, correct instinct.
  if (board.ensembleBeat) score *= 1 + 0.3 * (Number(intent.damage) || 0) / 3;

  // Recovery and take-corruption are the two effects that can end a fight by
  // attrition if thrown freely. Authored caps, enforced here rather than hoped
  // for in the weights.
  const cap = Number(intent.maxPerMovement) || (intent.effect === 'recover' || intent.effect === 'corrupt-take' ? 1 : 0);
  if (cap > 0 && ((read.thrown || {})[intent.id] || 0) >= cap) score *= 0;

  // Pace.
  //
  // Every balance number in the profiles was tuned against the authored cycle,
  // and the cycle deals a known average per beat. A mood is a preference about
  // WHICH KIND of blow to throw — but kinds are not damage-neutral. Broadcasts
  // are the light blow in every pool, so "testing likes broadcasts" quietly
  // also means "testing hits softer", and the fight comes out below the pace it
  // was balanced at without anyone having chosen that.
  //
  // So the mood says what it wants to do and this says how hard, by naming the
  // damage this beat OWES to keep the movement's running average on the cycle's
  // and preferring candidates near it. Behind pace, the heavy blow is pulled
  // forward; ahead of it, the light one. Soft enough that the mood still
  // decides, firm enough that the long run lands on the tuned numbers.
  const worst = (Number(intent.damage) || 0) + (intent.followups || []).reduce((sum, hit) => sum + (Number(hit.damage) || 0), 0);
  if (context.cycleAverage > 0) {
    const owed = context.cycleAverage * ((board.beats || 0) + 1) - (board.dealtThisMovement || 0);
    const slack = Math.max(0.8, context.cycleAverage * 0.9);
    score *= Math.exp(-0.5 * Math.pow((worst - owed) / slack, 2));
  }

  // An authored hard ceiling, for a movement that needs one.
  if (movement.budget > 0 && board.dealtThisMovement + worst > movement.budget) score *= 0;

  return Math.max(0, score);
}

// Pick one, weighted. `pow(score, 1/t)` rather than a softmax because the scores
// are positive and multiplicative — a power-law temperature collapses cleanly to
// argmax as t goes to zero, which is what dead air is.
export function chooseIntent(context) {
  const { intents, cursor, cycleIndex, read, seed, movement, board, pinned } = context;
  if (!intents.length) return null;

  // `cursor` is the committed beat and must agree with whatever the fallback
  // reads, or a caller that moves the cursor by hand gets one intent from the
  // script and a different one from the cycle. `cycleIndex` only ever seeds.
  //
  // The bench drill is pinned outright: its lesson steps are written against the
  // training script beat for beat (tone → print → mask → swell) and wait on
  // specific perfect counters in order. A teaching sequence is the one place an
  // opponent with opinions is simply wrong.
  if (pinned) return intents[cursor % intents.length];
  const opening = openingIntent(intents, read, cursor);
  const owed = dutyIntent(movement, intents, read, board);
  // The authored opening normally wins — but not over a drought.
  //
  // openingIntent's comment says every shipped movement opens on a recordable
  // broadcast, and on the STANDARD scripts that is true. The severe and dead-air
  // scripts are rotations of those arrays, so several of them open on a conceal
  // or an overload; and because the opening used to return before the drought
  // guard was even consulted, a movement could close on two dry beats and the
  // next open on two more. Four beats with nothing to capture is the recorder
  // branch shut down — no take, no PLAYBACK, no INVERT, no proofs.
  if (opening && !(owed?.recordable && !opening.recordable)) return opening;
  if (owed) return owed;

  const temperature = Math.max(0.05, TEMPERATURE[context.difficulty?.id] ?? 0.60);
  const weighted = intents.map((intent) => ({
    intent,
    weight: Math.pow(scoreIntent(intent, context), 1 / temperature),
  }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  // Every candidate scored zero — every one of them would break a cap, a budget
  // or a gate. Fall back to the authored cycle rather than passing the beat;
  // the fight standing still is worse than the fight being slightly off-plan.
  if (!(total > 0)) return intents[cursor % intents.length];

  let roll = unit(seed, 'intent', context.movementIndex, cycleIndex) * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.intent;
  }
  return weighted[weighted.length - 1].intent;
}

// The most plausible wrong answer: the blow that scored highest in this mood
// among the ones the opponent did NOT commit to.
//
// A misread has to be a good guess that happened to be wrong, not a random one.
// Handing the player a uniformly-drawn intent produces a card that reads as
// broken; handing them the second-best answer produces the feeling of having
// been sold something, which is the only version of this worth shipping.
export function plausibleAlternative(context, committed) {
  const others = context.intents.filter((intent) => intent.id !== committed?.id);
  if (!others.length) return null;
  return others.reduce((best, intent) => (
    scoreIntent(intent, context) > scoreIntent(best, context) ? intent : best
  ), others[0]);
}

// ── watching the recordist ──────────────────────────────────────────────────

export function observePlayerBeat(read, { actionId, perfect, kind, takeHeld }) {
  const next = { ...read, answers: { ...read.answers }, landed: { ...read.landed } };
  if (actionId) {
    next.answers[actionId] = (next.answers[actionId] || 0) + 1;
    if (perfect) next.landed[actionId] = (next.landed[actionId] || 0) + 1;
  }
  next.perfectStreak = perfect ? (read.perfectStreak || 0) + 1 : 0;
  next.takeDwell = takeHeld ? (read.takeDwell || 0) + 1 : 0;
  if (kind) next.kinds = { ...(read.kinds || {}), [kind]: ((read.kinds || {})[kind] || 0) + 1 };
  return next;
}

// A blow the player answered perfectly never lands, and the opponent's turn is
// skipped entirely — but it still OFFERED that blow, and it has to remember
// doing so. Without this its memory freezes: nothing enters `recent`, the
// cooldown never sees the move it just played, the never-thrown bonus keeps
// favouring it, and it re-offers the same intent forever. Against a guard that
// fully prevents it, that is a fight that cannot end.
//
// Counting the refusal also tells it something true: it is behind on damage,
// and the pace governor will start reaching for heavier blows. Answer
// everything and it escalates, which is the right thing for it to do.
export const observeRefusal = (read, intentId) => observeEnemyBeat(read, { intentId });

export function observeEnemyBeat(read, { intentId }) {
  return {
    ...read,
    thrown: { ...read.thrown, [intentId]: (read.thrown?.[intentId] || 0) + 1 },
    recent: [intentId, ...(read.recent || [])].slice(0, 4),
    beats: (read.beats || 0) + 1,
  };
}

// A phase break is a new posture, not a new opponent. What it threw and how
// hard it has leaned belong to the movement that just ended; what it has
// learned about the person across from it does not.
export function resetReadForMovement(read) {
  // `recent` deliberately SURVIVES the movement change. Everything else here is
  // about this movement's script — what it has thrown, how far in it is — but
  // `recent` is what the drought guard reads, and the player's take economy does
  // not reset at a phase boundary. Clearing it let a movement open on three more
  // non-recordable beats on top of the ones that closed the last, which is
  // exactly the starvation the guard exists to prevent.
  return { ...read, thrown: {}, recent: [...(read?.recent || [])].slice(0, DROUGHT), beats: 0 };
}

// ── what it remembers of the night ──────────────────────────────────────────
// Compressed to a handful of counts so the run save stays small and a fight can
// open already knowing how this recordist plays. Deliberately NOT routed
// through psychological-profile.js: that module is consent-gated and its header
// promises it never receives input histories, which is exactly what this is.
// This is in-fiction memory, not measurement.

export function carriedRead(read) {
  return {
    answers: { ...(read?.answers || {}) },
    landed: { ...(read?.landed || {}) },
  };
}

export function readFromCarried(carried) {
  const read = emptyEnemyRead();
  if (!carried || typeof carried !== 'object') return read;
  for (const [action, count] of Object.entries(carried.answers || {})) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n) read.answers[action] = Math.min(n, 99);
  }
  for (const [action, count] of Object.entries(carried.landed || {})) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n) read.landed[action] = Math.min(n, 99);
  }
  return read;
}

export function mergeCarriedRead(previous, addition) {
  const merged = carriedRead(readFromCarried(previous));
  const next = carriedRead(readFromCarried(addition));
  for (const bucket of ['answers', 'landed']) {
    for (const [action, count] of Object.entries(next[bucket])) {
      merged[bucket][action] = Math.min(99, (merged[bucket][action] || 0) + count);
    }
  }
  return merged;
}

export { MIN_DWELL, TEMPERATURE, CORNERED_AT };
