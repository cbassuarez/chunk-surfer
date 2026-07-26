export const CHAPEL_TOWER_PHASE = Object.freeze({
  FORESHADOW: 'foreshadow',
  SOURCE_READY: 'source_ready',
  TRANSITION_READY: 'transition_ready',
  TOWER_ACTIVE: 'tower_active',
  TOWER_CLEARED: 'tower_cleared',
  CHAPEL_FINAL: 'chapel_final',
});

export const TOWER_RELAY_STAGE = Object.freeze({
  DIAGNOSE: 'diagnose',
  INTERRUPT: 'interrupt',
  RELEASE: 'release',
  SETTLING: 'settling',
  DESCEND: 'descend',
  CHAPEL: 'chapel',
});

export const TOWER_RELAY_REQUIRED_INTERRUPTS = 3;

const PHASES = new Set(Object.values(CHAPEL_TOWER_PHASE));

export function freshChapelTowerState() {
  return {
    schema: 3,
    layoutSchema: 2,
    legacyLayout: false,
    phase: CHAPEL_TOWER_PHASE.FORESHADOW,
    ropeRoomVisited: false,
    hatchInspected: false,
    hammerIsolated: false,
    relayInterruptions: 0,
    attempts: 0,
    shuttersReleased: false,
    chapelReached: false,
  };
}

export function normalizeChapelTowerState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const phase = PHASES.has(source.phase) ? source.phase : CHAPEL_TOWER_PHASE.FORESHADOW;
  return {
    ...freshChapelTowerState(),
    schema:3,
    layoutSchema:2,
    legacyLayout:!!source.legacyLayout||Number(source.layoutSchema??source.schema??1)<2,
    phase,
    ropeRoomVisited: !!source.ropeRoomVisited,
    hatchInspected: !!source.hatchInspected,
    hammerIsolated: !!source.hammerIsolated,
    relayInterruptions: Math.max(0, Math.min(
      TOWER_RELAY_REQUIRED_INTERRUPTS,
      Math.floor(Number(source.relayInterruptions) || 0),
    )),
    attempts: Math.max(0, Math.floor(Number(source.attempts) || 0)),
    shuttersReleased: phase === CHAPEL_TOWER_PHASE.TOWER_CLEARED
      || phase === CHAPEL_TOWER_PHASE.CHAPEL_FINAL
      || !!source.shuttersReleased,
    chapelReached: phase === CHAPEL_TOWER_PHASE.CHAPEL_FINAL || !!source.chapelReached,
  };
}

export function towerDiagnosisComplete(value) {
  const state = normalizeChapelTowerState(value);
  return state.ropeRoomVisited && state.hatchInspected && state.hammerIsolated;
}

export function towerRelayStage(value) {
  const state = normalizeChapelTowerState(value);
  if (state.phase === CHAPEL_TOWER_PHASE.CHAPEL_FINAL || state.chapelReached) return TOWER_RELAY_STAGE.CHAPEL;
  if (state.phase === CHAPEL_TOWER_PHASE.TOWER_CLEARED) return TOWER_RELAY_STAGE.DESCEND;
  if (state.phase !== CHAPEL_TOWER_PHASE.TOWER_ACTIVE || !towerDiagnosisComplete(state)) return TOWER_RELAY_STAGE.DIAGNOSE;
  if (state.relayInterruptions < TOWER_RELAY_REQUIRED_INTERRUPTS) return TOWER_RELAY_STAGE.INTERRUPT;
  if (!state.shuttersReleased) return TOWER_RELAY_STAGE.RELEASE;
  return TOWER_RELAY_STAGE.SETTLING;
}

