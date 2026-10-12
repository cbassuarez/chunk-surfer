import { COMBAT_ACTION, COMBAT_TOOL } from './combat-state.js';

const bounded = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));

// The hands need the uneased action clock: applying the HUD's ease-out here
// makes a fingertip arrive before the REC press and a guard miss its contact.
// Enemy SELF is the attacker's tool, not an instruction to drop our equipment.
export function combatHandsSnapshot({
  selectedTool = COMBAT_TOOL.SELF,
  resolution = null,
  phase = 'tool',
  time = 0,
  injury = 'steady',
  snr = 'signal',
  hurt = 0,
  parry = null,
  reducedMotion = false,
  wet = 0,
  cosmetics = null,
  take = null,
  meter = null,
} = {}) {
  const action = resolution?.action || null;
  const actionActor = resolution?.side || null;
  const actionDuration = Math.max(0, Number(resolution?.duration) || 0);
  const actionElapsed = bounded(resolution?.elapsed, 0, actionDuration);
  const rawProgress = actionDuration > 0 ? actionElapsed / actionDuration : 0;
  const actionTool = action?.tool || null;
  const tool = actionActor === 'enemy'
    ? resolution.heldTool || selectedTool
    : actionTool || selectedTool;
  const recorderActive = phase === 'resolve' && actionActor === 'player'
    && actionTool === COMBAT_TOOL.RECORDER;
  const capture = recorderActive && [COMBAT_ACTION.MONITOR, COMBAT_ACTION.MASTER_TAKE].includes(action?.id);
  const counterSeconds = recorderActive ? actionElapsed : 0;
  const minutes = Math.floor(counterSeconds / 60);
  const seconds = Math.floor(counterSeconds % 60);
  // Combat takes have no authored tape length or audio meter. Show the action
  // clock as such and leave unmeasured output dormant rather than inventing it.
  const readout = {
    counter: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    counterLabel: 'ACTION COUNTER',
    elapsedSeconds: counterSeconds,
    locationSeconds: recorderActive ? actionDuration : 0,
    progress: recorderActive ? rawProgress : 0,
    active: recorderActive,
    capture,
    recording: capture && !!resolution?.impactFired,
    playing: recorderActive && action?.id === COMBAT_ACTION.PLAYBACK && !!resolution?.impactFired,
    hasTake: !!take,
    takeLabel: take?.label || null,
    meter: meter && Number.isFinite(meter.db) ? { ...meter } : { db: -96, peakDb: -96, rms: 0 },
    meterLabel: 'OUTPUT LEVEL',
  };
  return {
    tool,
    selectedTool,
    actionTool,
    move: action?.id || null,
    phase,
    actionActor,
    actionElapsed,
    actionDuration,
    impactFired: !!resolution?.impactFired,
    progress: rawProgress,
    rawProgress,
    // Kept for the existing Canvas wrapper during the renderer migration.
    resolveProgress: rawProgress,
    time: Math.max(0, Number(time) || 0),
    now: Math.max(0, Number(time) || 0),
    injury,
    snr,
    hurt: bounded(hurt, 0, 1),
    brace: !!parry && parry.phase !== 'resolved',
    parry,
    reducedMotion: !!reducedMotion,
    wet: bounded(wet, 0, 1),
    cosmetics: cosmetics ? { ...cosmetics } : null,
    readout,
  };
}
