import { bestLocationHypothesis } from './hush-audition.js';

export function chooseHushIntent({ audition, field, cooldowns = {}, narrative = {}, random = Math.random } = {}) {
  if (!narrative.enabled) return { kind: 'IGNORE' };
  const target = bestLocationHypothesis(audition);
  if (field?.absorption?.monitor >= .72 && audition?.certainty >= .5) {
    return { kind: 'ENGULF', intensity: field.absorption.monitor, target };
  }
  if (audition?.playfulness >= .56 && audition?.interest >= .30 && audition?.interest <= .88 && cooldowns.mischiefReady !== false && narrative.allowMischief !== false) {
    return { kind: 'PLAY', intensity: Math.max(.2, audition.interest), target, roll: random() };
  }
  if (target && audition?.certainty >= .64) return { kind: 'STALK', target };
  if (target && audition?.interest >= .24) return { kind: 'INVESTIGATE', target };
  if (audition?.interest >= .08) return { kind: 'ORIENT', bearing: audition.lastHeard?.bearing || null };
  return { kind: 'IGNORE' };
}
