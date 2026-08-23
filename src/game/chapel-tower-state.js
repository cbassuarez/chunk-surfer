export const CHAPEL_TOWER_PHASE = Object.freeze({
  FORESHADOW: 'foreshadow',
  SOURCE_READY: 'source_ready',
  TRANSITION_READY: 'transition_ready',
  TOWER_ACTIVE: 'tower_active',
  TOWER_CLEARED: 'tower_cleared',
  CHAPEL_FINAL: 'chapel_final',
});

export const TOWER_PEAL_STAGE = Object.freeze({
  LOCATE: 'locate',
  SOURCE: 'source',
  TRANSITION: 'transition',
  TAKE_TENOR: 'take_tenor',
  PERFORM: 'perform',
  STANDING: 'standing',
  DESCEND: 'descend',
  CHAPEL: 'chapel',
});

export const TOWER_STEDMAN_ROWS = 84;
// Compatibility exports for debug tooling and older callers. They now describe
// thirds of the Stedman touch rather than physical relay clamps.
export const TOWER_RELAY_STAGE = TOWER_PEAL_STAGE;
export const TOWER_RELAY_REQUIRED_INTERRUPTS = 3;

const PHASES = new Set(Object.values(CHAPEL_TOWER_PHASE));

export function freshChapelTowerState() {
  return {
    schema: 4,
    layoutSchema: 2,
    legacyLayout: false,
    phase: CHAPEL_TOWER_PHASE.FORESHADOW,
    corridorDiscovered: false,
    tenorRopeTaken: false,
    tenorRowsCompleted: 0,
    tenorMisses: 0,
    pealCompleted: false,
    bellsStanding: false,
    transportElapsedMs: 0,
    transportMode: 'dormant',
    transportWashMs: 0,
    transportTransitionProgress: 0,
    attempts: 0,
    chapelReached: false,
  };
}

export function normalizeChapelTowerState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const phase = PHASES.has(source.phase) ? source.phase : CHAPEL_TOWER_PHASE.FORESHADOW;
  const legacy=Number(source.schema||0)<4;
  const migratedRows=legacy
    ? Math.min(TOWER_STEDMAN_ROWS,Math.max(0,Math.floor(Number(source.relayInterruptions)||0))*28)
    : Math.max(0,Math.min(TOWER_STEDMAN_ROWS,Math.floor(Number(source.tenorRowsCompleted)||0)));
  const cleared=[CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(phase);
  const migratedComplete=cleared||!!source.pealCompleted||(legacy&&(!!source.shuttersReleased||Number(source.relayInterruptions)>=3));
  return {
    ...freshChapelTowerState(),
    schema:4,
    layoutSchema:2,
    legacyLayout:!!source.legacyLayout||Number(source.layoutSchema??source.schema??1)<2,
    phase,
    corridorDiscovered:!!source.corridorDiscovered,
    tenorRopeTaken:!!source.tenorRopeTaken,
    tenorRowsCompleted:migratedComplete?TOWER_STEDMAN_ROWS:migratedRows,
    tenorMisses:Math.max(0,Math.floor(Number(source.tenorMisses)||0)),
    pealCompleted:migratedComplete,
    bellsStanding:cleared||!!source.bellsStanding,
    transportElapsedMs:Math.max(0,Number(source.transportElapsedMs)||0),
    transportMode:typeof source.transportMode==='string'?source.transportMode:(phase===CHAPEL_TOWER_PHASE.FORESHADOW?'dormant':'world'),
    transportWashMs:Math.max(0,Number(source.transportWashMs)||0),
    transportTransitionProgress:Math.max(0,Math.min(1,Number(source.transportTransitionProgress)||0)),
    attempts: Math.max(0, Math.floor(Number(source.attempts) || 0)),
    chapelReached: phase === CHAPEL_TOWER_PHASE.CHAPEL_FINAL || !!source.chapelReached,
  };
}

export function towerPealStage(value) {
  const state = normalizeChapelTowerState(value);
  if (state.phase === CHAPEL_TOWER_PHASE.CHAPEL_FINAL || state.chapelReached) return TOWER_PEAL_STAGE.CHAPEL;
  if (state.phase === CHAPEL_TOWER_PHASE.TOWER_CLEARED) return TOWER_PEAL_STAGE.DESCEND;
  if (state.phase === CHAPEL_TOWER_PHASE.FORESHADOW) return TOWER_PEAL_STAGE.LOCATE;
  if (state.phase === CHAPEL_TOWER_PHASE.SOURCE_READY) return state.corridorDiscovered?TOWER_PEAL_STAGE.SOURCE:TOWER_PEAL_STAGE.LOCATE;
  if (state.phase === CHAPEL_TOWER_PHASE.TRANSITION_READY) return TOWER_PEAL_STAGE.TRANSITION;
  if (state.phase !== CHAPEL_TOWER_PHASE.TOWER_ACTIVE || !state.tenorRopeTaken) return TOWER_PEAL_STAGE.TAKE_TENOR;
  if (!state.pealCompleted) return TOWER_PEAL_STAGE.PERFORM;
  return TOWER_PEAL_STAGE.STANDING;
}
export const towerRelayStage=towerPealStage;

