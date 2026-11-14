// A presentation of the existing body state, never a second resource owner.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function playerCondition({composure, ceiling, baseline = 40, injuries = 0, combat = false, owner = null} = {}) {
  const source = typeof owner === 'string' && owner ? owner : combat ? 'combat' : 'world';
  const available = finite(composure) && finite(ceiling) && ceiling > 0
    && finite(baseline) && baseline > 0 && finite(injuries) && injuries >= 0;
  if (!available) return Object.freeze({available:false, value:null, ceiling:null, baseline:null,
    injuries:null, combat:!!combat, owner:source, capacityLoss:null, strain:null, strainRatio:null,
    strainStatus:'unavailable', woundStatus:'unavailable'});

  const value = clamp(composure, 0, ceiling), count = Math.floor(injuries);
  const strain = ceiling - value, strainRatio = strain / ceiling;
  return Object.freeze({available:true, value, ceiling, baseline, injuries:count,
    combat:!!combat, owner:source, capacityLoss:Math.max(0, baseline - ceiling), strain, strainRatio,
    strainStatus:strain === 0 ? 'steady' : value <= ceiling * .25 ? 'depleted'
      : value <= ceiling * .5 ? 'shaken' : 'strained',
    woundStatus:count > 0 ? 'injured' : 'uninjured'});
}

// Changing presenters, loading a save, or gaining capacity is not a blow.
export function comparePlayerCondition(previous, next, {hydrating = false, ownerChanged = false} = {}) {
  if (hydrating || ownerChanged || !previous?.available || !next?.available
    || previous.owner !== next.owner || previous.combat !== next.combat) return null;
  const injuriesAdded = next.injuries - previous.injuries;
  if (injuriesAdded < 0 || previous.baseline !== next.baseline) return null;
  const capacityLost = Math.max(0, previous.ceiling - next.ceiling);
  if (previous.ceiling !== next.ceiling && !(injuriesAdded > 0 && next.ceiling < previous.ceiling)) return null;

  const injuryClamp = injuriesAdded > 0 ? Math.max(0, previous.value - next.ceiling) : 0;
  const damage = Math.max(0, previous.value - next.value - injuryClamp);
  const recovery = injuriesAdded > 0 ? 0 : Math.max(0, next.value - previous.value);
  if (!injuriesAdded && !damage && !recovery) return null;
  return Object.freeze({kind:injuriesAdded > 0 ? 'injury' : damage > 0 ? 'damage' : 'recovery',
    damage, recovery, injuriesAdded, capacityLost, before:previous.value, after:next.value});
}
