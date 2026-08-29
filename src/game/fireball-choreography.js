// SYNCHRONISED SWIMMERS.
//
// A cast surface that sits still is a click test. Four of them that sense the
// cursor coming, break together, and reform is a thing you have to read -- and
// reading it is the same skill the rest of the fight is asking for, so the
// ranged exchange stops being a side minigame with a mouse in it.
//
// TWO RULES MAKE IT FAIR RATHER THAN CRUEL.
//
// The first is that they only run from where the cursor is GOING, not from
// where it is. A shoal that repels from the pointer's current position is
// unloseable at low speed and unwinnable at high speed; one that repels from
// the pointer's predicted position can be beaten by aiming at where it will be,
// which is a decision instead of a race.
//
// The second is that the dodge always ends. Every cycle is a break followed by
// a settle, and during the settle they hold perfectly still and can simply be
// clicked. The settle is not a mercy that shrinks as things get harder -- it
// GROWS with the difficulty, because the harder the break is to read the longer
// you are owed to act on having read it. What gets worse is the darting, not
// the chance.
//
// THE CURVE IS A STAIRCASE OF S-CURVES.
//
// Difficulty is sampled once per turn, so within a turn the choreography never
// changes under the player's hand -- that is the step. Across turns it follows a
// logistic rather than a line: the first fight is nearly still, the middle of
// the night is where it actually turns, and the last fight approaches its
// ceiling without ever quite reaching it, so there is no turn at which it stops
// getting worse.

// The night, in the order the fights are met. A fight's position in this list
// is most of what decides how hard its windows are to catch.
export const FIREBALL_BATTLE_ORDER = Object.freeze([
  'natatorium', 'hall', 'practice', 'chapel', 'source-final',
]);

// Roughly how much of a fight one turn is. Only the ratio matters: it is what
// spreads a single fight's escalation across its own length so the last turn of
// the natatorium is meaningfully worse than its first.
const TURNS_PER_FIGHT = 12;

// How sharply the logistic turns. Low enough that the first fight is close to
// still and the last is close to the ceiling, steep enough that the middle of
// the night is where the change is felt.
const STEEPNESS = 7.4;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const whole = (value) => Math.max(0, Math.floor(Number(value) || 0));

export function fireballBattleOrdinal(battleId = '') {
  const index = FIREBALL_BATTLE_ORDER.indexOf(String(battleId || ''));
  return index < 0 ? 0 : index;
}

// 0 on the first turn of the first fight, approaching 1 on the last turn of the
// last. Continuous in the inputs and quantised by `turn`, which is the step.
export function fireballPressure({ battleId = '', battleOrdinal = null, turn = 0 } = {}) {
  const fights = FIREBALL_BATTLE_ORDER.length;
  const ordinal = Math.min(fights - 1, battleOrdinal == null ? fireballBattleOrdinal(battleId) : whole(battleOrdinal));
  // Each fight owns one slot of the night; the turn walks across its own slot.
  const within = Math.min(1, whole(turn) / TURNS_PER_FIGHT);
  const t = clamp01((ordinal + within) / fights);
  // Logistic, normalised so t=0 really is 0 and t=1 really is 1 rather than
  // starting the night already a third of the way up.
  const raw = (x) => 1 / (1 + Math.exp(-STEEPNESS * (x - .5)));
  const low = raw(0), high = raw(1);
  return clamp01((raw(t) - low) / Math.max(1e-6, high - low));
}

// What the shoal does at that pressure. Every number here is milliseconds or a
// unit scalar, and every one of them is read by the native side rather than
// being re-derived there.
export function fireballChoreography({ battleId = '', battleOrdinal = null, turn = 0, reducedMotion = false } = {}) {
  const pressure = reducedMotion ? 0 : fireballPressure({ battleId, battleOrdinal, turn });
  return Object.freeze({
    pressure,
    // How hard they break. 0 is a window that has never heard of you.
    evasion: pressure,
    // How far ahead of the cursor they aim. A still pointer predicts to itself,
    // so this only bites once you commit to a direction.
    senseMs: 70 + pressure * 210,
    // How far they will travel to get out of the way, as a multiple of their
    // own width -- so the shoal never teleports across the desk.
    reach: .55 + pressure * 1.85,
    // Break, then hold. Both grow, but the settle grows faster: the harder the
    // break is to read, the longer you are owed to act on having read it.
    breakMs: 240 + pressure * 460,
    settleMs: 300 + pressure * 900,
    // How much of the movement is the whole shoal moving as one body versus
    // each surface fanning on its own. High cohesion late: by the last fight
    // they are a formation, not four independent nuisances.
    cohesion: .5 + pressure * .5,
  });
}

// Where in the break/settle cycle a cast is, given how long it has been outside
// the frame. Shared by every surface in the cast -- that is what makes them
// swimmers rather than four things that happen to be dodging.
export function fireballCyclePhase(elapsedSeconds = 0, { breakMs = 240, settleMs = 300 } = {}) {
  const period = Math.max(1, Number(breakMs) || 0) + Math.max(1, Number(settleMs) || 0);
  const at = (Math.max(0, Number(elapsedSeconds) || 0) * 1000) % period;
  const breaking = at < breakMs;
  return Object.freeze({
    breaking,
    settled: !breaking,
    // 0 at the start of the break, 1 at the end of it. Eased so they accelerate
    // out and coast back rather than snapping between two positions.
    travel: breaking ? Math.sin((at / Math.max(1, breakMs)) * Math.PI) : 0,
    // How long the player still has, for anything that wants to say so.
    settleLeftMs: breaking ? 0 : period - at,
  });
}