export function towerObjective(value) {
  const state = normalizeChapelTowerState(value);
  if (state.phase === CHAPEL_TOWER_PHASE.SOURCE_READY) {
    return { id: 'enter-source', label: 'ENTER SOURCE AT THE CHAPEL SCREEN' };
  }
  if (state.phase === CHAPEL_TOWER_PHASE.TRANSITION_READY) {
    return { id: 'follow-signal', label: 'FOLLOW THE SIGNAL INTO THE TOWER' };
  }
  if (state.phase === CHAPEL_TOWER_PHASE.TOWER_ACTIVE) {
    if (!state.ropeRoomVisited) return { id: 'ringing-room', label: 'ENTER THE RINGING ROOM' };
    if (!state.hammerIsolated) return { id: 'clock-hammer', label: 'ISOLATE THE CLOCK HAMMER' };
    if (!state.hatchInspected) return { id: 'belfry-hatch', label: 'INSPECT THE BELFRY HATCH' };
    if (state.relayInterruptions < TOWER_RELAY_REQUIRED_INTERRUPTS) {
      return {
        id: 'break-relay',
        label: `BREAK THE BELL RELAY  ${state.relayInterruptions} / ${TOWER_RELAY_REQUIRED_INTERRUPTS}`,
      };
    }
    if (!state.shuttersReleased) return { id: 'release-winch', label: 'RELEASE THE SHUTTER WINCH' };
    return { id: 'bells-settling', label: 'STAND CLEAR — BELLS SETTLING' };
  }
  if (state.phase === CHAPEL_TOWER_PHASE.TOWER_CLEARED) {
    return state.chapelReached
      ? { id: 'roll-fifth-take', label: 'ROLL THE FIFTH TAKE' }
      : { id: 'descend-nave', label: 'DESCEND TO THE NAVE' };
  }
  if (state.phase === CHAPEL_TOWER_PHASE.CHAPEL_FINAL) {
    return { id: 'chapel-final', label: 'CONFRONT THE CHAPEL SIGNAL' };
  }
  return { id: 'tower-dormant', label: 'THE TOWER IS QUIET' };
}

export function chapelTowerKeyring(value) {
  const phase = normalizeChapelTowerState(value).phase;
  const keys = [];
  if ([CHAPEL_TOWER_PHASE.TOWER_ACTIVE, CHAPEL_TOWER_PHASE.TOWER_CLEARED, CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(phase)) {
    keys.push('tower-live');
  }
  if ([CHAPEL_TOWER_PHASE.TOWER_CLEARED, CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(phase)) {
    keys.push('tower-cleared');
  }
  return keys;
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
      return {
        ...state,
        phase: CHAPEL_TOWER_PHASE.TOWER_ACTIVE,
        relayInterruptions: 0,
        shuttersReleased: false,
        chapelReached: false,
      };

    case 'TOWER_COLLISION':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      return { ...state, attempts: state.attempts + 1 };

    case 'RELAY_INTERRUPTED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      if (!towerDiagnosisComplete(state)) {
        throw new Error('chapel tower: RELAY_INTERRUPTED requires complete diagnosis');
      }
      return {
        ...state,
        relayInterruptions: Math.min(
          TOWER_RELAY_REQUIRED_INTERRUPTS,
          state.relayInterruptions + 1,
        ),
      };

    case 'SHUTTERS_RELEASED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      if (state.relayInterruptions < TOWER_RELAY_REQUIRED_INTERRUPTS) {
        throw new Error('chapel tower: SHUTTERS_RELEASED requires interrupted relay');
      }
      return { ...state, shuttersReleased: true };

    case 'BELLS_STOOD':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      if (!state.shuttersReleased) {
        throw new Error('chapel tower: BELLS_STOOD requires released shutters');
      }
      return {
        ...state,
        phase: CHAPEL_TOWER_PHASE.TOWER_CLEARED,
        shuttersReleased: true,
      };

    case 'CHAPEL_REACHED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_CLEARED, event.type);
      return { ...state, chapelReached: true };

    case 'CHAPEL_FINALE_STARTED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_CLEARED, event.type);
      return { ...state, phase: CHAPEL_TOWER_PHASE.CHAPEL_FINAL, chapelReached: true };

    default:
      return state;
  }
}

export function towerPhaseAtLeast(value, phase) {
  const order = Object.values(CHAPEL_TOWER_PHASE);
  return order.indexOf(normalizeChapelTowerState(value).phase) >= order.indexOf(phase);
}
