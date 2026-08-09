import {
  CHAPEL_TOWER_PHASE,
  normalizeChapelTowerState,
} from './chapel-tower-state.js';

export function applyTowerPealAdvantage(battle, towerState) {
  const tower = normalizeChapelTowerState(towerState);
  const pealSilenced = [CHAPEL_TOWER_PHASE.TOWER_CLEARED, CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(tower.phase)
    && tower.pealCompleted && tower.bellsStanding;
  if (!battle || !pealSilenced) return battle;

  const combat = battle.combat || {};
  const movements = (combat.movements || []).map((movement, index) => index === 0
    ? {
      ...movement,
      coherence: Math.max(1, Number(movement.coherence || 1) - 1),
      before: [
        {
          who: 'direction',
          text: 'The chapel reaches for the tower carrier. The completed touch answers with silence.',
        },
        ...(movement.before || []),
      ],
    }
    : movement);

  return {
    ...battle,
    intro: [
      {
        who: 'you',
        text: 'No bells. No carrier. You have to speak in this room now.',
      },
      ...(battle.intro || []),
    ],
    combat: {
      ...combat,
      baseComposure: Math.max(1, Number(combat.baseComposure || 8) + 2),
      movements,
      towerPealCompleted: true,
    },
  };
}
