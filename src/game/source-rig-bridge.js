// What the rig is actually for.
//
// The rig used to be a gate: no rig, no fight, the fault sat there exposed and
// unopenable. That was the wrong shape. The thing at the fault does not check
// your equipment before it will argue with you — it argues with anyone who got
// hurt on the way in and then went and talked to it three times. Those are the
// gates, and they live in sourceBossAvailable().
//
// What the rig buys is leverage. With it he has an interface and can hold the
// last clause open while he decides where the return value goes; without it he
// is doing the same work by ear, into a monitor path that is already clipping.
// So it is composure and it is one notch off the final movement, and that is
// all it is.
//
// The one thing it still gates is the rescue — inverting the contract is the
// rig's whole purpose, and rescueEligible feeds bestEligible feeds
// route.surfaced. That gate stays where it is, in finalEncounterRequest().
//
// Modelled on applyTowerPealAdvantage() in tower-chapel-bridge.js, which does
// the same job for the peal against the chapel boss. Pure: no state, no audio,
// no save access.

import { GRID } from './combat-damage.js';

const RIG_MOVEMENT = 'final-clause';

export function applyRigAdvantage(battle, { hasRig = false } = {}) {
  if (!battle) return battle;
  const combat = battle.combat || {};

  if (!hasRig) {
    return {
      ...battle,
      intro: [
        { who: 'direction', text: 'The exposed fault reaches for an interface and finds a man with his hands empty.' },
        ...(battle.intro || []),
      ],
      combat: { ...combat, rigAdvantage: false },
    };
  }

  const movements = (combat.movements || []).map((movement) => movement.id === RIG_MOVEMENT
    ? {
      ...movement,
      // GRID units, like the tower's peal advantage: a fifth of the phase. A
      // bare 1 would be a twenty-fifth of it and the rig would buy nothing.
      coherence: Math.max(1, Number(movement.coherence || GRID) - GRID),
      before: [
        { who: 'direction', text: 'The clause reaches for its subject. The rig holds the line open long enough to see it go.' },
        ...(movement.before || []),
      ],
    }
    : movement);

  return {
    ...battle,
    intro: [
      { who: 'direction', text: 'The exposed fault takes the rig as an interface.' },
      ...(battle.intro || []),
    ],
    combat: {
      ...combat,
      baseComposure: Math.max(1, Number(combat.baseComposure || 8 * GRID) + 2 * GRID),
      movements,
      rigAdvantage: true,
    },
  };
}
