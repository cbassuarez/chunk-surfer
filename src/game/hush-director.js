import { bestLocationHypothesis } from './hush-audition.js';

// WHAT IT MEANS TO DO ABOUT WHAT IT THINKS IT HEARD.
//
// `narrative.concealed` is the player behind cover, and it obeys the same law as
// everywhere else: it is never a fact about the HUSH, and it never tells it
// anything. It only WITHHOLDS THE UPGRADE. The two intents that are about a
// PERSON rather than a PLACE — STALK, which is following someone, and ENGULF,
// which is arriving on top of them — are the two it cannot form about a man it
// has not localised. Both fall back to the intent about the room.
//
// It comes to the room. It does not come to you.
export function chooseHushIntent({ audition, field, cooldowns = {}, narrative = {}, random = Math.random } = {}) {
  if (!narrative.enabled) return { kind: 'IGNORE' };
  const concealed = !!narrative.concealed;
  const target = bestLocationHypothesis(audition);
  if (!concealed && field?.absorption?.monitor >= .72 && audition?.certainty >= .5) {
    return { kind: 'ENGULF', intensity: field.absorption.monitor, target };
  }
  if (audition?.playfulness >= .56 && audition?.interest >= .30 && audition?.interest <= .88 && cooldowns.mischiefReady !== false && narrative.allowMischief !== false) {
    return { kind: 'PLAY', intensity: Math.max(.2, audition.interest), target, roll: random() };
  }
  if (!concealed && target && audition?.certainty >= .64) return { kind: 'STALK', target };
  if (target && audition?.interest >= .24) return { kind: 'INVESTIGATE', target };
  if (audition?.interest >= .08) return { kind: 'ORIENT', bearing: audition.lastHeard?.bearing || null };
  return { kind: 'IGNORE' };
}
