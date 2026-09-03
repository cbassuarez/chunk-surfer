// Pure deterministic state for the signal-combat encounters.
//
// Rendering, audio, persistence, and the physical torch battery live outside
// this module. Given the same definition, state, and action, resolution is
// byte-for-byte repeatable.

export const COMBAT_SCHEMA = 2;

export const COMBAT_ACTION = Object.freeze({
  EXPOSE: 'expose',
  MONITOR: 'monitor',
  PLAYBACK: 'playback',
  HOLD: 'hold',
  INVERT: 'invert',
  TUNE: 'tune',
  CHANNEL: 'channel',
  END_TEMPO: 'end-tempo',
  // Point at one Hall apparition. Not a move: it costs no beat and the opponent
  // does not answer it, the same way arming a source channel does not.
  TARGET: 'target',
  // THE PRACTICE WING'S TWO VERBS.
  //
  // LISTEN plays the bar back instead of playing over it. It costs the beat —
  // giving up a repetition is the entire price — and it is the one thing in that
  // room that goes anywhere. PUT IT DOWN is only offered once he has heard what
  // is on the bar, because leaving is the hardest thing this man can do and it
  // has to be paid for with the thing he is worst at.
  LISTEN: 'listen',
  PUT_IT_DOWN: 'put-it-down',
  WHITEOUT: 'whiteout',
  RADIO_DECOY: 'radio-decoy',
  STEADY_HANDS: 'steady-hands',
  // COMPOSE: the baseline heal. No tool, always in the kit (the coffee is
  // optional and often not taken) — yield the beat, breathe, recover composure,
  // once per movement. PARRY: read the incoming blow and turn it back — negate
  // AND reflect coherence damage on a correct read, weak on a mis-read.
  COMPOSE: 'compose',
  PARRY: 'parry',
  // Real-time ranged RETURN. It never appears in the command deck and never
  // advances the turn; fireball-exchange.js earns and fires it through clicks.
  FIREBALL_RETURN: 'fireball-return',
  FIREBALL_IMPACT: 'fireball-impact',
  // Loud once-per-encounter tool specials (model: WHITEOUT). Recorder MASTER TAKE
  // and rig RUNAWAY FEEDBACK are the finishers of their branches.
  MASTER_TAKE: 'master-take',
  RUNAWAY_FEEDBACK: 'runaway-feedback',
  // Yield the beat and face the enemy with no move of your own. The deliberate
  // "do nothing" that only means something once the enemy takes a real turn.
  WAIT: 'wait',
  // THE FLOOR. No tool, no charge, no take, no cooldown, never unavailable: the
  // recordist's own voice thrown at the thing.
  //
  // This exists because of a specific failure. Every other attack in the bag can
  // run out — the torch can be missing, the recorder can be missing, PLAYBACK
  // needs a take, INVERT needs a take AND a loop, every special needs charge —
  // and when they all did, the only legal move left was HOLD. A fight that
  // reduces to bracing until a rescue valve opens is not a fight, and the
  // recovery machinery below (hasImmediateProgress, recoveryHolds, SECOND
  // BREATH) was built to paper over exactly that.
  //
  // With SHOUT in the kit an empty bag is SLOW, never STRANDED. It is deliberately
  // the weakest thing you can do and it counters nothing, so it never competes
  // with a tool that fits the beat — it just means there is always a way forward.
  SHOUT: 'shout',
});

export const COMBAT_TOOL = Object.freeze({
  SELF: 'self',
  TORCH: 'torch',
  RECORDER: 'recorder',
  RIG: 'rig',
  FORK: 'fork',
  RADIO: 'radio',
  COFFEE: 'coffee',
});

export const SNR_STATE = Object.freeze({
  SIGNAL: 'signal',
  NOISE: 'noise',
  SILENCE: 'silence',
});

export const SNR_PROFILE = Object.freeze({
  [SNR_STATE.SIGNAL]: Object.freeze({
    label: 'SIGNAL',
    description: 'Clean captures and stronger monitoring. A missed read lands harder.',
  }),
  [SNR_STATE.NOISE]: Object.freeze({
    label: 'NOISE',
    description: 'Attacks bite harder. Monitoring and defense lose definition.',
  }),
  [SNR_STATE.SILENCE]: Object.freeze({
    label: 'SILENCE',
    description: 'Defense tightens. Outgoing damage loses one point.',
  }),
});

export const INTENT_KIND = Object.freeze({
  BROADCAST: 'broadcast',
  CONCEAL: 'conceal',
  OVERLOAD: 'overload',
  LOOP: 'loop',
  SILENCE: 'silence',
});

export const SOURCE_CHANNEL = Object.freeze({
  RESCUE: 'rescue',
  CONTAIN: 'contain',
  SUBMIT: 'submit',
});

export const TECHNIQUE = Object.freeze({
  AFTERIMAGE: 'torch.afterimage',
  WHITEOUT: 'torch.whiteout',
  OVEREXPOSE: 'torch.overexpose',
  ROOM_TONE: 'recorder.room-tone',
  PUNCH_IN: 'recorder.punch-in',
  MULTITRACK: 'recorder.multitrack',
  OVERDUB: 'rig.overdub',
  FEEDBACK_LOOP: 'rig.feedback-loop',
  TAPE_ECHO: 'rig.tape-echo',
  // Nerve (self): composure & the parry. Fork (attunement): reading & stance.
  // Radio (misdirection): decoy & guard. New branches for the deepened tree.
  STEADY_NERVE: 'nerve.steady',
  RIPOSTE: 'nerve.riposte',
  SECOND_WIND: 'nerve.second-wind',
  PERFECT_PITCH: 'fork.perfect-pitch',
  RESONANCE: 'fork.resonance',
  DEAD_AIR: 'radio.dead-air',
  MISDIRECTION: 'radio.misdirection',
  MASTER_TAKE: 'recorder.master-take',
  RUNAWAY_FEEDBACK: 'rig.runaway-feedback',
  // Flat upgrades: the regulars and the body, buyable in any order.
  HEADROOM: 'nerve.headroom',
  BRACE: 'nerve.brace',
  DEEP_RESERVE: 'nerve.deep-reserve',
});

const ACTION_COUNTER = Object.freeze({
  [COMBAT_ACTION.EXPOSE]: INTENT_KIND.CONCEAL,
  [COMBAT_ACTION.WHITEOUT]: INTENT_KIND.CONCEAL,
  [COMBAT_ACTION.MONITOR]: INTENT_KIND.BROADCAST,
  [COMBAT_ACTION.HOLD]: INTENT_KIND.OVERLOAD,
  [COMBAT_ACTION.INVERT]: INTENT_KIND.LOOP,
  [COMBAT_ACTION.RADIO_DECOY]: INTENT_KIND.BROADCAST,
});

const ACTION_TOOL = Object.freeze({
  [COMBAT_ACTION.HOLD]: COMBAT_TOOL.SELF,
  [COMBAT_ACTION.WAIT]: COMBAT_TOOL.SELF,
  [COMBAT_ACTION.SHOUT]: COMBAT_TOOL.SELF,
  [COMBAT_ACTION.COMPOSE]: COMBAT_TOOL.SELF,
  [COMBAT_ACTION.PARRY]: COMBAT_TOOL.SELF,
  [COMBAT_ACTION.END_TEMPO]: COMBAT_TOOL.SELF,
  [COMBAT_ACTION.EXPOSE]: COMBAT_TOOL.TORCH,
  [COMBAT_ACTION.WHITEOUT]: COMBAT_TOOL.TORCH,
  [COMBAT_ACTION.MONITOR]: COMBAT_TOOL.RECORDER,
  [COMBAT_ACTION.PLAYBACK]: COMBAT_TOOL.RECORDER,
  [COMBAT_ACTION.MASTER_TAKE]: COMBAT_TOOL.RECORDER,
  [COMBAT_ACTION.INVERT]: COMBAT_TOOL.RIG,
  [COMBAT_ACTION.RUNAWAY_FEEDBACK]: COMBAT_TOOL.RIG,
  [COMBAT_ACTION.TUNE]: COMBAT_TOOL.FORK,
  [COMBAT_ACTION.RADIO_DECOY]: COMBAT_TOOL.RADIO,
  [COMBAT_ACTION.STEADY_HANDS]: COMBAT_TOOL.COFFEE,
});

const ACTION_SNR = Object.freeze({
  [COMBAT_ACTION.MONITOR]: SNR_STATE.SIGNAL,
  [COMBAT_ACTION.TUNE]: SNR_STATE.SIGNAL,
  [COMBAT_ACTION.STEADY_HANDS]: SNR_STATE.SIGNAL,
  [COMBAT_ACTION.SHOUT]: SNR_STATE.NOISE,
  [COMBAT_ACTION.EXPOSE]: SNR_STATE.NOISE,
  [COMBAT_ACTION.WHITEOUT]: SNR_STATE.NOISE,
  [COMBAT_ACTION.PLAYBACK]: SNR_STATE.NOISE,
  [COMBAT_ACTION.RADIO_DECOY]: SNR_STATE.NOISE,
  [COMBAT_ACTION.HOLD]: SNR_STATE.SILENCE,
  [COMBAT_ACTION.INVERT]: SNR_STATE.SILENCE,
  [COMBAT_ACTION.COMPOSE]: SNR_STATE.SILENCE,
  [COMBAT_ACTION.PARRY]: SNR_STATE.SILENCE,
  [COMBAT_ACTION.MASTER_TAKE]: SNR_STATE.SIGNAL,
  [COMBAT_ACTION.RUNAWAY_FEEDBACK]: SNR_STATE.SILENCE,
});

// The stance triangle, restated as data for the UI. Every number here must
// agree with outgoingDamage / defensivePrevention / captureDamage and the
// fragile-signal penalty in applyEnemyIntent.
export const SNR_TRIANGLE = Object.freeze({
  [SNR_STATE.SIGNAL]: Object.freeze({
    dmgMod: 0, guardMod: GRID, captureMod: 0, fragile: true,
    blurb: `+${GRID} GUARD · CLEAN CAPTURE · +${GRID} DMG WHEN HIT`,
    dmgShare: 0,
  }),
  [SNR_STATE.NOISE]: Object.freeze({
    dmgMod: GRID, guardMod: -GRID, captureMod: -GRID, fragile: false,
    blurb: `+25% DMG DEALT · -${GRID} GUARD · -${GRID} CAPTURE`,
    dmgShare: 0.25,
  }),
  [SNR_STATE.SILENCE]: Object.freeze({
    dmgMod: -GRID, guardMod: GRID, captureMod: 0, fragile: false,
    blurb: `+${GRID} GUARD · -25% DMG DEALT`,
    dmgShare: -0.25,
  }),
});

export function actionCounterKinds(actionId) {
  const kinds = [];
  if (ACTION_COUNTER[actionId]) kinds.push(ACTION_COUNTER[actionId]);
  if (actionId === COMBAT_ACTION.WHITEOUT) kinds.push(INTENT_KIND.SILENCE);
  // PARRY reads the BLOW — the three intent kinds that actually strike. Reading
  // one right negates and reflects it; a feint (conceal/silence) it cannot turn.
  if (actionId === COMBAT_ACTION.PARRY) kinds.push(INTENT_KIND.BROADCAST, INTENT_KIND.OVERLOAD, INTENT_KIND.LOOP);
  return kinds;
}

const SOURCE_READING = Object.freeze({
  [SOURCE_CHANNEL.RESCUE]: 'BODY BORROWED RETURN',
  [SOURCE_CHANNEL.CONTAIN]: 'RETURN STILL INSIDE',
  [SOURCE_CHANNEL.SUBMIT]: 'SOURCE SURFER',
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(finite(value, fallback));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const unique = (values) => [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value))];
import { readFidelity } from './thought-trace.js';
import {
  EARNED,
  GRID,
  HIT_QUALITY,
  bandFrom,
  bandText,
  makeBand,
  resolveHit,
  shiftBand,
  tightenBand,
} from './combat-damage.js';
import {
  chooseIntent,
  carriedRead,
  emptyEnemyRead,
  isParched,
  plausibleAlternative,
  nextStance,
  observeEnemyBeat,
  observePlayerBeat,
  observeRefusal,
  openingStance,
  readFromCarried,
  resetReadForMovement,
} from './enemy-mind.js';
import {
  activeHallApparition,
  advanceHallEnemyTurn,
  applyHallApparitionAction,
  armNextHallParry,
  beginHallEnemyTurns,
  commitHallApparitionRound,
  createHallApparitions,
  hallApparitionSnapshot,
  hallApparitionView,
  hallApparitionsDefeated,
  hallIntentId,
  hallTargetIds,
  liveHallApparitions,
  moveHallTarget,
  selectHallTarget,
  targetedHallApparition,
} from './hall-apparitions.js';
import {
  createPracticeSession,
  listenPracticeBar,
  playPracticeBar,
  practiceCanStop,
  practiceSnapshot,
  practiceStop,
  windPracticeBack,
} from './practice-room.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const hasTechnique = (state, id) => state.techniques.includes(id);
const currentMovement = (state) => state.definition.movements[state.movementIndex] || null;

function intentsFor(movement, variant) {
  if (!movement) return [];
  if (variant === 'dead-air' && movement.deadAirIntents?.length) return movement.deadAirIntents;
  if (variant === 'severe' && movement.severeIntents?.length) return movement.severeIntents;
  return movement.intents || [];
}

export function currentCombatIntent(state) {
  const intents = intentsFor(currentMovement(state), state.difficulty.variant);
  if (!intents.length) return null;
  // The Hall has three opponents and therefore three committed intents. During
  // selection the card shows the first living apparition due after the player;
  // during the enemy sequence it shows the body whose turn is actually active.
  if (state.apparitions) {
    const id = hallIntentId(state.apparitions);
    const owned = intents.find((intent) => intent.id === id);
    if (owned) return owned;
  }
  // The written commitment is authoritative — but only while it still describes
  // this beat. A caller that moves intentIndex by hand invalidates the note and
  // falls through to the authored cycle, which is what a hand-built state means.
  const committed = state.committed;
  if (committed && committed.index === state.intentIndex) {
    const written = intents.find((intent) => intent.id === committed.id);
    if (written) return written;
  }
  return intents[state.intentIndex % intents.length];
}

// ── the commitment ──────────────────────────────────────────────────────────
// The opponent decides its next blow at the END of the beat before it throws
// one, and the decision is written down. Everything downstream quotes the note
// instead of deciding again: the card the player reads, the strike banner, the
// attack cue, and the reducer that applies the damage.
//
// This is not bookkeeping. selectEnemyIntents runs twice per enemy beat — the
// scene calls it to name the blow, advanceEnemy calls it to resolve one — and
// today those agree only because selection is a pure count over an unchanged
// state. The moment the opponent chooses rather than counts, re-deriving would
// let the banner announce one blow while a different one lands. A written
// commitment makes the two agree by construction rather than by luck.
function commitNextIntent(state) {
  const missedLast = !!state.misread;
  state.committed = null;
  state.misread = null;
  if (state.result || state.phase === 'done') return;
  const movement = currentMovement(state);
  if (!movement) return;
  const intents = intentsFor(movement, state.difficulty.variant);
  if (!intents.length) return;
  const chosen = chooseEnemyIntent(state, movement, intents);
  if (!chosen) return;
  state.committed = { id: chosen.id, index: state.intentIndex };
  maybeMisread(state, movement, intents, chosen, missedLast);
  // The roster is handed the SAME commitment the card is drawn from, so the
  // body that swings first throws the blow the player was shown.
  if (state.apparitions) {
    commitHallApparitionRound(state.apparitions, state.cycleIndex, intents, { committedId: chosen.id });
  }
}

// Whether the recordist reads this one wrong.
//
// The opponent has already committed, honestly, and will throw exactly what it
// committed to. What can fail is the person watching it — and because the card
// has said "i think" since the first beat of the fight, a failure lands as the
// character having been wrong rather than as the game having cheated.
//
// The budget is the whole safety argument, so it is enforced here rather than
// trusted to the odds:
const MISREADS_PER_MOVEMENT = Object.freeze({ chapel: 2, source: 2 });

// How much of the recordist's doubt actually becomes error.
//
// Confidence and correctness are different things, and conflating them was the
// first version's mistake: read fidelity straight off as a miss chance and dead
// air misreads every other beat, which is not a feint, it is an unreliable
// narrator. A person can be unsure and right — usually is — so only a fraction
// of the doubt cashes out as a wrong read.
const MISREAD_SCALE = 0.55;
// And they must be spaced. Back-to-back misses read as a broken card rather
// than as a bad night, so there are always clean beats between them.
//
// Counted in ENEMY BEATS, not in cycleIndex. cycleIndex also advances on TEMPO
// bonus actions, so a gap measured in it can be two wide while the player
// experiences two misreads in a row with nothing between them.
const MISREAD_GAP = 2;

