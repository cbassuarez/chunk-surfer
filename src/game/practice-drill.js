// The practice encounter repeats one solvable, run-seeded combat phrase.
// Equipment is local to the exercise; it never changes the player's bag.
export const PRACTICE_MOVES = Object.freeze([
  Object.freeze({ id: 'hold', label: 'HOLD', tool: 'self', detail: 'Brace against pressure.' }),
  Object.freeze({ id: 'expose', label: 'EXPOSE', tool: 'torch', detail: 'Reveal a concealed signal.' }),
  Object.freeze({ id: 'monitor', label: 'MONITOR', tool: 'recorder', detail: 'Capture a broadcast.' }),
  Object.freeze({ id: 'playback', label: 'PLAYBACK', tool: 'recorder', detail: 'Return the captured sound.' }),
]);

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function createPracticeDrill({ seed = 0, cycles = null, composure = 40, maxComposure = 40 } = {}) {
  const sequence = PRACTICE_MOVES.map(move => move.id).sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`));
  const monitor = sequence.indexOf('monitor'), playback = sequence.indexOf('playback');
  if (monitor > playback) [sequence[monitor], sequence[playback]] = [sequence[playback], sequence[monitor]];
  const max = Math.max(1, Number(maxComposure) || 40);
  return {
    seed: String(seed), sequence,
    cycles: cycles == null ? 2 + hash(`${seed}:cycles`) % 3 : Math.max(2, Math.min(4, Math.floor(Number(cycles) || 3))),
    cycle: 0, step: 0, mistakes: 0, turns: 0, loaded: false,
    maxComposure: max, composure: Math.max(1, Math.min(max, Number(composure) || max)),
    missCost: 5, result: null, last: null,
  };
}

export function practiceDrillCue(state) {
  if (!state || state.result) return null;
  const move = state.sequence[state.step];
  return {
    id: `practice:${state.cycle}:${state.step}`,
    cycle: state.cycle + 1, cycles: state.cycles, step: state.step + 1, steps: state.sequence.length,
    parts: [`${move}:left`, `${move}:right`],
  };
}

export function performPracticeMove(previous, action) {
  if (!previous || previous.result || !PRACTICE_MOVES.some(move => move.id === action)) return previous;
  const state = { ...previous, sequence: [...previous.sequence], turns: previous.turns + 1 };
  const correct = action === state.sequence[state.step];
  state.last = { action, correct, cycleComplete: false };
  if (!correct) {
    state.mistakes++;
    state.composure = Math.max(0, state.composure - state.missCost);
    if (!state.composure) state.result = 'lose';
    return state;
  }
  if (action === 'monitor') state.loaded = true;
  if (action === 'playback') state.loaded = false;
  state.step++;
  if (state.step === state.sequence.length) {
    state.cycle++;
    state.step = 0;
    state.loaded = false;
    state.last.cycleComplete = true;
    if (state.cycle === state.cycles) state.result = 'win';
  }
  return state;
}
