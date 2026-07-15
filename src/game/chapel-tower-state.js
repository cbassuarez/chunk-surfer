export const CHAPEL_TOWER_PHASE = Object.freeze({
  FORESHADOW: 'foreshadow',
  SOURCE_READY: 'source_ready',
  TRANSITION_READY: 'transition_ready',
  TOWER_ACTIVE: 'tower_active',
  TOWER_CLEARED: 'tower_cleared',
  CHAPEL_FINAL: 'chapel_final',
});

const PHASES = new Set(Object.values(CHAPEL_TOWER_PHASE));

export function freshChapelTowerState() {
  return {
    schema: 2,
    layoutSchema: 2,
    legacyLayout: false,
    phase: CHAPEL_TOWER_PHASE.FORESHADOW,
    ropeRoomVisited: false,
    hatchInspected: false,
    hammerIsolated: false,
    attempts: 0,
    shuttersReleased: false,
  };
}

export function normalizeChapelTowerState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const phase = PHASES.has(source.phase) ? source.phase : CHAPEL_TOWER_PHASE.FORESHADOW;
  return {
    ...freshChapelTowerState(),
    schema:2,
    layoutSchema:2,
    legacyLayout:!!source.legacyLayout||Number(source.layoutSchema??source.schema??1)<2,
    phase,
    ropeRoomVisited: !!source.ropeRoomVisited,
    hatchInspected: !!source.hatchInspected,
    hammerIsolated: !!source.hammerIsolated,
    attempts: Math.max(0, Math.floor(Number(source.attempts) || 0)),
    shuttersReleased: phase === CHAPEL_TOWER_PHASE.TOWER_CLEARED
      || phase === CHAPEL_TOWER_PHASE.CHAPEL_FINAL
      || !!source.shuttersReleased,
  };
}

export function inferLegacyChapelTower(source = {}) {
  const takes=Array.isArray(source.rec?.takes)?source.rec.takes:(source.takes||[]);
  if (
    takes.includes?.('lux_nova')
    || source.encounters?.cleared?.includes?.('chapel')
  ) {
    return { ...freshChapelTowerState(), phase: CHAPEL_TOWER_PHASE.CHAPEL_FINAL, shuttersReleased: true };
  }

  if (source.flags?.['chunkSurf.completed']) {
    return { ...freshChapelTowerState(), phase: CHAPEL_TOWER_PHASE.TRANSITION_READY };
  }

  const ordinaryTakes = takes.filter((id) => id && id !== 'lux_nova').length;
  if (ordinaryTakes >= 4) {
    return { ...freshChapelTowerState(), phase: CHAPEL_TOWER_PHASE.SOURCE_READY };
  }

  return freshChapelTowerState();
}

function assertPhase(state, expected, eventType) {
  if (state.phase !== expected) {
    throw new Error(`chapel tower: ${eventType} requires ${expected}, got ${state.phase}`);
  }
}

export function reduceChapelTower(value, event = {}) {
  const state = normalizeChapelTowerState(value);

  switch (event.type) {
    case 'ROPE_ROOM_VISITED':
      return { ...state, ropeRoomVisited: true };

    case 'BELL_HATCH_INSPECTED':
      return { ...state, hatchInspected: true };

    case 'CLOCK_HAMMER_ISOLATED':
      return { ...state, hammerIsolated: true };

    case 'FOURTH_TAKE_COMPLETED':
      return state.phase === CHAPEL_TOWER_PHASE.FORESHADOW
        ? { ...state, phase: CHAPEL_TOWER_PHASE.SOURCE_READY }
        : state;

    case 'SOURCE_COMPLETED':
      assertPhase(state, CHAPEL_TOWER_PHASE.SOURCE_READY, event.type);
      return { ...state, phase: CHAPEL_TOWER_PHASE.TRANSITION_READY };

    case 'TRANSITION_COMMITTED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TRANSITION_READY, event.type);
      return { ...state, phase: CHAPEL_TOWER_PHASE.TOWER_ACTIVE, shuttersReleased: false };

    case 'TOWER_COLLISION':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      return { ...state, attempts: state.attempts + 1 };

    case 'SHUTTERS_RELEASED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      return { ...state, shuttersReleased: true };

    case 'BELLS_STOOD':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      return {
        ...state,
        phase: CHAPEL_TOWER_PHASE.TOWER_CLEARED,
        shuttersReleased: true,
      };

    case 'CHAPEL_FINALE_STARTED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_CLEARED, event.type);
      return { ...state, phase: CHAPEL_TOWER_PHASE.CHAPEL_FINAL };

    default:
      return state;
  }
}

export function towerPhaseAtLeast(value, phase) {
  const order = Object.values(CHAPEL_TOWER_PHASE);
  return order.indexOf(normalizeChapelTowerState(value).phase) >= order.indexOf(phase);
}