function maybeMisread(state, movement, intents, committed, missedLast) {
  // Never during a lesson. Never on a movement's opening beat, when the player
  // has just been handed new prose and no footing. Never twice running, which
  // is where a wrong read stops being a moment and becomes a broken interface.
  // And never while composure is critical: a misread there is a death spiral,
  // and the fight has better ways to be frightening.
  if (state.definition.pinnedCycle) return;
  // Guided never misreads. It is the preset for a player who wants the story
  // and the safety relay, and handing them a card that can be wrong is exactly
  // the hazard they opted out of. Confidence still varies in the prose; only
  // the error is switched off.
  if (state.difficulty.recommended && integer(state.difficulty.composureBonus, 0) > 0) return;
  if (missedLast) return;
  if (integer(state.read?.beats, 0) === 0) return;
  if (state.composure <= Math.max(2, state.maxComposure * 0.25)) return;
  const since = integer(state.read?.beats, 0) - integer(state.lastMisreadBeat, -99);
  if (since < MISREAD_GAP) return;

  const ceiling = MISREADS_PER_MOVEMENT[state.definition.kind] ?? 1;
  if (integer(state.misreadsThisMovement, 0) >= ceiling) return;

  // The fork buys a true read. A reference pitch is a reference because it does
  // not lie to you.
  if (state.tuneUsedMovement === state.movementIndex) return;

  const fidelity = readFidelity(state);
  if (unitFor(state, 'misread') >= (1 - fidelity) * MISREAD_SCALE) return;

  const context = mindContext(state, movement, intents);
  context.stanceId = state.stance?.id || 'testing';
  const believed = plausibleAlternative(context, committed);
  if (!believed) return;
  state.misread = { id: believed.id, index: state.intentIndex };
  state.misreadsThisMovement = integer(state.misreadsThisMovement, 0) + 1;
  state.lastMisreadBeat = integer(state.read?.beats, 0);
}