export function towerObjective(value) {
  const state = normalizeChapelTowerState(value);
  if (state.phase === CHAPEL_TOWER_PHASE.SOURCE_READY) {
    return state.corridorDiscovered
      ? { id: 'enter-source', label: 'ENTER SOURCE AT THE INNER SCREEN' }
      : { id: 'locate-bells', label: 'LOCATE THE BELLS' };
  }
  if (state.phase === CHAPEL_TOWER_PHASE.TRANSITION_READY) {
    return { id: 'follow-signal', label: 'FOLLOW THE SIGNAL INTO THE TOWER' };
  }
  if (state.phase === CHAPEL_TOWER_PHASE.TOWER_ACTIVE) {
    if (!state.tenorRopeTaken) return { id: 'take-tenor', label: 'TAKE THE TENOR ROPE' };
    if (!state.pealCompleted) return { id: 'ring-stedman', label: `RING STEDMAN  ${state.tenorRowsCompleted} / ${TOWER_STEDMAN_ROWS}` };
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
    return { ...freshChapelTowerState(), phase: CHAPEL_TOWER_PHASE.CHAPEL_FINAL, pealCompleted:true, bellsStanding:true, tenorRowsCompleted:TOWER_STEDMAN_ROWS };
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
      return state;

    case 'BELL_HATCH_INSPECTED':
      return state;

    case 'CLOCK_HAMMER_ISOLATED':
      return state;

    case 'FOURTH_TAKE_COMPLETED':
      return state.phase === CHAPEL_TOWER_PHASE.FORESHADOW
        ? { ...state, phase: CHAPEL_TOWER_PHASE.SOURCE_READY, transportMode:'world', transportWashMs:0, transportTransitionProgress:0 }
        : state;

    case 'CHAPEL_CORRIDOR_REACHED':
      return {...state,corridorDiscovered:true};

    case 'BELL_TRANSPORT_SAVED':
      return {
        ...state,
        transportElapsedMs:Math.max(0,Number(event.elapsedMs)||0),
        transportMode:String(event.mode||state.transportMode),
        transportWashMs:Math.max(0,Number(event.washMs??state.transportWashMs)||0),
        transportTransitionProgress:Math.max(0,Math.min(1,Number(event.transitionProgress??state.transportTransitionProgress)||0)),
      };

    case 'SOURCE_COMPLETED':
      assertPhase(state, CHAPEL_TOWER_PHASE.SOURCE_READY, event.type);
      return { ...state, phase: CHAPEL_TOWER_PHASE.TRANSITION_READY };

    case 'TRANSITION_COMMITTED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TRANSITION_READY, event.type);
      return {
        ...state,
        phase: CHAPEL_TOWER_PHASE.TOWER_ACTIVE,
        tenorRopeTaken:false,
        chapelReached: false,
        transportMode:'tower',
        transportTransitionProgress:1,
      };

    case 'TOWER_COLLISION':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      return { ...state, attempts: state.attempts + 1 };

    case 'TENOR_ROPE_TAKEN':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      return {...state,tenorRopeTaken:true};

    case 'TENOR_ROW_COMPLETED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      return {...state,tenorRowsCompleted:Math.max(state.tenorRowsCompleted,Math.min(TOWER_STEDMAN_ROWS,Math.floor(Number(event.row)||state.tenorRowsCompleted+1)))};

    case 'TENOR_MISSED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      return {...state,tenorMisses:state.tenorMisses+1};

    case 'PEAL_COMPLETED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      return {...state,tenorRowsCompleted:TOWER_STEDMAN_ROWS,pealCompleted:true};

    case 'BELLS_STOOD':
      assertPhase(state, CHAPEL_TOWER_PHASE.TOWER_ACTIVE, event.type);
      if (!state.pealCompleted) {
        throw new Error('chapel tower: BELLS_STOOD requires completed peal');
      }
      return {
        ...state,
        phase: CHAPEL_TOWER_PHASE.TOWER_CLEARED,
        bellsStanding:true,
        transportMode:'stood',
        transportTransitionProgress:1,
      };

    // The tape let him off at the nave instead of the stair. The tower route is
    // spent without ever having been rung — no peal, no bells standing, so
    // applyTowerPealAdvantage() declines on its own and he walks into the chapel
    // with the carrier still live. That is the cost of not taking the detour,
    // and the bust did tell him.
    case 'TOWER_BYPASSED':
      assertPhase(state, CHAPEL_TOWER_PHASE.TRANSITION_READY, event.type);
      return {
        ...state,
        phase: CHAPEL_TOWER_PHASE.TOWER_CLEARED,
        pealCompleted: false,
        bellsStanding: false,
        chapelReached: true,
        transportMode: 'world',
        transportTransitionProgress: 0,
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
