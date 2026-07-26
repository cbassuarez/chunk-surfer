import {
  CHAPEL_TOWER_PHASE,
  TOWER_RELAY_REQUIRED_INTERRUPTS,
  normalizeChapelTowerState,
} from './chapel-tower-state.js';

export function applyTowerRelayAdvantage(battle, towerState) {
  const tower = normalizeChapelTowerState(towerState);
  const relayBroken = [CHAPEL_TOWER_PHASE.TOWER_CLEARED, CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(tower.phase)
    && tower.relayInterruptions >= TOWER_RELAY_REQUIRED_INTERRUPTS
    && tower.shuttersReleased;
  if (!battle || !relayBroken) return battle;

  const combat = battle.combat || {};
  const movements = (combat.movements || []).map((movement, index) => index === 0
    ? {
      ...movement,
      coherence: Math.max(1, Number(movement.coherence || 1) - 1),
      before: [
        {
          who: 'direction',
          text: 'The chapel reaches for the tower carrier. The three broken relay clamps answer with silence.',
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
      towerRelayBroken: true,
    },
  };
}
