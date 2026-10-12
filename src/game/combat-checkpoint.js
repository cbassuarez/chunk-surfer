import { createCombatState, validateCombatDefinition } from './combat-state.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

// The reducer may have committed an enemy blow which is still being presented
// and can still be parried. Restore its presentation without applying it twice.
export function normalizeCombatCheckpoint(value) {
  if (!object(value) || value.version !== 1 || typeof value.battleId !== 'string'
    || ![1, 2].includes(value.cathedralPhase) || !object(value.state)) return null;
  const state = value.state, definition = state.definition;
  if (!object(definition) || definition.id !== value.battleId || definition.kind !== 'cathedral'
    || definition.cathedralPhase !== value.cathedralPhase || validateCombatDefinition(definition).length) return null;
  if (!Number.isInteger(state.movementIndex) || state.movementIndex < 0
    || state.movementIndex >= definition.movements.length || !['select', 'enemy', 'done'].includes(state.phase)) return null;
  if (!['composure', 'maxComposure', 'charge', 'maxCharge', 'battery', 'movementCoherence', 'movementMaxCoherence', 'seed', 'turns'].every((key) => finite(state[key]))) return null;
  if (state.composure < 0 || state.composure > state.maxComposure || state.maxComposure <= 0
    || state.charge < 0 || state.charge > state.maxCharge || state.battery < 0 || state.battery > 1
    || state.movementCoherence < 0 || state.movementCoherence > state.movementMaxCoherence) return null;
  if (!object(state.tools) || !Array.isArray(state.actionLog) || !Array.isArray(state.completedMovements)
    || (state.phase === 'enemy' && !object(state.pendingEnemy))
    || (state.phase === 'done' && !object(state.result))) return null;
  const scene = object(value.scene) ? value.scene : {};
  if (scene.phase === 'resolve' && (!object(scene.resolution)
    || !['player', 'enemy'].includes(scene.resolution.side)
    || !object(scene.resolution.before) || scene.resolution.before.definition?.id !== value.battleId
    || !finite(scene.resolution.elapsed) || !finite(scene.resolution.duration)
    || scene.resolution.elapsed < 0 || scene.resolution.duration <= 0)) return null;
  try { return clone({ version: 1, battleId: value.battleId, cathedralPhase: value.cathedralPhase, state, scene }); }
  catch { return null; }
}

export function combatCheckpointSnapshot(state, scene = {}) {
  if (state?.definition?.kind !== 'cathedral') return null;
  return normalizeCombatCheckpoint({ version: 1, battleId: state.definition.id,
    cathedralPhase: state.definition.cathedralPhase, state, scene });
}

export function restoreCombatCheckpoint(definition, value) {
  const checkpoint = normalizeCombatCheckpoint(value);
  if (!checkpoint || checkpoint.battleId !== definition?.id || definition.kind !== 'cathedral'
    || checkpoint.cathedralPhase !== definition.cathedralPhase
    || validateCombatDefinition(definition).length
    || checkpoint.state.definition.movements.some((movement, index) => movement.id !== definition.movements[index]?.id)) return null;
  const state = { ...createCombatState(definition), ...checkpoint.state, definition: clone(definition), source: null };
  const scene = checkpoint.scene;
  if (scene.resolution) {
    scene.resolution.before.definition = clone(definition);
    scene.resolution.after = state;
  }
  return { state, scene };
}

export function cathedralRetryCheckpoint(value, { composure, battery } = {}) {
  const checkpoint = normalizeCombatCheckpoint(value);
  if (!checkpoint) return null;
  const state = checkpoint.state;
  state.phase = 'select'; state.result = null; state.pendingEnemy = null;
  state.composure = Math.max(1, Math.min(state.maxComposure, finite(composure) ? composure : Math.max(20, state.composure)));
  if (finite(battery)) state.battery = Math.max(0, Math.min(1, battery));
  state.movementCoherence = Math.max(1, state.movementCoherence || state.movementMaxCoherence);
  state.enemyGuard = null; state.skipEnemyBeat = false; state.recommitted = false;
  state.misread = null; state.ringing = false; state.tempo = false;
  state.last = { notice: 'THE RETURN CONTINUES', transition: null, action: null, perfect: false };
  // A renewed attempt may take a breath; the earned reference remains spent.
  state.composeMovements = (state.composeMovements || []).filter((index) => index !== state.movementIndex);
  if (!state.committed) {
    const fresh = createCombatState(state.definition, { startingMovementIndex: state.movementIndex, seed: state.seed });
    state.committed = fresh.committed;
    state.read = fresh.read;
    state.stance = fresh.stance;
  }
  checkpoint.scene = { phase: 'tool', selectedTool: 0, selectedMove: 0, resolution: null,
    turnStart: null, turnClock: null, notice: state.last.notice };
  return normalizeCombatCheckpoint(checkpoint);
}