// One deterministic 0..1 per beat per purpose. Same FNV-1a walk the rest of the
// game uses for stateless draws, so the night replays unchanged from a reload.
function unitFor(state, purpose) {
  const key = `${state.definition.id}:${state.seed || 0}:${purpose}:${state.movementIndex}:${state.cycleIndex}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0) / 4294967296;
}

// Which kinds of blow the player could actually answer right now. Handed to the
// mind so it can decline to throw something unanswerable — a flat torch should
// not invite an evening of conceals.
//
// Asked against a select-phase copy because the commitment is written from
// inside the enemy beat, when every move is legitimately disabled; the question
// is what the player will be able to do when it is their turn again.
function answerableKinds(state) {
  const asking = { ...state, phase: 'select' };
  const answerable = {};
  for (const [actionId, kind] of Object.entries(ACTION_COUNTER)) {
    if (!answerable[kind]) answerable[kind] = actionAvailability(asking, actionId).enabled;
  }
  // HOLD is in the bag whatever else has run out, and it answers an overload.
  answerable[INTENT_KIND.OVERLOAD] = true;
  return answerable;
}

// Everything the opponent's mind is allowed to know, assembled here so that
// module never reaches into combat state directly.
function mindContext(state, movement, intents) {
  const damages = intents.map((intent) => integer(intent.damage, 0));
  return {
    intents,
    movement,
    movementIndex: state.movementIndex,
    // The beat it is committing to, which is the cursor everything else reads.
    cursor: integer(state.intentIndex, 0),
    // The monotonic beat counter, used only to seed the draw.
    cycleIndex: integer(state.cycleIndex, 0),
    stance: state.stance,
    read: state.read || emptyEnemyRead(),
    difficulty: state.difficulty,
    canAnswer: answerableKinds(state),
    counterFor: ACTION_COUNTER,
    // A teaching sequence is the one place an opponent with opinions is wrong.
    pinned: !!state.definition.pinnedCycle,
    // The authored script's average damage per beat: the pace the fight was
    // balanced at, and the line the governor pulls back toward.
    cycleAverage: damages.length ? damages.reduce((sum, value) => sum + value, 0) / damages.length : 0,
    // Same fight, same choices, every time. Keyed on the encounter rather than
    // on a mutable stream, so a reload plays the night back unchanged.
    seed: `${state.definition.id}:${state.seed || 0}`,
    board: {
      take: !!state.take,
      snr: state.snr,
      ringing: !!state.ringing,
      composure: state.composure,
      maxComposure: state.maxComposure,
      coherence: state.movementCoherence,
      maxCoherence: state.movementMaxCoherence,
      signaturePressure: integer(state.signaturePressure, 0),
      dealtThisMovement: integer(state.movementDamage, 0),
      beats: integer(state.read?.beats, 0),
      ensembleBeat: state.definition.signature?.id === 'ensemble'
        && (state.turnsInMovement + 1) % 3 === 0
        && state.tuneUsedMovement !== state.movementIndex,
    },
  };
}

// The choice. A mood that persists, and a weighted draw inside it — see
// enemy-mind.js for why it is two layers and not one.
//
// Note what moving the decision to commit time costs and buys: the board is read
// a beat earlier, as it stands when the opponent decides rather than after the
// player has moved. It buys the only thing that matters — the card cannot
// promise one blow and deliver another.
function chooseEnemyIntent(state, movement, intents) {
  const context = mindContext(state, movement, intents);
  const stanceId = nextStance(context);
  state.stance = stanceId === state.stance?.id
    ? { id: stanceId, dwell: integer(state.stance?.dwell, 0) }
    : { id: stanceId, dwell: 0 };
  context.stanceId = stanceId;

  // A movement's authored `reactions` are the older, blunter form of the same
  // idea and still win outright when they match: an author saying "when this is
  // true, throw THAT" outranks anything the weights come up with.
  // ...unless the recordist is parched. An authored reaction that fires on a
  // board state the player controls — `take-loaded` is the shipped one — repeats
  // for as long as that state holds, so a recordist who hoards a take locked the
  // natatorium's second movement onto one non-recordable blow forever and the
  // recorder branch closed down completely. The reaction is there to punish
  // hoarding, not to end the take economy.
  const parched = isParched(intents, state.read || emptyEnemyRead());
  for (const reaction of (Array.isArray(movement.reactions) ? movement.reactions : [])) {
    if (!reactionMatches(state, reaction)) continue;
    const override = intents.find((intent) => intent.id === reaction.use);
    if (override && !(parched && !override.recordable)) return override;
  }
  return chooseIntent(context);
}

// ── ground truth, and the read ──────────────────────────────────────────────
// currentCombatIntent is what the opponent WILL throw. predictedCombatIntent is
// what the recordist THINKS it will throw. Keeping these apart is the whole of
// the feint, and the split has to be enforced rather than merely intended:
//
//   currentCombatIntent   — the reducer, and nothing else. It scores the beat.
//   predictedCombatIntent — every single thing the player can see.
//
// Get that backwards anywhere and the misread is worthless, because the command
// band quietly tells the truth: the tile that lights green names the real kind,
// INVERT greying out is a perfect LOOP detector, and SECOND BREATH appearing or
// not is a tell. A lie the interface immediately corrects is not a lie.
//
// Today the read is always right — nothing calls for a wrong one yet — so this
// returns the truth and the split is dormant plumbing. It is written now
// because retrofitting it later means auditing every readout in the fight.
export function predictedCombatIntent(state) {
  const misread = state?.misread;
  if (misread && misread.index === state.intentIndex) {
    const intents = intentsFor(currentMovement(state), state.difficulty.variant);
    const believed = intents.find((intent) => intent.id === misread.id);
    if (believed) return believed;
  }
  return currentCombatIntent(state);
}

// The other thing it might be. The recordist's read is a guess, and a guess
// that cannot name its rival is not a guess — it is a readout with a question
// mark on it. This is the authored cycle's next position, which is the most
// plausible wrong answer there is: the thing the opponent would be doing if it
// were still the metronome it used to be.
export function rivalCombatIntent(state) {
  const intents = intentsFor(currentMovement(state), state.difficulty.variant);
  if (intents.length < 2) return null;
  const believed = predictedCombatIntent(state);
  const rival = intents[(state.intentIndex + 1) % intents.length];
  if (rival && rival.id !== believed?.id) return rival;
  return intents.find((intent) => intent.id !== believed?.id) || null;
}

export function combatIntentLookahead(state) {
  const movement = currentMovement(state);
  const intents = intentsFor(movement, state.difficulty.variant);
  const tuned = state.tuneUsedMovement === state.movementIndex;
  const count = Math.max(tuned ? 2 : 1, integer(state.difficulty.intentLookahead, 1));
  return Array.from({ length: Math.min(count, intents.length) }, (_, offset) => (
    intents[(state.intentIndex + offset) % intents.length]
  ));
}

function combatDifficulty(raw = {}) {
  return {
    id: typeof raw.id === 'string' ? raw.id : 'standard',
    composureBonus: integer(raw.composureBonus, 0),
    // -1..1. Leans the opponent's mood; see enemy-mind.js nextStance.
    pressureBias: Math.max(-1, Math.min(1, finite(raw.pressureBias, 0))),
    // How much the fight talks you through itself: full | trace | tile | none.
    // See COMBAT_GUIDANCE in progression/difficulty-defs.js.
    guidance: ['full', 'trace', 'tile', 'none'].includes(raw.guidance) ? raw.guidance : 'trace',
    holdPrevention: Math.max(0, integer(raw.holdPrevention, 2 * GRID)),
    incomingScale: Math.max(0.1, Math.min(3, finite(raw.incomingScale, 1))),
    intentLookahead: Math.max(1, integer(raw.intentLookahead, 1)),
    recoveryHolds: Math.max(0, integer(raw.recoveryHolds, 1)),
    // How much of an outgoing band the assist hands you for free, how often the
    // opponent slips a committed swing, and how wide the parry window is. See
    // COMBAT_RULES in progression/difficulty-defs.js — these are what make
    // CONTRACT and NIGHT SHIFT different fights rather than different captions.
    bandFloorBonus: Math.max(0, Math.min(1, finite(raw.bandFloorBonus, 0.12))),
    // null / 0 means the opponent never guards. Otherwise: enemy beats between
    // guards, so a lower number is a meaner fight.
    enemyGuardCooldown: Number.isFinite(Number(raw.enemyGuardCooldown)) && Number(raw.enemyGuardCooldown) > 0
      ? Math.max(1, integer(raw.enemyGuardCooldown, 4))
      : null,
    parryWindowScale: Math.max(0.1, finite(raw.parryWindowScale, 1)),
    recommended: raw.recommended !== false,
    safetyRelay: !!raw.safetyRelay,
    variant: ['standard', 'severe', 'dead-air'].includes(raw.variant) ? raw.variant : 'standard',
  };
}

export function validateCombatDefinition(definition) {
  const errors = [];
  if (!definition?.id) errors.push('combat has no id');
  if (!definition?.enemy) errors.push(`${definition?.id || 'combat'} has no enemy`);
  if (!Array.isArray(definition?.movements) || !definition.movements.length) errors.push(`${definition?.id || 'combat'} has no movements`);
  if (definition?.signature && !['echo', 'feedback', 'ensemble', 'contract', 'routing'].includes(definition.signature.id)) {
    errors.push(`${definition?.id || 'combat'} has invalid encounter signature`);
  }
  const music = definition?.music;
  if (music) {
    const validLead = (id) => ['lead-1', 'lead-2', 'lead-3'].includes(id);
    if (!['fixed', 'movement'].includes(music.mode)) errors.push(`${definition?.id || 'combat'} has invalid music mode`);
    if (music.mode === 'fixed' && !validLead(music.lead)) errors.push(`${definition?.id || 'combat'} has invalid fixed music lead`);
    if (music.mode === 'movement') {
      if (!Array.isArray(music.movementLeads) || music.movementLeads.length !== (definition?.movements?.length || 0)) {
        errors.push(`${definition?.id || 'combat'} music must name one lead per movement`);
      } else if (music.movementLeads.some((id) => !validLead(id))) {
        errors.push(`${definition?.id || 'combat'} has invalid movement music lead`);
      }
    }
  }
  const movementIds = new Set();
  for (const movement of definition?.movements || []) {
    if (!movement?.id) errors.push(`${definition.id} has a movement without an id`);
    else if (movementIds.has(movement.id)) errors.push(`${definition.id} repeats movement ${movement.id}`);
    else movementIds.add(movement.id);
    if (integer(movement?.coherence, 0) <= 0) errors.push(`${definition.id}:${movement?.id || '?'} coherence must be positive`);
    for (const [variant, intents] of [
      ['standard', movement?.intents],
      ['severe', movement?.severeIntents],
      ['dead-air', movement?.deadAirIntents],
    ]) {
      if (variant === 'standard' && (!Array.isArray(intents) || !intents.length)) errors.push(`${definition.id}:${movement?.id || '?'} has no intents`);
      for (const intent of intents || []) {
        if (!intent?.id || !intent?.label) errors.push(`${definition.id}:${movement?.id || '?'}:${variant} has an unnamed intent`);
        if (!Object.values(INTENT_KIND).includes(intent?.kind)) errors.push(`${definition.id}:${movement?.id || '?'}:${intent?.id || '?'} has invalid kind`);
        if (finite(intent?.damage, -1) < 0) errors.push(`${definition.id}:${movement?.id || '?'}:${intent?.id || '?'} has negative damage`);
        if (intent?.kind === INTENT_KIND.BROADCAST && !intent.recordable) errors.push(`${definition.id}:${movement?.id || '?'}:${intent?.id || '?'} broadcast is not recordable`);
        if (intent?.kind === INTENT_KIND.LOOP && !intent.invertible) errors.push(`${definition.id}:${movement?.id || '?'}:${intent?.id || '?'} loop is not invertible`);
        // Chained enemy hits are optional, but a named one must be a real intent.
        for (const followup of Array.isArray(intent?.followups) ? intent.followups : []) {
          if (!Object.values(INTENT_KIND).includes(followup?.kind)) errors.push(`${definition.id}:${movement?.id || '?'}:${intent?.id || '?'} followup has invalid kind`);
          if (finite(followup?.damage, -1) < 0) errors.push(`${definition.id}:${movement?.id || '?'}:${intent?.id || '?'} followup has negative damage`);
        }
      }
    }
    // Board-state reactions are optional, but each must point at an intent that
    // exists in this movement's standard script — an override to nowhere would
    // silently fall back and confuse authoring.
    const standardIds = new Set((movement?.intents || []).map((intent) => intent?.id).filter(Boolean));
    for (const reaction of Array.isArray(movement?.reactions) ? movement.reactions : []) {
      if (!standardIds.has(reaction?.use)) errors.push(`${definition.id}:${movement?.id || '?'} reaction points at unknown intent ${reaction?.use || '?'}`);
    }
    // A flat torch and missing rig must never make progress impossible in any
    // selected difficulty script. Missing variants deliberately inherit the
    // standard script.
    for (const [variant, intents] of [
      ['standard', movement?.intents || []],
      ['severe', movement?.severeIntents?.length ? movement.severeIntents : movement?.intents || []],
      ['dead-air', movement?.deadAirIntents?.length ? movement.deadAirIntents : movement?.intents || []],
    ]) {
      if (!intents.some((intent) => intent.kind === INTENT_KIND.BROADCAST && intent.recordable)) {
        errors.push(`${definition.id}:${movement?.id || '?'}:${variant} has no recorder-only damage path`);
        continue;
      }
      const recorderDamage = intents
        .filter((intent) => intent.kind === INTENT_KIND.BROADCAST && intent.recordable)
        .reduce((total, intent) => total + clamp(integer(intent.playbackDamage, intent.damage || 2 * GRID), GRID, 3 * GRID), 0);
      const recovery = intents
        .filter((intent) => intent.effect === 'recover')
        .reduce((total, intent) => total + Math.max(GRID, integer(intent.recover, GRID)), 0);
      if (recorderDamage <= recovery) {
        errors.push(`${definition.id}:${movement?.id || '?'}:${variant} recovery can lock the recorder-only path`);
      }
    }
  }
  return errors;
}

export function createCombatState(definition, {
  difficulty = {},
  injuries = 0,
  // What the night has already taken. Null (or absent) opens at the ceiling,
  // which is what every fight did before composure carried — the bench drill
  // and the god menu still come in that way on purpose.
  composure = null,
  battery = 1,
  torchDrainScale = 1,
  tools = {},
  techniques = [],
  source = null,
  carriedRead = null,
  continuation = null,
  seed = 0,
} = {}) {
  const errors = validateCombatDefinition(definition);
  if (errors.length) throw new Error(`invalid signal combat: ${errors.join('; ')}`);
  const rules = combatDifficulty(difficulty);
  const reserve = unique(techniques).includes(TECHNIQUE.DEEP_RESERVE) ? 2 * GRID : 0;
  const baseComposure = Math.max(1, integer(definition.baseComposure, 8 * GRID) + rules.composureBonus + reserve);
  // AN INJURY IS WORTH A GRID SQUARE, AND ALWAYS WAS.
  //
  // This subtracted a raw integer from a pool that had been multiplied by five
  // and never rescaled with it, so an entire night's injuries cost six points
  // of forty — a rounding error where the design intended a running total. A
  // night that goes badly is supposed to arrive at the chapel smaller than one
  // that does not, and losing a fight now marks you (see openEncounterBattle).
  // The 4*GRID floor is what stops that becoming a spiral: four injuries is
  // half your composure and no further.
  const maxComposure = Math.max(4 * GRID, baseComposure - Math.max(0, integer(injuries, 0)) * GRID);
  const normalizedTechniques = unique(techniques).filter((id) => Object.values(TECHNIQUE).includes(id));
  const roomTone = normalizedTechniques.includes(TECHNIQUE.ROOM_TONE)
    ? { id: 'room-tone', label: 'ROOM TONE', damage: 2 * GRID, tag: 'room' }
    : null;
  const first = definition.movements[0];
  const sourceEnabled = definition.kind === 'source' || !!source;
  const state = {
    schema: COMBAT_SCHEMA,
    definition: clone(definition),
    // 'select' — the player is choosing; 'enemy' — the player has acted and the
    // opponent's turn is pending (resolved by advanceEnemy); 'done' — finished.
    phase: 'select',
    // The player action carried into the enemy turn: how much the enemy hit is
    // blunted, plus the player-beat notice/damage so a full turn can be read
    // back as one result even though it resolves in two steps.
    pendingEnemy: null,
    result: null,
    movementIndex: 0,
    movementCoherence: integer(first.coherence, 1),
    movementMaxCoherence: integer(first.coherence, 1),
    // Two jobs that used to be one. intentIndex names the beat the opponent has
    // COMMITTED to, and `committed` is the note it wrote; cycleIndex is the
    // monotonic beat counter, the place in the authored script the fight would
    // be at if nobody were choosing. They part company the moment they can.
    intentIndex: 0,
    cycleIndex: 0,
    committed: null,
    // What the recordist BELIEVES is committed, when that differs. Null while
    // the read is good; see predictedCombatIntent.
    misread: null,
    // The opponent's posture, and what it has worked out about the person
    // across from it. The read opens from whatever the night has already taught
    // it — see enemy-mind.js, and note it is not the psych profile.
    stance: openingStance(),
    read: readFromCarried(carriedRead),
    misreadsThisMovement: 0,
    lastMisreadBeat: -99,
    // Damage it has dealt in this movement, for the pace governor.
    movementDamage: 0,
    turns: 0,
    turnsInMovement: 0,
    // YOU BRING IN WHAT YOU HAVE LEFT.
    //
    // maxComposure above is the CEILING and still derives from injuries alone.
    // This is where you actually start, which is the carried pool clamped into
    // it. Floor of 1 rather than 0: a fight you cannot take a single beat in is
    // not a fight, and recordist.js already refuses to hand back less than
    // COMPOSURE_FLOOR anyway.
    composure: composure == null ? maxComposure : clamp(integer(composure, maxComposure), 1, maxComposure),
    maxComposure,
    battery: clamp(finite(battery, 1), 0, 1),
    torchDrainScale: Math.max(0, finite(torchDrainScale, 1)),
    torchSpent: 0,
    tools: {
      torch: tools.torch !== false,
      recorder: tools.recorder !== false,
      rig: !!tools.rig,
      fork: !!tools.fork,
      radio: !!tools.radio,
      coffee: !!tools.coffee,
      order: unique(tools.order).filter((id) => Object.values(COMBAT_TOOL).includes(id) && id !== COMBAT_TOOL.SELF),
    },
    injuries: Math.max(0, integer(injuries, 0)),
    techniques: normalizedTechniques,
    take: roomTone,
    exposedBonus: 0,
    ringing: false,
    snr: SNR_STATE.SIGNAL,
    tempo: false,
    tuneUsedMovement: null,
    tuneBonus: 0,
    // Earned by reading the opponent right; spent on specials. See CHARGE_COST.
    // Opens on one, so the cheap utility special — the radio's thrown voice — is
    // in reach from the first beat and the loud ones have to be earned.
    charge: 1,
    maxCharge: BASE_MAX_CHARGE + (normalizedTechniques.includes(TECHNIQUE.HEADROOM) ? 2 : 0),
    feedbackLoopUsed: false,
    feedbackMovements: [],
    coffeeUsed: false,
    signaturePressure: 0,
    punchInMovements: [],
    overdubMovements: [],
    composeMovements: [],
    // If the loadout cannot attack or capture this beat, HOLD can recover the
    // player's baseline SECOND BREATH. The unlock is encounter-wide: Contract
    // gets the intended bad beat once, rather than every time a tool runs dry.
    recoveryHolds: 0,
    recoveryUnlocked: rules.recoveryHolds === 0,
    perfectCounters: 0,
    missedCounters: 0,
    damageTaken: 0,
    safetyRelayUsed: false,
    toolsUsed: {},
    proofs: [],
    actionLog: [],
    last: { notice: first.title || first.id, transition: null, action: null, perfect: false },
    difficulty: rules,
    seed: integer(seed, 0),
    // The surfer's own defence. On the meaner difficulties it reads a committed
    // swing coming and sets to slip it — a dodge eats the hit, a parry eats it and
    // nicks your composure. Armed on the enemy beat (telegraphed), spent on your
    // next swing. null when it is not guarding. (See advanceEnemy + reduceCombat.)
    enemyGuard: null,
    // The beat the last guard was set on, so the cooldown is measurable.
    lastGuardBeat: -999,
    // The stance the current beat was entered in, so a move can be credited for
    // the stance it was PLANNED from rather than the one it creates. Written by
    // reduceCombat, read by earnedFloor.
    snrBefore: SNR_STATE.SIGNAL,
    // RUNAWAY FEEDBACK deafens the room for one beat; THROW VOICE makes it decide
    // again. Both are consumed by advanceEnemy, which is where the enemy turn is.
    skipEnemyBeat: false,
    recommitted: false,
    // Three individual Hall opponents. These are combat entities rendered
    // inside the battle scene; the emergency-light apparition director remains
    // presentation-only and still never receives player coordinates.
    apparitions: definition.apparitions
      ? createHallApparitions({ seed: `${definition.id || 'hall'}:${integer(seed, 0)}`, ...definition.apparitions })
      : null,
    // The practice wing. Like `apparitions`, absent for every other encounter,
    // and every path behaves exactly as it did when it is null. Unlike the Hall
    // describes no adversary — there is nobody in that room. See practice-room.js.
    practice: definition.practice
      ? createPracticeSession({ seed: `${definition.id || 'practice'}:${integer(seed, 0)}`, ...definition.practice })
      : null,
    source: sourceEnabled ? {
      enabled: true,
      armed: Object.values(SOURCE_CHANNEL).includes(source?.armed) ? source.armed : SOURCE_CHANNEL.RESCUE,
      channels: {
        [SOURCE_CHANNEL.RESCUE]: Math.max(0, integer(source?.channels?.rescue, 0)),
        [SOURCE_CHANNEL.CONTAIN]: Math.max(0, integer(source?.channels?.contain, 0)),
        [SOURCE_CHANNEL.SUBMIT]: Math.max(0, integer(source?.channels?.submit, 0)),
      },
      rescueEligible: !!source?.rescueEligible,
    } : null,
  };
  // A staged encounter may change opponent and authored movements without
  // giving the recordist a fresh body or a fresh belt of actions. This is a
  // continuation snapshot, not general save-state restoration: it is produced
  // only by finishCombat and consumed immediately by the next stage.
  if(continuation&&typeof continuation==='object'&&!Array.isArray(continuation)){
    state.composure=clamp(integer(continuation.composure,state.composure),1,state.maxComposure);
    state.charge=clamp(integer(continuation.charge,state.charge),0,state.maxCharge);
    state.battery=clamp(finite(continuation.battery,state.battery),0,1);
    state.take=continuation.take&&typeof continuation.take==='object'?clone(continuation.take):null;
    state.snr=Object.values(SNR_STATE).includes(continuation.snr)?continuation.snr:state.snr;
    state.ringing=!!continuation.ringing;
    state.turns=Math.max(0,integer(continuation.turns,0));
    state.perfectCounters=Math.max(0,integer(continuation.perfectCounters,0));
    state.missedCounters=Math.max(0,integer(continuation.missedCounters,0));
    state.damageTaken=Math.max(0,integer(continuation.damageTaken,0));
    state.torchSpent=Math.max(0,finite(continuation.torchSpent,0));
    state.toolsUsed=continuation.toolsUsed&&typeof continuation.toolsUsed==='object'?{...continuation.toolsUsed}:{};
    state.proofs=unique(continuation.proofs);
    state.actionLog=Array.isArray(continuation.actionLog)?continuation.actionLog.map((entry)=>clone(entry)):[];
    state.coffeeUsed=!!continuation.coffeeUsed;
    state.safetyRelayUsed=!!continuation.safetyRelayUsed;
    state.feedbackLoopUsed=!!continuation.feedbackLoopUsed;
    state.feedbackMovements=unique(continuation.feedbackMovements);
    state.punchInMovements=unique(continuation.punchInMovements);
    state.overdubMovements=unique(continuation.overdubMovements);
    state.composeMovements=unique(continuation.composeMovements);
    state.recoveryHolds=Math.max(0,integer(continuation.recoveryHolds,0));
    state.recoveryUnlocked=!!continuation.recoveryUnlocked;
    state.signaturePressure=Math.max(0,integer(continuation.signaturePressure,0));
  }
  // The opponent is already decided before the player has done anything. The
  // first card is a real commitment, not a placeholder read off the script.
  commitNextIntent(state);
  return state;
}

function predictedSourceOutcome(source) {
  if (!source) return null;
  const high = Math.max(...Object.values(source.channels));
  const tied = Object.values(SOURCE_CHANNEL).filter((id) => source.channels[id] === high);
  return tied.includes(source.armed) ? source.armed : tied[0];
}

export function combatPrediction(state) {
  return {
    outcome: predictedSourceOutcome(state.source),
    sourceReading: state.source ? SOURCE_READING[predictedSourceOutcome(state.source)] : null,
  };
}

function toolCount(state, id) {
  state.toolsUsed[id] = Math.max(0, integer(state.toolsUsed[id], 0)) + 1;
}

function addProof(state, id) {
  if (id && !state.proofs.includes(id)) state.proofs.push(id);
}

function addSourcePoint(state, amount = 1) {
  if (!state.source) return;
  state.source.channels[state.source.armed] += Math.max(0, integer(amount, 0));
}

function advanceIntent(state) {
  state.intentIndex += 1;
  state.cycleIndex += 1;
  state.turns += 1;
  state.turnsInMovement += 1;
  state.tempo = false;
  // The one seam where the opponent decides. Every path that ends a beat comes
  // through here, so there is exactly one place a choice is ever made.
  commitNextIntent(state);
}

function finishCombat(state, result) {
  state.phase = 'done';
  // Nothing is coming. Both win and loss reach here through advanceIntent,
  // which will have written a commitment for a beat that will never be thrown.
  state.committed = null;
  const sourceOutcome = state.source ? predictedSourceOutcome(state.source) : null;
  const returnProof = state.proofs.includes('return.recordist') && state.proofs.includes('return.source');
  const inversionProof = state.tools.rig && state.proofs.includes('invert.contract') && state.proofs.includes('invert.source');
  const grants = [
    ...(returnProof ? ['route.surfaced'] : []),
    ...(inversionProof ? ['route.inversion'] : []),
    ...(state.proofs.includes('return.recordist') ? ['finale.knowsConsent'] : []),
    ...(state.proofs.includes('invert.contract') ? ['finale.knowsContract'] : []),
  ];
  const locks = [
    ...(!returnProof ? ['route.surfaced'] : []),
    ...(!inversionProof ? ['route.inversion'] : []),
  ];
  const sourceReading = state.proofs.includes('return.source')
    ? { readingId: 'combat:return-source', meaning: 'The borrowed body remains returnable.', text: 'BODY BORROWED RETURN' }
    : state.proofs.includes('invert.source')
      ? { readingId: 'combat:invert-source', meaning: 'The signal can be run backwards.', text: 'SIGNAL PROCESS RELEASE' }
      : { readingId: 'combat:source-you', meaning: 'You leave yourself as the source.', text: 'SOURCE IS YOU' };
  state.result = {
    result,
    won: result === 'win',
    turns: state.turns,
    composure: state.composure,
    maxComposure: state.maxComposure,
    perfectCounters: state.perfectCounters,
    missedCounters: state.missedCounters,
    damageTaken: state.damageTaken,
    snr: state.snr,
    injuries: state.injuries,
    signature: state.definition.signature || null,
    torchSpent: state.torchSpent,
    techniques: [...state.techniques],
    toolsUsed: { ...state.toolsUsed },
    proofs: [...state.proofs],
    // What the thing across from you worked out about how you play. Carried
    // into the run so the next encounter — and the chapel especially — opens
    // already knowing you. See enemy-mind.js.
    enemyRead: carriedRead(state.read),
    source: state.source ? {
      outcome: sourceOutcome,
      channels: { ...state.source.channels },
      rescuedRecordist: result === 'win' && sourceOutcome === SOURCE_CHANNEL.RESCUE && state.source.rescueEligible,
      sourceReading: SOURCE_READING[sourceOutcome],
    } : null,
    finale: {
      readings: state.definition.kind === 'chapel' ? state.proofs.map((id) => ({ readingId: id, meaning: id.replaceAll('.', ' '), text: id.toUpperCase().replaceAll('.', ' ') })) : [],
      grants,
      locks,
      routeBiases: [
        ...(returnProof ? ['surfaced'] : []),
        ...(inversionProof ? ['inversion'] : []),
      ],
      composure: state.composure,
      sourceReading,
      pressure: state.damageTaken + state.missedCounters,
      proofs: [...state.proofs],
    },
    continuation: {
      composure: state.composure,
      charge: state.charge,
      battery: state.battery,
      take: state.take ? clone(state.take) : null,
      snr: state.snr,
      ringing: state.ringing,
      turns: state.turns,
      perfectCounters: state.perfectCounters,
      missedCounters: state.missedCounters,
      damageTaken: state.damageTaken,
      torchSpent: state.torchSpent,
      toolsUsed: { ...state.toolsUsed },
      proofs: [...state.proofs],
      actionLog: state.actionLog.map((entry)=>clone(entry)),
      coffeeUsed: state.coffeeUsed,
      safetyRelayUsed: state.safetyRelayUsed,
      feedbackLoopUsed: state.feedbackLoopUsed,
      feedbackMovements: [...state.feedbackMovements],
      punchInMovements: [...state.punchInMovements],
      overdubMovements: [...state.overdubMovements],
      composeMovements: [...state.composeMovements],
      recoveryHolds: state.recoveryHolds,
      recoveryUnlocked: state.recoveryUnlocked,
      signaturePressure: state.signaturePressure,
    },
  };
}

// Scene-authored fights occasionally have an end condition outside coherence
// damage (the bench drill finishes when its lesson sequence is complete). Keep
// those exits on the same immutable result contract as an ordinary knockout so
// dialogue, cleanup, metrics and callbacks cannot diverge.
export function resolveCombatResult(input, result = 'win') {
  const state = clone(input);
  if (state.result || state.phase === 'done') return state;
  finishCombat(state, result === 'lose' ? 'lose' : 'win');
  return state;
}

function completeMovement(state) {
  const finishedIndex = state.movementIndex;
  if (state.source) addSourcePoint(state, 1);
  if (finishedIndex >= state.definition.movements.length - 1) {
    // The final Hall movement is not a surrogate enemy health bar. If any of
    // the three bodies remains, the last movement repeats until the targeted
    // entities themselves have been defeated.
    if (state.apparitions && !hallApparitionsDefeated(state.apparitions)) {
      state.movementCoherence = integer(currentMovement(state)?.coherence, 1);
      state.movementMaxCoherence = state.movementCoherence;
      state.intentIndex = 0;
      state.cycleIndex += 1;
      state.turns += 1;
      state.turnsInMovement = 0;
      state.movementDamage = 0;
      state.misread = null;
      commitNextIntent(state);
      state.last.transition = { from: finishedIndex, to: finishedIndex };
      state.last.notice += ' · THE THREE REMAIN';
      return;
    }
    // THE WING DOES NOT END. HE DOES.
    //
    // Everywhere else the last movement is the last thing and finishing it wins.
    // There is nothing in the practice room to finish: the three movements are
    // TAKE IT FROM THE TOP, AGAIN FROM THE TOP, and AND AGAIN, and AND AGAIN is
    // where a man stays. So the arc loops on its final movement and the only
    // ways out are the two he has to choose — he puts it down, or he does not
    // and the repetition takes him.
    if (state.practice && !state.practice.stopped) {
      state.movementCoherence = integer(currentMovement(state)?.coherence, 1);
      state.movementMaxCoherence = state.movementCoherence;
      state.intentIndex = 0;
      state.cycleIndex = 0;
      state.turns += 1;
      state.turnsInMovement = 0;
      state.movementDamage = 0;
      state.misread = null;
      state.misreadsThisMovement = 0;
      // IT SHOWS WHAT IT THROWS, even here. Resetting the cycle without
      // re-committing left the card promising the intent from before the loop
      // while a different one landed — the one contract the fight may never
      // break, and the one enemy-intent.spec exists to catch.
      commitNextIntent(state);
      state.last.transition = { from: finishedIndex, to: finishedIndex };
      state.last.notice += ' · AND AGAIN';
      return;
    }
    advanceIntent(state);
    finishCombat(state, 'win');
    state.last.transition = { from: finishedIndex, to: null };
    return;
  }
  state.movementIndex += 1;
  const movement = currentMovement(state);
  state.movementCoherence = integer(movement.coherence, 1);
  state.movementMaxCoherence = integer(movement.coherence, 1);
  state.intentIndex = 0;
  state.cycleIndex = 0;
  state.turns += 1;
  state.turnsInMovement = 0;
  state.tempo = false;
  state.exposedBonus = 0;
  state.ringing = false;
  state.signaturePressure = 0;
  state.tuneBonus = 0;
  state.movementDamage = 0;
  state.misread = null;
  state.misreadsThisMovement = 0;
  state.lastMisreadBeat = -99;
  // A new phase is a new posture. What it threw and how hard it leaned belong to
  // the movement that just ended; what it has learned about the person across
  // from it does not.
  state.stance = openingStance();
  state.read = resetReadForMovement(state.read || emptyEnemyRead());
  commitNextIntent(state);
  state.last.transition = { from: finishedIndex, to: state.movementIndex };
}

// Composure, and the one rule that ever stands between the player and zero.
// Returns whether the relay was what saved them, because the caller owns the
// wording of the line that says so.
function applyDamageToPlayer(state, damage) {
  const amount = Math.max(0, integer(damage, 0));
  if (amount <= 0) return false;
  if (state.difficulty.safetyRelay && !state.safetyRelayUsed && amount >= state.composure) {
    state.damageTaken += Math.max(0, state.composure - GRID);
    state.composure = GRID;
    state.safetyRelayUsed = true;
    return true;
  }
  state.composure = Math.max(0, state.composure - amount);
  state.damageTaken += amount;
  return false;
}

export function hallSpecialTargetCap(state, actionId) {
  if (!state?.apparitions) return 1;
  if (actionId === COMBAT_ACTION.WHITEOUT) return hasTechnique(state, TECHNIQUE.OVEREXPOSE) ? 3 : 2;
  if (actionId === COMBAT_ACTION.MASTER_TAKE) return hasTechnique(state, TECHNIQUE.MULTITRACK) ? 3 : 2;
  if (actionId === COMBAT_ACTION.RUNAWAY_FEEDBACK) return hasTechnique(state, TECHNIQUE.FEEDBACK_LOOP) ? 3 : 2;
  if (actionId === COMBAT_ACTION.RADIO_DECOY) {
    if (hasTechnique(state, TECHNIQUE.DEAD_AIR)) return 3;
    if (hasTechnique(state, TECHNIQUE.MISDIRECTION)) return 2;
  }
  return 1;
}

export function combatApparitionTargetIds(state, actionId = null) {
  return state?.apparitions ? hallTargetIds(state.apparitions, hallSpecialTargetCap(state, actionId)) : [];
}

// One choke point for outgoing damage. In the Hall the same resolved band is
// applied to every member in the selected scope, and only damage that reaches a
// body reduces the movement gauge. A telegraphed parry can therefore stop the
// blow or, rarely and deterministically, redirect it into another apparition.
function applyDamageToEnemy(state, amount, actionId = null) {
  const damage = Math.max(0, integer(amount, 0));
  if (state.apparitions && damage > 0) {
    const result = applyHallApparitionAction(state.apparitions, {
      actionId,
      targetIds: combatApparitionTargetIds(state, actionId),
      damage,
    });
    state.movementCoherence = Math.max(0, state.movementCoherence - result.dealt);
    const prior = state.last?.apparitions || null;
    state.last = {
      ...(state.last || {}),
      apparitions: prior ? {
        targets: [...new Set([...(prior.targets || []), ...result.targets])],
        damaged: [...(prior.damaged || []), ...result.damaged],
        defeated: [...new Set([...(prior.defeated || []), ...result.defeated])],
        parried: [...new Set([...(prior.parried || []), ...result.parried])],
        redirects: [...(prior.redirects || []), ...result.redirects],
        dealt: (prior.dealt || 0) + result.dealt,
      } : result,
    };
    return result.dealt;
  }
  state.movementCoherence = Math.max(0, state.movementCoherence - damage);
  return damage;
}

function shiftSnr(state, actionId) {
  const next = ACTION_SNR[actionId] || state.snr;
  const previous = state.snr;
  state.snr = next;
  return { from: previous, to: next, changed: previous !== next };
}

// ── outgoing damage, as a band ──────────────────────────────────────────────
// Every attack is a RANGE now, and where inside the range a blow lands is
// earned. The arithmetic lives in combat-damage.js; this section is the bridge
// between it and the board — what each move's band is, what about the current
// beat lifts its floor, and where the deterministic draw comes from.
//
// The tiles show the band and the popup shows the tier, so the player's question
// is answerable without a single exact number being promised: "I don't know what
// this will do, but I know it hits harder than my regular, and I know reading
// the beat right will push it up."

// The fixed bands. Derived bands (PLAYBACK off its take, INVERT off the blow it
// turns, MONITOR off its chip) are built with bandFrom at the call site,
// because their centre is board state rather than a constant.
export const ACTION_BAND = Object.freeze({
  // The floor: always available, always the weakest thing in the bag. Half a
  // torch swing, so reaching for it is never the best answer and never no answer.
  [COMBAT_ACTION.SHOUT]: bandFrom(GRID),
  // The workhorse. Two of these is most of a phase, which is the pace the whole
  // fight was authored at.
  [COMBAT_ACTION.EXPOSE]: bandFrom(2 * GRID),
  // The specials sit close together on purpose. They used to be 4 / 6 / 7 — three
  // sizes of the same hammer — and the only question a player could ask was
  // which number was biggest. They are separated by what they DO now (see the
  // reducer), so their damage is allowed to be comparable.
  [COMBAT_ACTION.WHITEOUT]: bandFrom(4 * GRID),
  [COMBAT_ACTION.MASTER_TAKE]: bandFrom(4.4 * GRID),
  [COMBAT_ACTION.RUNAWAY_FEEDBACK]: bandFrom(4.8 * GRID),
});

// Stance moves the whole band rather than the finished number, so what the tile
// promises is the range that is actually rolled.
//
// The shift is PROPORTIONAL, not flat. A flat point was fine when every attack
// dealt 2 and it was worth half of one; on the current grid a flat GRID would be
// a quarter of a torch swing and the whole of a monitor chip, so SILENCE would
// erase the recorder's chip entirely while barely troubling the torch. A quarter
// of the blow means stance is worth the same to every move that uses it.
export const STANCE_SHARE = 0.25;

function stanceDamageShift(state, band) {
  const mid = (Math.max(0, band?.min || 0) + Math.max(0, band?.max || 0)) / 2;
  if (mid <= 0) return 0;
  const step = Math.max(1, Math.round(mid * STANCE_SHARE));
  if (state.snr === SNR_STATE.NOISE) return step;
  if (state.snr === SNR_STATE.SILENCE) return -step;
  return 0;
}

export function outgoingBand(state, band) {
  const source = makeBand(band?.min, band?.max);
  if (source.max <= 0) return makeBand(0, 0);
  const shifted = shiftBand(source, stanceDamageShift(state, source));
  // A blow that exists never rounds away to nothing.
  return makeBand(Math.max(1, shifted.min), Math.max(1, shifted.max));
}

// What about THIS beat lifts the floor. Every term is a skill the fight already
// asks for; none of them is a purchase or a die.
function earnedFloor(state, actionId, { perfect = false, setup = false } = {}) {
  let earned = Math.max(0, finite(state.difficulty?.bandFloorBonus, 0));
  if (perfect) earned += EARNED.PERFECT_COUNTER;
  // Acting from the stance the move belongs in. Read off the pre-shift stance:
  // shiftSnr has usually already moved it, and rewarding a move for the stance
  // it puts you in rather than the one you brought would reward nothing.
  if (state.snrBefore && ACTION_SNR[actionId] === state.snrBefore) earned += EARNED.STANCE_ALIGNED;
  if (state.tuneUsedMovement === state.movementIndex) earned += EARNED.TUNE_HELD;
  if (setup) earned += EARNED.SETUP;
  return Math.max(0, Math.min(1, earned));
}

// Roll a band and put it on the board. The single door every point of outgoing
// damage goes through, so the quality tier can never be missing from a hit.
function strike(state, band, actionId, options = {}) {
  const rolled = outgoingBand(state, band);
  const hit = resolveHit(rolled, {
    earned: earnedFloor(state, actionId, options),
    draw: unitFor(state, `hit:${actionId}`),
  });
  const dealt = applyDamageToEnemy(state, hit.value, actionId);
  state.last.quality = dealt > 0 ? hit.quality : HIT_QUALITY.MISS;
  state.last.band = rolled;
  return dealt;
}

function defensivePrevention(state, amount) {
  const base = Math.max(0, integer(amount, 0));
  if (state.snr === SNR_STATE.SIGNAL) return base + GRID;
  if (state.snr === SNR_STATE.NOISE) return Math.max(0, base - GRID);
  if (state.snr === SNR_STATE.SILENCE) return base + GRID;
  return base;
}

// The baseline COMPOSE heal and the PARRY reflect, each strengthened by the nerve
// discipline branch. Kept as one source so the move detail, the subtext, and the
// reducer can never disagree about the number.
function composeHeal(state) {
  return 2 * GRID + (hasTechnique(state, TECHNIQUE.STEADY_NERVE) ? GRID : 0);
}
// BRACE (flat) puts another point behind the hands. Shared so the tile readout
// and the reducer cannot drift.
function holdPrevention(state) {
  return integer(state.difficulty.holdPrevention, 2 * GRID) + (hasTechnique(state, TECHNIQUE.BRACE) ? GRID : 0);
}

// ── the parry, graded ───────────────────────────────────────────────────────
// It used to be one binary: land the window and you turned the whole blow and
// sent it back, miss it and you got NOTHING TO TURN. A timed input with a cliff
// at both ends teaches players not to attempt it, which is the opposite of what
// a parry is for. Three grades means reaching for it is always worth something
// and only the top of the window pays for everything.
export const PARRY_TIER = Object.freeze({ LATE: 'late', GOOD: 'good', PERFECT: 'perfect' });
export const PARRY_TIERS = Object.freeze({
  [PARRY_TIER.LATE]: Object.freeze({ label: 'LATE PARRY', restore: 0.5, reflect: 0, charge: 0 }),
  [PARRY_TIER.GOOD]: Object.freeze({ label: 'PARRY', restore: 1, reflect: 0.5, charge: 0 }),
  [PARRY_TIER.PERFECT]: Object.freeze({ label: 'PERFECT PARRY', restore: 1, reflect: 1, charge: 1 }),
});

function parryReflect(state) {
  return 2 * GRID + (hasTechnique(state, TECHNIQUE.RIPOSTE) ? 2 * GRID : 0);
}

// RETURN is a ranged side-channel, not a disguised PARRY. It applies coherence
// damage immediately without selecting a move, consuming charge from the
// ordinary kit, changing stance or advancing the enemy clock. Nonlethal hits
// deliberately preserve `last`, because an ordinary beat may be resolving at
// the same time and still owns its impact bookkeeping.
export function applyFireballReturn(input,{damage=2*GRID,castId='',casterId=null}={}){
  const state=clone(input);
  if(state.result||state.phase==='done')return state;
  const priorLast=clone(state.last||{});
  const coherenceFrom=state.movementCoherence;
  state.last={...priorLast,perfect:true,transition:null};
  const priorTarget=state.apparitions?.target;
  if(state.apparitions&&casterId)selectHallTarget(state.apparitions,casterId);
  const dealt=applyDamageToEnemy(state,Math.max(1,integer(damage,2*GRID)),COMBAT_ACTION.FIREBALL_RETURN);
  if(state.apparitions&&Number.isInteger(priorTarget)){
    state.apparitions.target=priorTarget;
    if(targetedHallApparition(state.apparitions)?.health<=0)moveHallTarget(state.apparitions,1);
  }
  const event={castId:String(castId||''),casterId:casterId?String(casterId):null,dealt,coherenceFrom,coherenceTo:state.movementCoherence};
  state.fireballReturn=event;
  state.actionLog.push({
    turn:state.turns,movement:currentMovement(state)?.id||null,
    action:COMBAT_ACTION.FIREBALL_RETURN,perfect:true,bonus:true,dealt,received:0,
  });
  if(state.apparitions&&hallApparitionsDefeated(state.apparitions)){
    state.last={...state.last,notice:`RETURN · ${dealt} RANGED · ALL THREE APPARITIONS RELEASED`,action:COMBAT_ACTION.FIREBALL_RETURN,dealt,received:0};
    finishCombat(state,'win');
    state.last.fireballReturn=event;
  }else if(state.movementCoherence<=0){
    state.last={...state.last,notice:`RETURN · ${dealt} RANGED`,action:COMBAT_ACTION.FIREBALL_RETURN,dealt,received:0};
    completeMovement(state);
    state.last.fireballReturn=event;
  }else{
    state.last=priorLast;
  }
  return state;
}

// A FIREBALL NOBODY TOUCHED LANDS.
//
// The ranged exchange had no losing side. An uncontested comet reached the end
// of its flight, logged itself as `missed`, and cost exactly nothing — so three
// clicks bought a RETURN worth ten and ignoring the thing entirely was free,
// which makes the clicking optional and the whole beat decorative. It is a
// projectile. If you let it through, it hits you.
//
// Charged against composure like an ordinary blow, including the safety relay,
// but outside the turn: it consumes no move, advances no clock, and — like the
// RETURN it mirrors — leaves `last` alone unless it is the blow that ends the
// fragment, because an ordinary beat may be resolving at the same moment and
// still owns its own bookkeeping.
export function applyFireballImpact(input,{damage=GRID,castId=''}={}){
  const state=clone(input);
  if(state.result||state.phase==='done')return state;
  const priorLast=clone(state.last||{});
  const composureFrom=state.composure;
  const relay=applyDamageToPlayer(state,Math.max(1,integer(damage,GRID)));
  const received=Math.max(0,composureFrom-state.composure);
  const event={castId:String(castId||''),received,relay};
  state.fireballImpact=event;
  state.actionLog.push({
    turn:state.turns,movement:currentMovement(state)?.id||null,
    action:COMBAT_ACTION.FIREBALL_IMPACT,perfect:false,bonus:false,dealt:0,received,
  });
  if(state.composure<=0){
    state.last={...priorLast,notice:`RANGED · ${received} · COMPOSURE LOST`,action:COMBAT_ACTION.FIREBALL_IMPACT,dealt:0,received,fireballImpact:event};
    finishCombat(state,'lose');
  }else state.last=priorLast;
  return state;
}

// ── charge ──────────────────────────────────────────────────────────────────
// Specials used to be one apiece per encounter, and worse, all three shared a
// single lock: three pins into three specials still bought one use. That made
// them a moment rather than a rhythm, and it pushed every fight onto resources
// that ran out — which is why the opponent had to be tuned soft enough to beat
// with an empty bag, which is why a full bag walked through it.
//
// Charge replaces all of that. Regulars are free and unlimited; specials cost
// charge; charge is earned by reading the opponent correctly. Play well and you
// get to be loud, repeatedly. Play badly and you still have every regular in
// the bag, so you are never disarmed — only slower.
export const CHARGE_COST = Object.freeze({
  [COMBAT_ACTION.RADIO_DECOY]: 1,
  [COMBAT_ACTION.WHITEOUT]: 2,
  [COMBAT_ACTION.MASTER_TAKE]: 2,
  [COMBAT_ACTION.RUNAWAY_FEEDBACK]: 3,
});
export const BASE_MAX_CHARGE = 3;

export const chargeCost = (actionId) => CHARGE_COST[actionId] || 0;

function earnCharge(state, amount = 1) {
  const before = integer(state.charge, 0);
  state.charge = Math.min(integer(state.maxCharge, BASE_MAX_CHARGE), before + Math.max(0, integer(amount, 0)));
  return state.charge - before;
}

function spendCharge(state, actionId) {
  state.charge = Math.max(0, integer(state.charge, 0) - chargeCost(actionId));
}

// What MONITOR takes off the opponent just for listening closely. PUNCH IN
// doubles it. Kept here so the tile readout and the reducer cannot disagree.
function monitorChip(state) {
  return GRID + (hasTechnique(state, TECHNIQUE.PUNCH_IN) ? GRID : 0);
}

function captureDamage(state, amount) {
  const base = clamp(integer(amount, GRID), GRID, 4 * GRID);
  if (state.snr === SNR_STATE.NOISE) return Math.max(1, base - GRID);
  return base;
}

// SHOUT is deliberately NOT in this list, even though it is always enabled and
// always deals damage. The question this predicate asks is "does the bag have a
// real route right now", and the answer when the only thing left is your own
// voice is no. Counting it would make the predicate permanently true and quietly
// delete SECOND BREATH.
//
// What HAS changed is the stakes of a no. Being stranded used to mean HOLD was
// the only legal move; it now means the good options are gone and the floor is
// still there. The rescue valve became a reward for choosing to brace.
const IMMEDIATE_PROGRESS_ACTIONS = Object.freeze([
  COMBAT_ACTION.EXPOSE,
  COMBAT_ACTION.WHITEOUT,
  COMBAT_ACTION.PLAYBACK,
  COMBAT_ACTION.INVERT,
  COMBAT_ACTION.MASTER_TAKE,
  COMBAT_ACTION.RUNAWAY_FEEDBACK,
]);

// This is deliberately stricter than "some button is enabled". HOLD, WAIT,
// TUNE, and a MONITOR pointed at an unrecordable intent can all spend a turn
// without moving the fight. SECOND BREATH only appears when the player truly
// has no immediate damage/capture route, so it cannot be farmed over a live kit.
function hasImmediateProgress(state) {
  if (IMMEDIATE_PROGRESS_ACTIONS.some((id) => actionAvailability(state, id).enabled)) return true;
  // The READ, not the truth: whether the recordist reckons they have a route is
  // the question, and SECOND BREATH appearing on a beat they misread would be
  // the interface knowing better than they do.
  const intent = predictedCombatIntent(state);
  if (intent?.recordable && actionAvailability(state, COMBAT_ACTION.MONITOR).enabled) return true;
  if (actionAvailability(state, COMBAT_ACTION.RADIO_DECOY).enabled) {
    return hasTechnique(state, TECHNIQUE.DEAD_AIR)
      || intent?.kind === INTENT_KIND.BROADCAST
      || intent?.kind === INTENT_KIND.LOOP;
  }
  return false;
}

export function combatRecoveryStatus(state) {
  const required = Math.max(0, integer(state?.difficulty?.recoveryHolds, 1));
  const holds = Math.max(0, integer(state?.recoveryHolds, 0));
  const stranded = state?.phase === 'select' && !state?.result && !hasImmediateProgress(state);
  const unlocked = !!state?.recoveryUnlocked || required === 0 || holds >= required;
  return {
    stranded,
    holds,
    required,
    remaining: Math.max(0, required - holds),
    unlocked,
    ready: stranded && unlocked,
  };
}

// THE WALL IS A PLACE HE IS LEFT STANDING, not one he passes through. Reaching
// the end and winding back inside one beat meant the playhead was never
// observably at the bar the recording stops at, so the one moment the craft is
// available never existed. He arrives there and stays. Playing on FROM the wall
// is the choice that takes it from the top, and that is the beat it costs him.
function runPracticeBeat(state) {
  if (!state.practice || state.practice.stopped) return 0;
  if (state.practice.bar < state.practice.bars) {
    playPracticeBar(state.practice);
    return 0;
  }
  // THE COST OF A REPETITION IS THE BEAT'S OWN DAMAGE.
  //
  // It was charged separately at first, on top of the authored intent — which
  // meant the card promised one number, a second arrived from nowhere, and the
  // profile drifted a quarter off the pace it was balanced at. The intents in
  // this wing ARE his repetitions (WIND IT BACK TWO BARS, BOTH HANDS ON THE
  // FADER), so what they cost him is already on the card and already tuned. The
  // lap is bookkeeping and a line of text, not a second bill.
  const wound = windPracticeBack(state.practice);
  state.last.notice += ' · AGAIN, FROM THE TOP';
  return wound.retakes;
}

// WHAT A BLOW YOU SAW COMING IS STILL WORTH.
//
// Read blows land at this share of what they would otherwise have done, floored
// at a single chip so no beat in the fight is ever completely free. The number
// is small on purpose: a misread costs the FULL blow, four to twenty times as
// much, and that ratio is the entire incentive to read.
export const PERFECT_COUNTER_SHARE = 0.25;

function applyEnemyIntent(state, intent, prevention, share = 1, first = true) {
  // THE PRACTICE WING TAKES ITS DAMAGE FROM NOWHERE ELSE.
  //
  // Nothing in that room is coming for him, so an intent there does not strike:
  // it is a thing he does to a file, and the file simply runs. He plays forward
  // until the bar the recording ends at, and the beat he hits that wall is the
  // beat he winds it back — which is the only thing in the wing that costs him.
  //
  // Prevention has nothing to prevent. Bracing against your own hands is not a
  // defence, and offering one would be the room pretending to swing at him.
  const signature = state.definition.signature?.id;
  const echo = Math.max(0, integer(state.signaturePressure, 0));
  state.signaturePressure = 0;
  const ensemble = signature === 'ensemble'
    && (state.turnsInMovement + 1) % 3 === 0
    && state.tuneUsedMovement !== state.movementIndex ? GRID : 0;
  const fragileSignal = state.snr === SNR_STATE.SIGNAL ? GRID : 0;
  // YOU CANNOT BRACE AGAINST YOUR OWN HANDS.
  //
  // Prevention is a defence against something thrown at you, and nothing in the
  // practice wing throws anything — the intents there are his own repetitions.
  // Bracing walked the whole fragment for free, so a player who found LISTEN
  // strolled out at full composure having felt nothing, which is the opposite of
  // an hour in a practice room. Time in that room costs him whatever he presses;
  // the only thing he controls is how much of it he spends.
  const guard = state.practice && !state.practice.stopped ? 0 : Math.max(0, integer(prevention, 0));
  // How hard the night hits, by preset. Applied to the authored blow before
  // your guard meets it, so bracing is worth the same absolute amount
  // everywhere and what changes is how much there is to brace against. The
  // practice wing is exempt: its intents are the cost of a repetition, tuned
  // against a room that cannot be guarded at all.
  const scale = state.practice ? 1 : Math.max(.1, Number(state.difficulty?.incomingScale) || 1);
  const raw = Math.round(integer(intent?.damage, 0) * scale);
  const damage = Math.max(0,
    raw + echo + ensemble + fragileSignal - guard,
  );
  // Chipped here rather than at the source, so prevention, the signature
  // pressure and the fragile-signal penalty all still apply in the ordinary way
  // and the reduction is the last word on the beat.
  const landed = share >= 1 ? damage
    : (damage > 0 ? Math.max(1, Math.round(damage * share)) : 0);
  if (landed > 0) {
    if (applyDamageToPlayer(state, landed)) state.last.notice += ' · SAFETY RELAY REMAINS AT 1';
    state.movementDamage = integer(state.movementDamage, 0) + landed;
  }
  // A BLOW YOU READ COSTS A CHIP AND NOTHING ELSE.
  //
  // The riders — the ring in your ears, a corrupted take — are what the blow
  // does to the rest of your beat, and seeing it coming is precisely what
  // spares you them. Without this, HOLD clears the ringing and the overload it
  // was braced against immediately puts it back, which makes the one move whose
  // job is clearing it unable to do that job.
  if (share >= 1) {
    if (intent?.effect === 'ringing') state.ringing = true;
    if (intent?.effect === 'corrupt-take') state.take = null;
  }
  if (intent?.effect === 'recover') {
    state.movementCoherence = Math.min(state.movementMaxCoherence, state.movementCoherence + Math.max(GRID, integer(intent.recover, GRID)));
  }
  if (signature === 'echo') state.signaturePressure = GRID;
  return landed;
}

function actionAvailability(state, actionId) {
  const intent = predictedCombatIntent(state);
  if (state.phase !== 'select') return { enabled: false, reason: 'NOT SELECTING' };
  if (actionId === COMBAT_ACTION.TUNE) {
    if (!state.tools.fork) return { enabled: false, reason: 'NO FORK' };
    if (state.tuneUsedMovement === state.movementIndex) return { enabled: false, reason: 'USED THIS MOVEMENT' };
    return { enabled: true };
  }
  if (actionId === COMBAT_ACTION.EXPOSE || actionId === COMBAT_ACTION.WHITEOUT) {
    if (!state.tools.torch) return { enabled: false, reason: 'NO TORCH' };
    const whiteout = actionId === COMBAT_ACTION.WHITEOUT;
    if (!whiteout) return { enabled: true, cost: 0 };
    // EXPOSE is free. It used to bill the battery, and because the battery is a
    // RUN resource that exploration drains by the second, a recordist could
    // walk the building and arrive at the chapel with their only reliable
    // attack already spent — which meant every encounter had to be balanced for
    // a bag that might be empty, which meant a full bag walked through it. The
    // torch costs nothing to point. It costs something to burn out.
    if (!hasTechnique(state, TECHNIQUE.WHITEOUT)) return { enabled: false, reason: 'TECHNIQUE LOCKED' };
    const cost = .05 * state.torchDrainScale;
    if (state.battery + 1e-9 < cost) return { enabled: false, reason: 'BATTERY FLAT', cost };
    const charge = chargeCost(COMBAT_ACTION.WHITEOUT);
    if (state.charge < charge) return { enabled: false, reason: `NEEDS ${charge} CHARGE`, cost, charge };
    return { enabled: true, cost, charge };
  }
  if (actionId === COMBAT_ACTION.MONITOR && !state.tools.recorder) return { enabled: false, reason: 'NO RECORDER' };
  if (actionId === COMBAT_ACTION.PLAYBACK) {
    if (!state.tools.recorder) return { enabled: false, reason: 'NO RECORDER' };
    if (!state.take) return { enabled: false, reason: 'NO TAKE' };
  }
  if (actionId === COMBAT_ACTION.INVERT) {
    if (!state.tools.rig) return { enabled: false, reason: 'NO BENT RIG' };
    if (!state.take) return { enabled: false, reason: 'NO TAKE' };
    // It used to grey out against anything but a loop, which made the button
    // itself a loop detector: with a rig and a take in hand, whether INVERT was
    // available told you the opponent's kind for free, every beat, and no
    // misread could survive that. The rig turns whatever is coming; whether
    // there is anything in it to turn is answered when you commit, the way
    // MONITOR answers 'no stable take'.
  }
  if (actionId === COMBAT_ACTION.RADIO_DECOY) {
    if (!state.tools.radio) return { enabled: false, reason: 'NO RADIO' };
    const charge = chargeCost(actionId);
    if (state.charge < charge) return { enabled: false, reason: `NEEDS ${charge} CHARGE`, charge };
    return { enabled: true, charge };
  }
  if (actionId === COMBAT_ACTION.STEADY_HANDS) {
    if (!state.tools.coffee) return { enabled: false, reason: 'NO COFFEE' };
    if (state.coffeeUsed) return { enabled: false, reason: 'CUP EMPTY' };
    if (state.composure >= state.maxComposure) return { enabled: false, reason: 'COMPOSURE STEADY' };
  }
  if (actionId === COMBAT_ACTION.COMPOSE) {
    const recovery = combatRecoveryStatus(state);
    if (recovery.ready) return { enabled: true, recovery: true };
    if (state.composure >= state.maxComposure) return { enabled: false, reason: 'COMPOSED' };
    if ((state.composeMovements || []).includes(state.movementIndex)) return { enabled: false, reason: 'BREATH SPENT' };
  }
  if (actionId === COMBAT_ACTION.MASTER_TAKE) {
    if (!state.tools.recorder) return { enabled: false, reason: 'NO RECORDER' };
    if (!hasTechnique(state, TECHNIQUE.MASTER_TAKE)) return { enabled: false, reason: 'TECHNIQUE LOCKED' };
    const charge = chargeCost(actionId);
    if (state.charge < charge) return { enabled: false, reason: `NEEDS ${charge} CHARGE`, charge };
    return { enabled: true, charge };
  }
  if (actionId === COMBAT_ACTION.RUNAWAY_FEEDBACK) {
    if (!state.tools.rig) return { enabled: false, reason: 'NO BENT RIG' };
    if (!hasTechnique(state, TECHNIQUE.RUNAWAY_FEEDBACK)) return { enabled: false, reason: 'TECHNIQUE LOCKED' };
    const charge = chargeCost(actionId);
    if (state.charge < charge) return { enabled: false, reason: `NEEDS ${charge} CHARGE`, charge };
    return { enabled: true, charge };
  }
  if (actionId === COMBAT_ACTION.END_TEMPO && !state.tempo) return { enabled: false, reason: 'NO TEMPO' };
  return { enabled: true };
}

// A tile's numbers. `damage` stays a SCALAR — the band's midpoint, i.e. what the
// move is worth on an average beat — because plenty of callers legitimately want
// to compare or sum move values. `damageBand` is what the player is SHOWN, and
// it is the range that will actually be rolled (stance already folded in), so
// the tile can never promise a number the reducer will not honour.
function bandFields(state, band) {
  const rolled = outgoingBand(state, band);
  return {
    damage: Math.round((rolled.min + rolled.max) / 2),
    damageBand: rolled,
  };
}

export function availableCombatActions(state) {
  // Everything below is a readout. It describes the fight the recordist thinks
  // they are in — see predictedCombatIntent.
  const intent = predictedCombatIntent(state);
  const recovery = combatRecoveryStatus(state);
  // The tiles are written VERB FIRST. A player choosing a move is asking "what
  // will this do", not "how much will this do", and the old copy answered the
  // second question with a number that was a lie the moment stance changed.
  const noise = { ...state, snr: SNR_STATE.NOISE };
  const signal = { ...state, snr: SNR_STATE.SIGNAL };
  const silence = { ...state, snr: SNR_STATE.SILENCE };
  const actions = [
    {
      id: COMBAT_ACTION.SHOUT, tool: COMBAT_TOOL.SELF, label: 'SHOUT',
      detail: `THE FALLBACK · NO TOOL, NO COST, NEVER EMPTY · ${bandText(outgoingBand(noise, ACTION_BAND[COMBAT_ACTION.SHOUT]))} COHERENCE`,
      regular: true,
      ...bandFields(noise, ACTION_BAND[COMBAT_ACTION.SHOUT]),
    },
    {
      id: COMBAT_ACTION.HOLD, tool: COMBAT_TOOL.SELF, label: 'HOLD',
      detail: recovery.stranded && !recovery.unlocked
        ? `BRACE · PREVENT ${defensivePrevention(silence, holdPrevention(state))} · CATCH BREATH ${Math.min(recovery.required, recovery.holds + 1)} / ${recovery.required}`
        : `BRACE · PREVENT ${defensivePrevention(silence, holdPrevention(state))} · CHIPS ON A READ · ENTER SILENCE`,
      prevents: defensivePrevention(silence, holdPrevention(state)),
      ...bandFields(silence, bandFrom(GRID)),
      regular: true,
    },
    {
      id: COMBAT_ACTION.WAIT, tool: COMBAT_TOOL.SELF, label: 'WAIT',
      detail: 'YIELD THE BEAT · FACE THE INTENT',
    },
    {
      id: COMBAT_ACTION.COMPOSE, tool: COMBAT_TOOL.SELF,
      label: recovery.ready ? 'SECOND BREATH' : 'COMPOSE',
      detail: recovery.ready
        ? `RECOVER · RESTORE ${composeHeal(state)} · RETURN ${GRID} COHERENCE · GUARD ${defensivePrevention(silence, Math.max(0, holdPrevention(state) - GRID))}`
        : `RECOVER · RESTORE ${composeHeal(state)} COMPOSURE · ONCE / MOVEMENT · ENTER SILENCE`,
      heals: composeHeal(state),
      damage: recovery.ready ? GRID : 0,
      prevents: recovery.ready
        ? defensivePrevention(silence, Math.max(0, holdPrevention(state) - GRID))
        : 0,
    },
    // PARRY is no longer a move you pick — it is a reaction. When the adversary's
    // blow lands you time a guard against it (see PARRY_TIERS / combat.js), so
    // it never sits in the tool menu.
    {
      id: COMBAT_ACTION.EXPOSE, tool: COMBAT_TOOL.TORCH, label: 'EXPOSE',
      detail: `SET UP · ${bandText(outgoingBand(noise, ACTION_BAND[COMBAT_ACTION.EXPOSE]))} COHERENCE · LEAVES RESIDUE FOR PLAYBACK · ENTER NOISE`,
      regular: true,
      ...bandFields(noise, ACTION_BAND[COMBAT_ACTION.EXPOSE]),
    },
    {
      id: COMBAT_ACTION.MONITOR, tool: COMBAT_TOOL.RECORDER, label: 'MONITOR',
      detail: `BUILD · CAPTURE A BROADCAST · ${bandText(outgoingBand(signal, bandFrom(monitorChip(state))))} COHERENCE · ENTER SIGNAL`,
      // The recorder is a regular too: rolling on the thing costs it something
      // whether or not there is a stable take in it. Without this the whole
      // floor rests on the torch, and a missing torch is a fight you cannot win
      // rather than a fight you have to work for.
      ...bandFields(signal, bandFrom(monitorChip(state))),
      prevents: defensivePrevention(signal, GRID),
      captures: true,
    },
    {
      id: COMBAT_ACTION.PLAYBACK, tool: COMBAT_TOOL.RECORDER, label: 'PLAYBACK',
      detail: state.take
        ? `CASH IN · SPEND ${state.take.label}${state.exposedBonus ? ' · RESIDUE LOADED' : ''}`
        : 'NO TAKE LOADED',
      ...(state.take
        ? bandFields(noise, bandFrom(integer(state.take.damage, 0) + state.exposedBonus))
        : { damage: 0, damageBand: makeBand(0, 0) }),
      consumesTake: true,
    },
    {
      id: COMBAT_ACTION.INVERT, tool: COMBAT_TOOL.RIG, label: 'INVERT',
      detail: 'TURN A LOOP · SPEND TAKE · RETURN ITS OWN FORCE · ENTER SILENCE',
      ...(intent?.invertible
        ? bandFields(silence, bandFrom(integer(intent?.damage, 0)))
        : { damage: 0, damageBand: makeBand(0, 0) }),
      consumesTake: true,
    },
    ...(hasTechnique(state, TECHNIQUE.WHITEOUT) ? [{
      id: COMBAT_ACTION.WHITEOUT, tool: COMBAT_TOOL.TORCH, label: 'WHITEOUT',
      detail: `SPECIAL · ${chargeCost(COMBAT_ACTION.WHITEOUT)} CHARGE · IT LANDS WHATEVER THEY DO · CLEARS A SET GUARD · BURNS BATTERY`,
      ...bandFields(noise, ACTION_BAND[COMBAT_ACTION.WHITEOUT]),
      special: true, charge: chargeCost(COMBAT_ACTION.WHITEOUT),
    }] : []),
    ...(state.tools.recorder && hasTechnique(state, TECHNIQUE.MASTER_TAKE) ? [{
      id: COMBAT_ACTION.MASTER_TAKE, tool: COMBAT_TOOL.RECORDER, label: 'MASTER TAKE',
      detail: `SPECIAL · ${chargeCost(COMBAT_ACTION.MASTER_TAKE)} CHARGE · NEVER A GRAZE · LEAVES A STRONG TAKE LOADED`,
      ...bandFields(signal, tightenBand(ACTION_BAND[COMBAT_ACTION.MASTER_TAKE], 0.5)),
      special: true, charge: chargeCost(COMBAT_ACTION.MASTER_TAKE),
    }] : []),
    ...(state.tools.rig && hasTechnique(state, TECHNIQUE.RUNAWAY_FEEDBACK) ? [{
      id: COMBAT_ACTION.RUNAWAY_FEEDBACK, tool: COMBAT_TOOL.RIG, label: 'RUNAWAY FEEDBACK',
      detail: `SPECIAL · ${chargeCost(COMBAT_ACTION.RUNAWAY_FEEDBACK)} CHARGE · REACHES THE WHOLE ROOM · IT LOSES ITS NEXT BEAT`,
      ...bandFields(silence, ACTION_BAND[COMBAT_ACTION.RUNAWAY_FEEDBACK]),
      special: true, charge: chargeCost(COMBAT_ACTION.RUNAWAY_FEEDBACK),
    }] : []),
    ...(state.tools.fork ? [{
      id: COMBAT_ACTION.TUNE, tool: COMBAT_TOOL.FORK, label: 'TUNE',
      // It used to reveal the next two or three entries in the list. There is
      // no list any more — only one blow is ever committed — so the fork does
      // the thing a reference pitch actually does: it gives you a true one. For
      // the rest of the movement your read cannot be wrong, and every swing you
      // throw lands higher in its band.
      detail: 'READ · FREE · YOUR READ HOLDS THIS MOVEMENT · EVERY HIT LANDS HIGHER · ENTER SIGNAL',
      reveals: hasTechnique(state, TECHNIQUE.PERFECT_PITCH) ? 3 : 2, free: true,
    }] : []),
    ...(state.tools.radio ? [{
      id: COMBAT_ACTION.RADIO_DECOY, tool: COMBAT_TOOL.RADIO, label: 'THROW VOICE',
      detail: `SPECIAL · ${chargeCost(COMBAT_ACTION.RADIO_DECOY)} CHARGE · IT DECIDES AGAIN · PREVENT ${defensivePrevention(noise, 2 * GRID + (hasTechnique(state, TECHNIQUE.MISDIRECTION) ? GRID : 0))} · ENTER NOISE`,
      prevents: defensivePrevention(noise, 2 * GRID + (hasTechnique(state, TECHNIQUE.MISDIRECTION) ? GRID : 0)),
      ...bandFields(noise, bandFrom(hasTechnique(state, TECHNIQUE.DEAD_AIR) ? 2 * GRID : GRID)),
      special: true, charge: chargeCost(COMBAT_ACTION.RADIO_DECOY),
    }] : []),
    ...(state.tools.coffee ? [{
      id: COMBAT_ACTION.STEADY_HANDS, tool: COMBAT_TOOL.COFFEE, label: 'STEADY HANDS',
      detail: `RECOVER · RESTORE ${3 * GRID} COMPOSURE · CONSUME · ENTER SIGNAL`,
      heals: 3 * GRID, once: true,
    }] : []),
    ...(state.tempo ? [{
      id: COMBAT_ACTION.END_TEMPO, tool: COMBAT_TOOL.SELF, label: 'CLOSE CHANNEL',
      detail: 'END BONUS ACTION',
      free: true,
    }] : []),
    // The wing, and nowhere else. Neither of these damages anything, because
    // there is nothing in that room to damage.
    // Only at the wall. You cannot play back a bar you have not got to, and
    // gating it there is what gives the repetition its job: he has to work the
    // fragment through to the end before the craft is even on the table, and
    // every pass after the first costs him.
    ...(state.practice && !state.practice.stopped && state.practice.bar >= state.practice.bars ? [{
      // SELF, not RECORDER. Playing the bar back is a faculty, not a device — and
      // gating it on the kit meant a spent bag could never leave this room: no
      // recorder, no listening, no putting it down, just attrition until it took
      // him. The wing is the one fight where the way out is something he is
      // rather than something he carries, which is also the point of it.
      id: COMBAT_ACTION.LISTEN, tool: COMBAT_TOOL.SELF, label: 'LISTEN',
      // IT DOES NOT ADVERTISE THE ANSWER.
      //
      // The tile named what the next pass would reveal, which made the way out
      // of the room a labelled button and turned the whole wing into a puzzle
      // with its solution printed on it. He does not know there is anything on
      // that bar until he has played it once. After that the tile says what he
      // is going back for, because by then he does know.
      detail: state.practice.listens === 0
        ? 'PLAY THE BAR BACK · FOUR SECONDS OF NOTHING · COSTS THE BEAT'
        : practiceSnapshot(state.practice).next
          ? `PLAY IT BACK AGAIN · ${practiceSnapshot(state.practice).next} · COSTS THE BEAT`
          : 'PLAY THE BAR BACK · YOU HAVE HEARD ALL OF IT',
    }] : []),
    ...(state.practice && practiceCanStop(state.practice) && !state.practice.stopped ? [{
      id: COMBAT_ACTION.PUT_IT_DOWN, tool: COMBAT_TOOL.SELF, label: 'PUT IT DOWN',
      detail: 'TAKE YOUR HAND OFF THE TRANSPORT · NOTHING IS RUNNING',
      free: true,
    }] : []),
  ];
  return actions.map((action) => {
    const availability = actionAvailability(state, action.id);
    const countersKinds = actionCounterKinds(action.id);
    return {
      damage: 0,
      damageBand: makeBand(0, 0),
      prevents: 0,
      heals: 0,
      reflects: 0,
      ...action,
      ...availability,
      countersKinds,
      stanceShift: ACTION_SNR[action.id] || null,
      // The green tile and its diamond. This is the last explicit help in the
      // fight — with the prose gone it is still the answer, handed over every
      // beat — so the bottom rung of the guidance ladder takes it away too.
      // `countersKinds` is untouched: the RULE still knows what counters what,
      // and only the telling of it is withheld.
      perfect: state.difficulty.guidance !== 'none' && countersKinds.includes(intent?.kind),
    };
  });
}

// One-line mechanical readouts, assembled from the same structured fields the
// reducer runs on so the UI copy can never drift from the rules.
export function combatMoveSubtext(state, move) {
  if (!move) return { short: '', long: '' };
  const bits = [];
  if (move.damage) bits.push(`${move.damageBand ? bandText(move.damageBand) : move.damage} DMG`);
  if (move.prevents) bits.push(`GUARD ${move.prevents}`);
  if (move.reflects) bits.push(`REFLECT ${move.reflects}`);
  if (move.heals) bits.push(`+${move.heals} COMPOSURE`);
  if (move.captures) bits.push('CAPTURE TAKE');
  if (move.consumesTake) bits.push('SPEND TAKE');
  if (move.reveals) bits.push(`SEE ${move.reveals} AHEAD`);
  if (move.free) bits.push('FREE');
  if (move.once) bits.push('ONCE');
  if (move.stanceShift) bits.push(`→${String(move.stanceShift).toUpperCase()}`);
  if (move.countersKinds?.length) bits.push(`CTR ${move.countersKinds.map((kind) => kind.toUpperCase()).join('/')}`);
  const short = bits.join(' · ');
  const sentences = [];
  if (move.damage) sentences.push(`${move.damage} coherence damage`);
  if (move.prevents) sentences.push(`guards ${move.prevents} incoming`);
  if (move.reflects) sentences.push(`reflects ${move.reflects} coherence when you read the blow`);
  if (move.heals) sentences.push(`restores ${move.heals} composure`);
  if (move.captures) sentences.push('captures a recordable broadcast as a take');
  if (move.consumesTake) sentences.push('spends the loaded take');
  if (move.reveals) sentences.push(`reveals the next ${move.reveals} intents`);
  if (move.free) sentences.push('does not spend the beat');
  if (move.once) sentences.push('once per encounter');
  if (move.stanceShift) sentences.push(`shifts stance to ${String(move.stanceShift).toUpperCase()}`);
  if (move.countersKinds?.length) {
    sentences.push(`counters ${move.countersKinds.map((kind) => kind.toUpperCase()).join('/')} — hit negated, TEMPO opens`);
  }
  const long = `${move.label} — ${sentences.join(' · ') || move.detail || ''}`;
  return { short, long };
}

export function counterMovesForIntent(state, intent) {
  if (!intent) return [];
  return availableCombatActions(state).filter((move) => (
    move.countersKinds.includes(intent.kind) && move.enabled
  ));
}

const TOOL_LABEL = Object.freeze({
  [COMBAT_TOOL.SELF]: 'HANDS',
  [COMBAT_TOOL.TORCH]: 'FIELD TORCH',
  [COMBAT_TOOL.RECORDER]: 'RECORDER',
  [COMBAT_TOOL.RIG]: 'BENT RIG',
  [COMBAT_TOOL.FORK]: 'TUNING FORK',
  [COMBAT_TOOL.RADIO]: 'RADIO',
  [COMBAT_TOOL.COFFEE]: 'COFFEE',
});

export function availableCombatTools(state) {
  const available = [COMBAT_TOOL.TORCH, COMBAT_TOOL.RECORDER, COMBAT_TOOL.RIG, COMBAT_TOOL.FORK, COMBAT_TOOL.RADIO, COMBAT_TOOL.COFFEE]
    .filter((id) => !!state.tools[id]);
  const ordered = unique([...(state.tools.order || []), ...available]).filter((id) => available.includes(id));
  const equipped = [COMBAT_TOOL.SELF, ...ordered];
  return equipped.map((id) => {
    const moves = combatMovesForTool(state, id);
    return {
      id,
      label: TOOL_LABEL[id],
      moves: moves.map((move) => move.id),
      ready: moves.some((move) => move.enabled),
    };
  });
}

export function combatMovesForTool(state, toolId) {
  return availableCombatActions(state).filter((action) => action.tool === toolId);
}

function maybeEarnProof(state, movement, actionId, perfect, takeBefore) {
  if (state.definition.kind !== 'chapel') return;
  if (movement.id === 'recordist' && actionId === COMBAT_ACTION.MONITOR && perfect) addProof(state, 'return.recordist');
  if (movement.id === 'contract' && actionId === COMBAT_ACTION.INVERT && perfect) addProof(state, 'invert.contract');
  if (movement.id === 'source' && actionId === COMBAT_ACTION.PLAYBACK && takeBefore?.tag === 'body') addProof(state, 'return.source');
  if (movement.id === 'source' && actionId === COMBAT_ACTION.INVERT && perfect) addProof(state, 'invert.source');
}

export function reduceCombat(input, action = {}) {
  const state = clone(input);
  const actionId = action.type || action.id;

  // PARRY is a reaction, not a chosen move: it fires against the blow that just
  // landed, during the enemy beat (state.phase is not 'select'), so it is handled
  // ahead of the turn guard. A struck blow (broadcast / overload / loop) is turned
  // — the composure it took this beat is restored and its force sent back as
  // coherence. Feints (conceal / silence) carry nothing to turn.
  if (actionId === COMBAT_ACTION.PARRY) {
    const hits = Array.isArray(state.last?.enemyHits) ? state.last.enemyHits : [];
    const blowKinds = [INTENT_KIND.BROADCAST, INTENT_KIND.OVERLOAD, INTENT_KIND.LOOP];
    const blows = hits.filter((h) => blowKinds.includes(h.kind));
    const tier = PARRY_TIERS[action.tier] ? action.tier : PARRY_TIER.PERFECT;
    const grade = PARRY_TIERS[tier];
    const took = blows.reduce((sum, h) => sum + Math.max(0, integer(h.received, 0)), 0);
    const room = Math.max(0, state.maxComposure - state.composure);
    const restored = Math.min(room, Math.round(took * grade.restore));
    state.composure = Math.min(state.maxComposure, state.composure + restored);
    const priorTarget = state.apparitions?.target;
    if (state.apparitions && state.last?.enemyActor?.id) selectHallTarget(state.apparitions, state.last.enemyActor.id);
    const reflected = blows.length && grade.reflect > 0
      ? applyDamageToEnemy(state, Math.round(parryReflect(state) * grade.reflect), COMBAT_ACTION.PARRY)
      : 0;
    if (state.apparitions && Number.isInteger(priorTarget)) {
      state.apparitions.target = priorTarget;
      if (targetedHallApparition(state.apparitions)?.health <= 0) moveHallTarget(state.apparitions, 1);
    }
    // Meeting the blow on the beat pays the same as reading it. The parry is the
    // only timed input in the fight and it was the only skill in it that bought
    // the player nothing.
    const charged = blows.length && grade.charge ? earnCharge(state, grade.charge) : 0;
    state.last = {
      ...(state.last || {}),
      notice: blows.length
        ? `${grade.label} · ${restored} TURNED${reflected ? ` · ${reflected} REFLECTED` : ''}${charged ? ` · +${charged} CHARGE` : ''}`
        : 'PARRY · NOTHING TO TURN',
      action: COMBAT_ACTION.PARRY,
      parried: blows.length > 0,
      parryTier: blows.length ? tier : null,
      parryRestored: restored,
      dealt: integer(state.last?.dealt, 0) + reflected,
      received: Math.max(0, integer(state.last?.received, 0) - restored),
    };
    if (state.apparitions && hallApparitionsDefeated(state.apparitions)) {
      state.last.notice += ' · ALL THREE APPARITIONS RELEASED';
      finishCombat(state, 'win');
    }
    return state;
  }

  if (state.phase !== 'select' || state.result) return state;

  if (actionId === COMBAT_ACTION.TARGET) {
    if (state.apparitions) {
      if (action.targetId || action.rowId) selectHallTarget(state.apparitions, action.targetId || action.rowId);
      else moveHallTarget(state.apparitions, action.delta);
      state.last = {
        ...(state.last || {}),
        notice: `TARGET · ${targetedHallApparition(state.apparitions)?.label || ''}`,
        action: actionId,
      };
    }
    return state;
  }

  // He plays the bar back instead of playing over it. Costs the beat, damages
  // nothing, and is the only thing in that room that goes anywhere.
  if (actionId === COMBAT_ACTION.LISTEN) {
    // The same gate the tile is offered behind. This branch sits ahead of the
    // ordinary availability check (like TARGET), so it has to refuse for itself
    // — otherwise a bound key plays back a bar he has not reached.
    if (state.practice && !state.practice.stopped && state.practice.bar >= state.practice.bars) {
      const reveal = listenPracticeBar(state.practice);
      state.last = {
        ...(state.last || {}),
        notice: reveal ? `${reveal.label} · ${reveal.note}` : 'YOU HAVE HEARD ALL OF IT',
        action: actionId,
        perfect: false,
        practiceReveal: reveal ? { id: reveal.id, label: reveal.label, line: reveal.line } : null,
      };
      advanceIntent(state);
    }
    return state;
  }

  // He takes his hand off the transport. Not a victory over anything — there is
  // nobody in that room to beat — but it is how the wing ends, and it is the
  // hardest thing on the board.
  if (actionId === COMBAT_ACTION.PUT_IT_DOWN) {
    if (state.practice && practiceStop(state.practice)) {
      state.last = {
        ...(state.last || {}),
        notice: 'YOU DO NOT WIND IT BACK',
        action: actionId,
        perfect: false,
      };
      finishCombat(state, 'win');
    }
    return state;
  }

  if (actionId === COMBAT_ACTION.CHANNEL) {
    if (state.source && Object.values(SOURCE_CHANNEL).includes(action.channel)) {
      state.source.armed = action.channel;
      state.last = { notice: `${action.channel.toUpperCase()} CHANNEL ARMED`, transition: null, action: actionId, perfect: false };
    }
    return state;
  }

  const availability = actionAvailability(state, actionId);
  if (!availability.enabled) {
    state.last = { notice: availability.reason || 'ACTION UNAVAILABLE', transition: null, action: actionId, perfect: false };
    return state;
  }

  if (actionId === COMBAT_ACTION.TUNE) {
    const snrShift = shiftSnr(state, actionId);
    state.tuneUsedMovement = state.movementIndex;
    // RESONANCE (fork) doubles the resonant bonus a TUNE leaves on the next
    // perfect counter.
    state.tuneBonus = hasTechnique(state, TECHNIQUE.RESONANCE) ? 2 * GRID : GRID;
    // A reference pitch is a reference because it does not lie to you. Whatever
    // the recordist had wrong a moment ago, they have it right now, and for the
    // rest of this movement their read holds (see maybeMisread).
    state.misread = null;
    toolCount(state, 'fork');
    state.last = {
      notice: 'FORK CALIBRATED · SIGNAL CLEAN · YOUR READ HOLDS THIS MOVEMENT',
      transition: null, action: actionId, perfect: false,
      snrFrom: snrShift.from, snrTo: snrShift.to, dealt: 0, received: 0,
    };
    return state;
  }

  if (actionId === COMBAT_ACTION.END_TEMPO) {
    state.last = { notice: 'OPEN CHANNEL CLOSED', transition: null, action: actionId, perfect: false };
    advanceIntent(state);
    return state;
  }

  const movement = currentMovement(state);
  const intent = currentCombatIntent(state);
  const recoveryBefore = combatRecoveryStatus(state);
  const bonusAction = !!state.tempo;
  const perfect = !bonusAction && actionCounterKinds(actionId).includes(intent?.kind);
  const takeBefore = state.take ? { ...state.take } : null;
  const composureBefore = state.composure;
  const coherenceBefore = state.movementCoherence;
  // The stance you arrived in, kept before shiftSnr overwrites it: earnedFloor
  // rewards planning the sequence, not the stance the move itself puts you in.
  state.snrBefore = state.snr;
  const snrShift = shiftSnr(state, actionId);
  let prevention = 0;
  let enemyDamage = 0;
  let dealt = 0;
  let notice = '';

  state.last = { notice: '', transition: null, action: actionId, perfect, snrFrom: snrShift.from, snrTo: snrShift.to };
  toolCount(state, ACTION_TOOL[actionId] || actionId);

  if (actionId === COMBAT_ACTION.EXPOSE || actionId === COMBAT_ACTION.WHITEOUT) {
    const whiteout = actionId === COMBAT_ACTION.WHITEOUT;
    const cost = availability.cost || 0;
    state.battery = Math.max(0, state.battery - cost);
    state.torchSpent += cost;
    if (whiteout) {
      spendCharge(state, COMBAT_ACTION.WHITEOUT);
      // WHITEOUT'S VERB: IT LANDS, WHATEVER THEY DO.
      // Nothing about a flash of white can be slipped, so a set guard is simply
      // gone. That — not its damage — is what two charge buys: the one answer to
      // an opponent that has read you and is waiting to turn your swing.
      state.enemyGuard = null;
    }
    dealt = strike(state, ACTION_BAND[actionId], actionId, { perfect });
    // AFTERIMAGE raises the exposed residue; OVEREXPOSE adds a further point.
    state.exposedBonus = whiteout ? 0
      : (hasTechnique(state, TECHNIQUE.AFTERIMAGE) ? 2 * GRID : GRID) + (hasTechnique(state, TECHNIQUE.OVEREXPOSE) ? GRID : 0);
    notice = `${whiteout ? 'WHITEOUT' : 'EXPOSE'} · ${dealt} COHERENCE`;
  } else if (actionId === COMBAT_ACTION.MONITOR) {
    // The take-slot question is asked BEFORE anything lands. It used to be asked
    // after: the chip was applied, then the function returned to wait for a
    // confirmation, and the beat never happened — so every press of MONITOR
    // against a full slot dealt free damage and cost nothing. Cheap against a
    // coherence bar and especially misleading in a multi-target encounter,
    // where a body could take the hit before the prompt simply came back.
    if (intent?.recordable && state.take && !action.replaceTake) {
      state.last = { notice: 'TAKE SLOT OCCUPIED · CONFIRM REPLACEMENT', transition: null, action: actionId, perfect: false, needsTakeConfirmation: true };
      return state;
    }
    prevention = defensivePrevention(state, GRID);
    dealt = strike(state, bandFrom(monitorChip(state)), actionId, { perfect });
    if (intent?.recordable) {
      state.take = {
        id: intent.id,
        label: intent.takeLabel || intent.label,
        damage: captureDamage(state, intent.playbackDamage ?? intent.damage ?? 2),
        tag: intent.takeTag || null,
      };
      notice = `CAPTURED · ${state.take.label} · ${dealt} COHERENCE`;
    } else notice = `MONITORING · NO STABLE TAKE · ${dealt} COHERENCE`;
  } else if (actionId === COMBAT_ACTION.PLAYBACK) {
    // Cashing in. EXPOSE first and the residue both raises the band and counts as
    // SETUP, which lifts the floor — the sequence is worth more than the sum.
    dealt = strike(
      state,
      bandFrom(integer(state.take?.damage, 0) + state.exposedBonus),
      actionId,
      { perfect, setup: state.exposedBonus > 0 },
    );
    // OVERDUB (rig branch) and MULTITRACK (recorder branch) both leave a residual
    // take once per movement; MULTITRACK needs no rig.
    const canResidual = (hasTechnique(state, TECHNIQUE.OVERDUB) && state.tools.rig)
      || hasTechnique(state, TECHNIQUE.MULTITRACK);
    const retained = canResidual && !state.overdubMovements.includes(state.movementIndex);
    if (retained) {
      state.take = { id: `${takeBefore.id}:overdub`, label: `${takeBefore.label} / OVERDUB`, damage: GRID, tag: takeBefore.tag };
      state.overdubMovements.push(state.movementIndex);
    } else state.take = null;
    state.exposedBonus = 0;
    notice = `PLAYBACK · ${dealt} COHERENCE${retained ? ' · RESIDUAL TAKE' : ''}`;
  } else if (actionId === COMBAT_ACTION.MASTER_TAKE) {
    spendCharge(state, actionId);
    // MASTER TAKE'S VERB: IT ALWAYS GIVES YOU A TAKE.
    // The definitive capture, so its band is tightened toward the top — a take
    // you called definitive is not allowed to come out a graze — and it installs
    // a strong take with no capture window and no recordable intent needed. It is
    // the special you spend when the bag is dry: it pays for the NEXT beat too.
    dealt = strike(state, tightenBand(ACTION_BAND[actionId], 0.5), actionId, { perfect });
    state.take = {
      id: `${state.definition.id}:master-take`,
      label: 'MASTER TAKE',
      damage: captureDamage(state, 3 * GRID),
      tag: 'master',
    };
    notice = `MASTER TAKE · ${dealt} COHERENCE · THE ROOM IS ON TAPE`;
  } else if (actionId === COMBAT_ACTION.RUNAWAY_FEEDBACK) {
    spendCharge(state, actionId);
    state.take = null;
    // RUNAWAY FEEDBACK'S VERB: IT BUYS YOU A TURN.
    // The loop eats itself and reaches the selected apparition group, and the
    // opponents lose their next phrase because they are inside the noise too.
    // Three charge is expensive; what it buys is not
    // a bigger number but a beat of your own, which is the only thing in the
    // fight that cannot be bought any other way.
    dealt = strike(state, ACTION_BAND[actionId], actionId, { perfect });
    state.skipEnemyBeat = true;
    notice = `RUNAWAY FEEDBACK · ${dealt} COHERENCE · THE LOOP EATS ITSELF · THE ROOM IS DEAF`;
  } else if (actionId === COMBAT_ACTION.HOLD) {
    prevention = defensivePrevention(state, holdPrevention(state));
    state.ringing = false;
    // Bracing correctly is a regular attack, not a dead turn. HOLD used to be
    // the one perfect counter that made no progress at all, so an opponent that
    // leaned on overloads could stall the fight indefinitely against a player
    // doing exactly the right thing. Meeting the blow on your hands costs it
    // something.
    if (perfect) dealt = strike(state, bandFrom(GRID), actionId, { perfect });
    notice = `HOLD · PREVENT ${prevention}${dealt ? ` · ${dealt} COHERENCE` : ''}`;
    if (recoveryBefore.stranded && !recoveryBefore.unlocked) {
      state.recoveryHolds = Math.min(recoveryBefore.required, recoveryBefore.holds + 1);
      state.recoveryUnlocked = state.recoveryHolds >= recoveryBefore.required;
      notice += state.recoveryUnlocked
        ? ' · SECOND BREATH READY'
        : ` · CATCH BREATH ${state.recoveryHolds} / ${recoveryBefore.required}`;
    }
  } else if (actionId === COMBAT_ACTION.COMPOSE) {
    const restored = Math.min(composeHeal(state), state.maxComposure - state.composure);
    state.composure += restored;
    if (!(state.composeMovements || []).includes(state.movementIndex)) state.composeMovements.push(state.movementIndex);
    if (availability.recovery) {
      prevention = defensivePrevention(state, Math.max(0, holdPrevention(state) - GRID));
      dealt = applyDamageToEnemy(state, GRID, actionId);
      notice = `SECOND BREATH · ${restored} COMPOSURE · ${dealt} COHERENCE RETURNED · PREVENT ${prevention}`;
    } else notice = `COMPOSE · ${restored} COMPOSURE RECOVERED`;
  } else if (actionId === COMBAT_ACTION.INVERT) {
    if (!intent?.invertible) {
      // You went to turn a loop and there was no loop in it. The beat is gone
      // and the opponent still gets its turn — but the take stays in the slot,
      // the same mercy MONITOR gets when it finds nothing to record. Committing
      // on a bad read should cost you the exchange, not the night.
      notice = 'INVERT · NOTHING TO TURN';
    } else {
      const retain = hasTechnique(state, TECHNIQUE.FEEDBACK_LOOP) && !state.feedbackLoopUsed;
      // TAPE ECHO adds a further +1 to a retained Invert (feedback-loop chain).
      const echoBonus = retain && hasTechnique(state, TECHNIQUE.TAPE_ECHO) ? GRID : 0;
      dealt = strike(state, bandFrom(integer(intent?.damage, 0) + (retain ? GRID : 0) + echoBonus), actionId, { perfect });
      if (retain) state.feedbackLoopUsed = true;
      else state.take = null;
      notice = `INVERT · ${dealt} RETURNED${retain ? ' · TAKE RETAINED' : ''}${echoBonus ? ' · TAPE ECHO' : ''}`;
    }
  } else if (actionId === COMBAT_ACTION.RADIO_DECOY) {
    spendCharge(state, actionId);
    // MISDIRECTION (radio) guards +1; DEAD_AIR gives the decoy teeth — 2 coherence
    // against any intent, not just broadcast/loop.
    prevention = defensivePrevention(state, 2 * GRID + (hasTechnique(state, TECHNIQUE.MISDIRECTION) ? GRID : 0));
    const deadAir = hasTechnique(state, TECHNIQUE.DEAD_AIR);
    if (deadAir || intent?.kind === INTENT_KIND.BROADCAST || intent?.kind === INTENT_KIND.LOOP) {
      dealt = strike(state, bandFrom(deadAir ? 2 * GRID : GRID), actionId, { perfect });
    }
    // THROW VOICE'S VERB: IT CHANGES WHAT IS COMING.
    // The decoy is the cheapest special in the bag and the only one that is not
    // about damage at all: the opponent commits to a blow against a recordist who
    // is not where it thought, and has to decide again. One charge turns a beat
    // you cannot answer into a fresh read — which is a different kind of answer
    // from a bigger swing, and the reason the radio is worth a slot.
    state.recommitted = true;
    notice = `THROW VOICE · PREVENT ${prevention}${dealt ? ` · ${dealt} COHERENCE` : ''} · THE ROOM DECIDES AGAIN`;
  } else if (actionId === COMBAT_ACTION.STEADY_HANDS) {
    state.coffeeUsed = true;
    const restored = Math.min(3 * GRID, state.maxComposure - state.composure);
    state.composure += restored;
    notice = `STEADY HANDS · ${restored} COMPOSURE RESTORED · CUP EMPTY`;
  } else if (actionId === COMBAT_ACTION.SHOUT) {
    // Your own voice, into the room, at the thing. Costs nothing, needs nothing,
    // counters nothing. The fight always has a way forward in it.
    dealt = strike(state, ACTION_BAND[actionId], actionId, { perfect });
    notice = `SHOUT · ${dealt} COHERENCE`;
  } else if (actionId === COMBAT_ACTION.WAIT) {
    // No move, no guard: the beat passes to the enemy with nothing spent.
    notice = 'HOLD POSITION';
  }

  if (perfect) {
    state.perfectCounters += 1;
    if (state.source) addSourcePoint(state, 1);
    // SECOND WIND (nerve): reading the fight keeps you in it — every perfect
    // counter restores a point of composure.
    if (hasTechnique(state, TECHNIQUE.SECOND_WIND) && state.composure < state.maxComposure) {
      state.composure = Math.min(state.maxComposure, state.composure + GRID);
      notice += ` · SECOND WIND +${GRID}`;
    }
    if (state.tuneBonus > 0) {
      const bonus = state.tuneBonus;
      dealt += applyDamageToEnemy(state, bonus, actionId);
      state.tuneBonus = 0;
      notice += ` · RESONANT +${bonus}`;
    }
    // Reading the opponent right is what pays for being loud. Specials are no
    // longer one apiece per encounter — they run on charge, and charge comes
    // from the counter triangle and from a timed parry. It ties the whole
    // special economy to the skill the fight is actually about, and it means a
    // player who is reading well gets to spend, while one who is not still has
    // every regular in the bag and can never be disarmed.
    const gained = earnCharge(state, 1);
    notice += gained ? ' · PERFECT RESPONSE · +1 CHARGE' : ' · PERFECT RESPONSE';
  } else if (!bonusAction) {
    state.missedCounters += 1;
  }

  // A counter that went through a set guard spends it anyway: the surfer
  // committed to slipping and the moment is gone.
  if (perfect && state.enemyGuard && dealt > 0 && !bonusAction) {
    state.enemyGuard = null;
    notice += ' · READ THROUGH THE GUARD';
  }

  maybeEarnProof(state, movement, actionId, perfect, takeBefore);

  if (state.definition.signature?.id === 'feedback'
      && actionId === COMBAT_ACTION.PLAYBACK
      && state.snr === SNR_STATE.NOISE
      && !state.feedbackMovements.includes(state.movementIndex)) {
    state.feedbackMovements.push(state.movementIndex);
    state.composure = Math.max(0, state.composure - GRID);
    state.damageTaken += GRID;
    enemyDamage += GRID;
    notice += ` · APPARITION RETURN -${GRID} COMPOSURE`;
  }

  // The surfer slips it. If it set to guard on its last beat (see advanceEnemy)
  // and you committed a swing, the hit is turned: a dodge gives the coherence
  // back, a parry gives it back AND nicks your composure. Setup moves (no damage)
  // slip past a guard — the read is not to swing into it. Spent once, then down.
  //
  // A PERFECT COUNTER GOES THROUGH IT. The guard is the opponent reading your
  // swing; a perfect counter is you reading its blow, and the better read wins.
  // Without this the fight punishes the single skill it is built to reward — a
  // player who answered the intent correctly watched the answer evaporate — and
  // it makes the guard baitable, which is what turns it from a tax into a tell:
  // spend it with a swing you do not mind losing, then counter into the opening.
  if (state.enemyGuard && dealt > 0 && !bonusAction && !perfect) {
    state.movementCoherence = coherenceBefore;   // exactly undoes the swing (even if it clamped)
    const parry = state.enemyGuard.mode === 'parry';
    const nick = parry ? Math.max(1, Math.round(dealt * 0.4)) : 0;
    if (nick) { state.composure = Math.max(0, state.composure - nick); state.damageTaken += nick; }
    state.last.enemyDodge = { mode: parry ? 'parry' : 'dodge', turned: dealt, nick };
    // The only MISS in the game, and it always has a visible cause: the opponent
    // set to slip you and you swung anyway. A hit is never graded MISS by a bad
    // draw, which is what keeps the bands feeling fair.
    state.last.quality = HIT_QUALITY.MISS;
    notice = `${notice} · ${parry ? `PARRIED · ${nick} TO COMPOSURE` : 'DODGED'}`;
    dealt = 0;
    state.enemyGuard = null;
  }

  const apparitionResult = state.last?.apparitions || null;
  if (apparitionResult?.parried?.length) notice += ` · PARRIED BY ${apparitionResult.parried.join(' / ').toUpperCase()}`;
  for (const redirect of (apparitionResult?.redirects || [])) {
    notice += ` · DEFLECTED INTO ${String(redirect.to).toUpperCase()} · ${redirect.damage}`;
  }
  if (apparitionResult?.defeated?.length) notice += ` · ${apparitionResult.defeated.length} APPARITION${apparitionResult.defeated.length === 1 ? '' : 'S'} DOWN`;

  // What the opponent learns from this beat. Recorded before the beat advances,
  // so the choice made in advanceIntent is made knowing it.
  state.read = observePlayerBeat(state.read || emptyEnemyRead(), {
    actionId: bonusAction ? null : actionId,
    perfect,
    kind: intent?.kind || null,
    takeHeld: !!state.take,
  });
  // A refused blow was still a blow it offered. advanceEnemy never runs on a
  // perfect counter, so this is the only place the opponent can notice.
  if (perfect && intent?.id) state.read = observeRefusal(state.read, intent.id);

  // ONE BEAT, ONE BAR — and the beat is HIS.
  //
  // This lived on the enemy resolution first, which meant any beat that did not
  // reach one (a defensive move, a skipped beat) left the playhead where it was
  // and the file stalled. The wing's clock is the man spending a beat in the
  // room, not the room answering him, because the room does not answer him.
  if (state.practice && !state.practice.stopped && !bonusAction) runPracticeBeat(state);

  if (state.composure <= 0) {
    state.last.notice = `${notice} · COMPOSURE LOST`;
    advanceIntent(state);
    finishCombat(state, 'lose');
  } else if (state.apparitions && hallApparitionsDefeated(state.apparitions)) {
    state.last.notice = `${notice} · ALL THREE APPARITIONS RELEASED`;
    finishCombat(state, 'win');
  } else if (state.movementCoherence <= 0) {
    state.last.notice = notice;
    completeMovement(state);
  } else if (bonusAction) {
    // TEMPO is a free action inside the opponent's cycle, not a second cycle.
    // It used to call advanceIntent because back then the perfect counter that
    // opened it did not — the enemy's committed blow was consumed without ever
    // being thrown. The enemy takes its beat now and commits the next one
    // itself, so advancing here would burn a second intent and walk the fight
    // out of step with what the player was shown.
    state.last.notice = notice;
    state.tempo = false;
  } else if (perfect) {
    // READING THE BEAT IS NOT THE SAME AS THE BEAT NOT HAPPENING.
    //
    // A perfect counter used to skip the opponent's turn outright — and then
    // hand over a bonus beat which skipped it again. Two player actions, zero
    // enemy actions, and the committed blow consumed without ever being thrown.
    // Measured against the real reducer, a competent recordist finished four of
    // the five battles having taken literally nothing: the fight was not easy
    // because its numbers were small, it was easy because a player who read
    // correctly could not be hit at all, and no number anywhere else in the
    // system could reach them.
    //
    // The blow lands now. What the read buys is the brace you meet it with —
    // which is the move's own prevention, so the counter triangle stops being
    // one binary and becomes a choice between answers that defend differently —
    // plus the charge, plus TEMPO on the other side of it. Still much the best
    // thing that can happen in a beat. No longer immunity.
    enemyDamage = 0;
    state.pendingEnemy = { prevention, playerDealt: dealt, playerNotice: notice, tempoAfter: true };
    if (state.apparitions) beginHallEnemyTurns(state.apparitions);
    state.phase = 'enemy';
    state.last.notice = `${notice} · READ HELD`;
  } else {
    // The player's beat is done; the opponent's turn is now pending. It is
    // resolved by advanceEnemy, not here — this is the one place the enemy used
    // to hit inside the same call, and moving it out is the whole enemy phase.
    // `enemyDamage` stays 0 for the player-step record; advanceEnemy sets the
    // real received. The recoil above (feedback signature) already touched
    // composure directly and is intentionally not re-counted, matching how the
    // old inline path overwrote enemyDamage before reporting it.
    enemyDamage = 0;
    state.pendingEnemy = { prevention, playerDealt: dealt, playerNotice: notice };
    if (state.apparitions) beginHallEnemyTurns(state.apparitions);
    state.phase = 'enemy';
    state.last.notice = `${notice} · ENEMY INCOMING`;
  }

  state.actionLog.push({
    turn: state.turns,
    movement: movement.id,
    action: actionId,
    intent: intent?.id || null,
    perfect,
    bonus: bonusAction,
    dealt,
    received: enemyDamage,
    snrFrom: snrShift.from,
    snrTo: snrShift.to,
  });
  Object.assign(state.last, {
    dealt,
    received: enemyDamage,
    composureFrom: composureBefore,
    composureTo: state.composure,
    coherenceFrom: coherenceBefore,
    coherenceTo: state.movementCoherence,
    snrFrom: snrShift.from,
    snrTo: snrShift.to,
    consumed: actionId === COMBAT_ACTION.STEADY_HANDS ? COMBAT_TOOL.COFFEE : null,
  });
  return state;
}

// The closed set of board conditions a movement's authored reactions can test.
// Pure over state, so selection stays deterministic and replayable.
function reactionMatches(state, reaction) {
  const threshold = integer(reaction?.threshold, 0);
  switch (reaction?.when) {
    case 'take-loaded': return !!state.take;
    case 'low-composure': return state.composure <= (threshold || 3 * GRID);
    case 'noise': return state.snr === SNR_STATE.NOISE;
    case 'silence': return state.snr === SNR_STATE.SILENCE;
    case 'signal': return state.snr === SNR_STATE.SIGNAL;
    case 'ringing': return !!state.ringing;
    default: return false;
  }
}

// The opponent's turn, as data: the blow it committed to, plus any extra hits
// that intent chains. This is a LOOKUP and must stay one — the choosing happens
// once, at commitNextIntent, a beat earlier. The scene calls this to name the
// blow and advanceEnemy calls it to resolve the same blow; if it decided
// anything, those two calls would disagree.
export function selectEnemyIntents(state) {
  const primary = currentCombatIntent(state);
  if (!primary) return [];
  if (state.apparitions) {
    const actor = activeHallApparition(state.apparitions) || liveHallApparitions(state.apparitions)[0] || null;
    return [{
      ...primary,
      actorId: actor?.id || null,
      actorLabel: actor?.label || 'APPARITION',
      actorSeat: actor?.seat || '',
    }];
  }
  const followups = Array.isArray(primary.followups) ? primary.followups : [];
  return [primary, ...followups];
}

// Resolve the pending enemy turn. Chains resolve in order; prevention only
// blunts the first hit (you braced for one blow, not a barrage). A KO ends the
// combat; otherwise the intent cursor advances and control returns to the
// player. Off-phase calls are a no-op so the scene can call it freely.
function advanceHallApparition(state, pending) {
  const actor = activeHallApparition(state.apparitions) || beginHallEnemyTurns(state.apparitions);
  if (!actor) {
    state.pendingEnemy = null;
    state.phase = 'select';
    return state;
  }

  let hits = [];
  if (state.skipEnemyBeat) {
    state.skipEnemyBeat = false;
  } else {
    // THROW VOICE changes this person's committed action without changing who
    // owns the initiative slot or rebuilding the rest of the round.
    if (state.recommitted) {
      state.recommitted = false;
      const authored = intentsFor(currentMovement(state), state.difficulty.variant);
      const at = authored.findIndex((intent) => intent.id === actor.intentId);
      if (authored.length) actor.intentId = authored[(at + 1 + authored.length) % authored.length].id;
    }
    const intents = selectEnemyIntents(state);
    let prevention = Math.max(0, integer(pending.prevention, 0));
    // A successful read applies to the whole coordinated phrase, not only the
    // first body in initiative. Splitting the old aggregate attack into three
    // actors must not silently triple the portion that escapes a perfect read.
    const readShare = pending.tempoAfter ? PERFECT_COUNTER_SHARE : 1;
    for (const intent of intents) {
      // Three individual attacks replace one aggregate crowd attack. Keeping a
      // fixed third-share preserves the encounter's authored damage budget even
      // after one member is defeated; losing an enemy never makes a survivor's
      // identical gesture mysteriously stronger.
      // Every body takes its own turn, so even a coordinated perfect read can
      // only blunt each strike to its minimum chip; it cannot erase two actors.
      const received = applyEnemyIntent(state, intent, prevention, readShare / 3, hits.length === 0);
      hits.push({ intentId: intent.id, kind: intent.kind, received, actorId: actor.id, actorLabel: actor.label });
      prevention = 0;
      if (state.composure <= 0) break;
    }
  }

  const totalReceived = hits.reduce((sum, hit) => sum + hit.received, 0);
  const skipped = hits.length === 0;
  const baseNotice = pending.firstEnemyResolved ? '' : (pending.playerNotice || state.last?.notice || '');
  state.actionLog.push({
    turn: state.turns,
    movement: currentMovement(state)?.id,
    action: 'enemy',
    actorId: actor.id,
    intent: hits[0]?.intentId || null,
    perfect: false,
    bonus: false,
    dealt: 0,
    received: totalReceived,
    enemyHits: hits,
  });
  Object.assign(state.last, {
    received: totalReceived,
    enemyHits: hits,
    enemyActor: { id: actor.id, label: actor.label, seat: actor.seat },
    composureTo: state.composure,
    notice: `${baseNotice}${baseNotice ? ' · ' : ''}${actor.label}${skipped ? ' MISSES ITS TURN' : totalReceived ? ` · ${totalReceived} COMPOSURE LOST` : ' · INTENT HELD'}`,
  });
  state.read = observeEnemyBeat(state.read || emptyEnemyRead(), { intentId: hits[0]?.intentId || null });
  state.stance = { ...(state.stance || openingStance()), dwell: integer(state.stance?.dwell, 0) + 1 };

  if (state.composure <= 0) {
    state.pendingEnemy = null;
    advanceIntent(state);
    finishCombat(state, 'lose');
    return state;
  }

  const next = advanceHallEnemyTurn(state.apparitions);
  if (next) {
    state.pendingEnemy = {
      ...pending,
      prevention: 0,
      playerNotice: '',
      firstEnemyResolved: true,
    };
    state.phase = 'enemy';
    return state;
  }

  armNextHallParry(state.apparitions);
  state.pendingEnemy = null;
  advanceIntent(state);
  state.phase = 'select';
  if (pending.tempoAfter) state.tempo = true;
  return state;
}

export function advanceEnemy(input) {
  const state = clone(input);
  if (state.phase !== 'enemy' || state.result) return state;
  const pending = state.pendingEnemy || { prevention: 0, playerNotice: '' };
  if (state.apparitions) return advanceHallApparition(state, pending);

  // RUNAWAY FEEDBACK deafened the room. The opponent's committed blow is not
  // cancelled — it is still written down, and it is still what lands next beat —
  // it simply does not get thrown this one. That is the difference between a
  // special that buys a turn and a special that erases a threat.
  if (state.skipEnemyBeat) {
    state.skipEnemyBeat = false;
    state.pendingEnemy = null;
    Object.assign(state.last, {
      received: 0,
      enemyHits: [],
      composureTo: state.composure,
      notice: `${pending.playerNotice || state.last?.notice || ''} · THE ROOM MISSES ITS BEAT`,
    });
    state.read = observeEnemyBeat(state.read || emptyEnemyRead(), { intentId: null });
    state.stance = { ...(state.stance || openingStance()), dwell: integer(state.stance?.dwell, 0) + 1 };
    state.phase = 'select';
    if (pending.tempoAfter) state.tempo = true;
    return state;
  }

  // THROW VOICE made it commit against somebody who was not there. It decides
  // again, from the board as it now stands — which is why a decoy is an answer
  // to a beat you cannot counter rather than a way to survive one.
  if (state.recommitted) {
    state.recommitted = false;
    state.committed = null;
    commitNextIntent(state);
  }

  const intents = selectEnemyIntents(state);
  const hits = [];
  let prevention = Math.max(0, integer(pending.prevention, 0));
  // A blow that was read still lands, but only as a chip. See the note in
  // reduceCombat's `perfect` branch: what a read buys is that the beat is
  // survivable, not that it did not happen.
  const share = pending.tempoAfter ? PERFECT_COUNTER_SHARE : 1;
  let first = true;
  for (const intent of intents) {
    const received = applyEnemyIntent(state, intent, prevention, share, first);
    hits.push({ intentId: intent.id, kind: intent.kind, received });
    prevention = 0;
    first = false;
    if (state.composure <= 0) break;
  }
  const totalReceived = hits.reduce((sum, hit) => sum + hit.received, 0);
  state.pendingEnemy = null;
  const baseNotice = pending.playerNotice || state.last?.notice || '';
  state.actionLog.push({
    turn: state.turns,
    movement: currentMovement(state)?.id,
    action: 'enemy',
    intent: hits[0]?.intentId || null,
    perfect: false,
    bonus: false,
    dealt: 0,
    received: totalReceived,
    enemyHits: hits,
  });
  Object.assign(state.last, {
    received: totalReceived,
    enemyHits: hits,
    composureTo: state.composure,
    notice: `${baseNotice}${totalReceived ? ` · ${totalReceived} COMPOSURE LOST` : ' · INTENT HELD'}`,
  });
  if (state.composure <= 0) {
    advanceIntent(state);
    finishCombat(state, 'lose');
  } else {
    // The surfer's defence, on the meaner difficulties only: once you've hurt it
    // and it is on the back foot in this movement, it sets to slip your next
    // committed swing (spent in reduceCombat). A reaction to being hit while low —
    // telegraphed, not a coin flip — so standard/guided fights never see it, and a
    // meaner surfer (dead-air) turns the hit back instead of only slipping it.
    //
    // Set BEFORE the beat advances, so the opponent chooses its next blow
    // knowing it is guarding. Deciding to guard and deciding what to throw are
    // one thought, and they happen in that order.
    // It used to key off composureBonus < 0, which meant it was a side effect of
    // a health number and CONTRACT never saw it at all. `enemyGuardCooldown` is
    // the gate now (see COMBAT_RULES): how many enemy beats must pass between
    // guards, or null for a surfer that never sets one.
    //
    // A cooldown rather than a chance, deliberately. The preconditions already
    // make this a reaction — it only sets after you have hurt it, and only while
    // it is on the back foot in this movement — and a player can watch that,
    // learn it, and bait it with a cheap swing. A hidden die could not be
    // learned, only resented.
    const cooldown = state.difficulty?.enemyGuardCooldown;
    const sinceGuard = integer(state.cycleIndex, 0) - integer(state.lastGuardBeat, -999);
    if (cooldown && !state.enemyGuard
        && sinceGuard >= cooldown
        && integer(pending.playerDealt, 0) > 0
        && state.movementMaxCoherence > 0
        && state.movementCoherence > 0
        && state.movementCoherence <= state.movementMaxCoherence * 0.5) {
      // A meaner surfer turns the hit back instead of only slipping it.
      state.enemyGuard = { mode: cooldown <= 1 ? 'parry' : 'dodge' };
      state.lastGuardBeat = integer(state.cycleIndex, 0);
    }
    // The mood only ages on beats the opponent actually took. A recordist
    // chaining perfect counters skips the enemy beat entirely, and if dwell
    // ticked there they could rush it through postures it never got to express.
    state.read = observeEnemyBeat(state.read || emptyEnemyRead(), { intentId: hits[0]?.intentId || null });
    state.stance = { ...(state.stance || openingStance()), dwell: integer(state.stance?.dwell, 0) + 1 };
    advanceIntent(state);
    state.phase = 'select';
    // The reward for the read, collected on the far side of the blow it read.
    // After advanceIntent, which clears tempo.
    if (pending.tempoAfter) state.tempo = true;
  }
  return state;
}

// One whole turn — player beat then enemy beat — as a single call, for headless
// callers (tests, winnability loops, AI). Because advanceEnemy carries the
// player's `dealt` through and sets `received`, the result's `last` has the
// same shape the atomic reducer used to return.
export function runCombatTurn(state, action) {
  let next = reduceCombat(state, action);
  // Headless callers ask for one complete round. The interactive scene still
  // calls advanceEnemy once per visible apparition turn.
  for (let guard = 0; next.phase === 'enemy' && !next.result && guard < 4; guard += 1) next = advanceEnemy(next);
  return next;
}

// What the battle UI draws and the thought trace talks about. Null outside the
// Hall's three-entity encounter.
export function combatApparitionsSnapshot(state, actionId = null) {
  if (!state?.apparitions) return null;
  return hallApparitionSnapshot(state.apparitions, {
    targetIds: combatApparitionTargetIds(state, actionId),
  });
}

export function combatPractice(state) {
  return practiceSnapshot(state?.practice || null);
}

export function combatApparitions(state) {
  return hallApparitionView(state?.apparitions || null);
}

export function combatResult(state) {
  return state?.result ? clone(state.result) : null;
}
