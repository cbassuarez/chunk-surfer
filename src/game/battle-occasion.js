// The two things a room fight needs to know about itself.
//
// The three recording battles — natatorium, hall, practice wing — were six
// documents: a `named` and an `unnamed` copy of each. Measured, the pairs
// differed by five lines in total, and the practice pair differed by a single
// word: "her" against "Sarah", across twenty-three otherwise identical lines.
// Worse, two of the three `unnamed` copies still labelled her speech `sarah`,
// so a fight in which the player had never said her name named her in every
// speaker slot anyway.
//
// There is one document per room now, and these are the two threads running
// through it.
//
// The pattern is the chapel's: resolve the question once in code, write the
// answer down as one flag, and let authored lines test that flag the same way
// every time. It beats authoring compound conditions against the raw
// confession flags — those have to express "named her" and "did not" as
// mirrored expressions, and the mirror is where they drift apart.

// ── who is speaking ─────────────────────────────────────────────────────────
//
// The confession at the grey door is the only place the player can offer a
// name, and Sarah is the only person it offers. Say it, and the thing in the
// room uses it: her lines are hers, and his own lines say her name out loud.
//
// Say anything else — or nothing — and the same lines are spoken by `unknown`.
// Not `direction`, and not silence: `unknown` is in the VOICED set precisely
// for this (see sam-voice.js), because it is a mouth he cannot account for and
// the whole horror is that he HEARS it. A typed line would be one of his own
// thoughts, which is a smaller scene.
export const BATTLE_NAMING_FLAG = 'battle.naming';

export function battleNaming({ kind = null, value = null } = {}) {
  return (kind === 'name' && String(value ?? '').trim() === 'Sarah') ? 'yes' : 'no';
}

// ── what kind of trouble this is ────────────────────────────────────────────
//
// The same room, holding the same thing, is not the same fight twice, and it
// used to play identical dialogue both times.
//
//   `recording-2` catches him forty seconds into a take with the meter live.
//     Winning means he HELD it: the take survives (`takeElapsed` is filled in),
//     losing spoils it. The stakes are the file.
//   `pre-recording-4` catches him between takes, in a room he only walked
//     towards, with the case still shut. There is no take to lose — so losing
//     injures him instead, and winning leaves him with nothing that can
//     corroborate what happened.
//
// The mechanics of that difference already existed at both call sites. Only
// the writing didn't know about it.
export const BATTLE_OCCASION_FLAG = 'battle.occasion';

export const BATTLE_OCCASIONS = Object.freeze(['recording-2', 'pre-recording-4']);
export const DEFAULT_BATTLE_OCCASION = 'recording-2';

export function battleOccasion(encounterId) {
  return BATTLE_OCCASIONS.includes(encounterId) ? encounterId : DEFAULT_BATTLE_OCCASION;
}

// The conditions an authored line uses to belong to one thread or the other.
export const namingCondition = (naming) => `${BATTLE_NAMING_FLAG} == ${naming}`;
export const occasionCondition = (occasion) => `${BATTLE_OCCASION_FLAG} == ${occasion}`;
