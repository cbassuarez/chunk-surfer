// One clock owns every sensory reading of the Natatorium battle.
//
// The old implementation let the score decide when the room became wet. That
// made movement one sound submerged before its first line had finished and left
// a silent run with a different picture. This controller is deliberately pure:
// combat advances it, then the renderer, score, voice and water Foley all read
// the same snapshot.

export const BATTLE_SUBMERSION_PHASE = Object.freeze({
  DRY: 'dry',
  HALF: 'half',
  FULL: 'full',
  RESURFACING: 'resurfacing',
});

const SETTLED_PHASES = new Set([
  BATTLE_SUBMERSION_PHASE.DRY,
  BATTLE_SUBMERSION_PHASE.HALF,
  BATTLE_SUBMERSION_PHASE.FULL,
]);

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));
const lerp = (a, b, t) => Number(a || 0) + (Number(b || 0) - Number(a || 0)) * t;
const ease = (t) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

const DEFAULTS = Object.freeze({
  phases: Object.freeze(['dry', 'half', 'full']),
  resultPhases: Object.freeze({ win: 'dry', lose: 'full' }),
  wetMix: Object.freeze({ dry: 0, half: .5, full: .92 }),
  lowpassHz: Object.freeze({ dry: 20000, half: 1800, full: 720 }),
  transitionSeconds: Object.freeze({ dry: 0, half: 1, full: 1.1, win: 1.35 }),
});

function phase(value, fallback = 'dry') {
  const id = String(value || '');
  return SETTLED_PHASES.has(id) ? id : fallback;
}

export function normalizeBattleSubmersion(presentation = null) {
  if (presentation?.mode !== 'submerged') return null;
  const phases = Array.isArray(presentation.submersionPhases)
    ? presentation.submersionPhases.map((entry, index) => phase(entry, DEFAULTS.phases[index] || 'full'))
    : [...DEFAULTS.phases];
  const results = presentation.resultPhases || {};
  const mixes = presentation.wetMix || {};
  const filters = presentation.lowpassHz || {};
  const transitions = presentation.transitionSeconds || {};
  return Object.freeze({
    phases: Object.freeze(phases.length ? phases : [...DEFAULTS.phases]),
    resultPhases: Object.freeze({
      win: phase(results.win, DEFAULTS.resultPhases.win),
      lose: phase(results.lose, DEFAULTS.resultPhases.lose),
    }),
    wetMix: Object.freeze({
      dry: 0,
      half: clamp(mixes.half ?? DEFAULTS.wetMix.half),
      full: clamp(mixes.full ?? DEFAULTS.wetMix.full),
    }),
    lowpassHz: Object.freeze({
      dry: Math.max(120, Number(filters.dry) || DEFAULTS.lowpassHz.dry),
      half: Math.max(120, Number(filters.half) || DEFAULTS.lowpassHz.half),
      full: Math.max(120, Number(filters.full) || DEFAULTS.lowpassHz.full),
    }),
    transitionSeconds: Object.freeze({
      dry: Math.max(0, Number(transitions.dry) || 0),
      half: Math.max(.02, Number(transitions.half) || DEFAULTS.transitionSeconds.half),
      full: Math.max(.02, Number(transitions.full) || DEFAULTS.transitionSeconds.full),
      win: Math.max(.02, Number(transitions.win) || DEFAULTS.transitionSeconds.win),
    }),
  });
}

function valuesFor(config, id) {
  const settled = phase(id);
  const depth = settled === 'full' ? 1 : settled === 'half' ? .5 : 0;
  return {
    phase: settled,
    depth,
    // 1 is below the screen, .5 is a literal half-screen waterline and a full
    // plunge pushes the surface just above the top edge.
    waterline: settled === 'full' ? -.04 : 1 - depth,
    wetMix: config?.wetMix?.[settled] ?? 0,
    lowpassHz: config?.lowpassHz?.[settled] ?? 20000,
  };
}

export function createBattleSubmersionController({ presentation = null } = {}) {
  const config = normalizeBattleSubmersion(presentation);
  let from = valuesFor(config, 'dry');
  let to = { ...from };
  let elapsed = 0;
  let duration = 0;
  let serial = 0;

  function transition(nextPhase, seconds = null) {
    if (!config) return snapshot();
    const next = valuesFor(config, nextPhase);
    const current = snapshot();
    from = {
      phase: current.targetPhase,
      depth: current.depth,
      waterline: current.waterline,
      wetMix: current.wetMix,
      lowpassHz: current.lowpassHz,
    };
    to = next;
    elapsed = 0;
    duration = seconds == null ? config.transitionSeconds[next.phase] : Math.max(0, Number(seconds) || 0);
    serial += 1;
    if (duration <= 0) from = { ...to };
    return snapshot();
  }

  function setMovement(index = 0) {
    if (!config) return snapshot();
    const at = Math.max(0, Math.floor(Number(index) || 0));
    return transition(config.phases[at] || config.phases.at(-1) || 'full');
  }

  function beginResult(result = 'win') {
    if (!config) return snapshot();
    const outcome = result === 'lose' ? 'lose' : 'win';
    const next = config.resultPhases[outcome];
    const current = snapshot();
    // A Natatorium defeat is not another plunge. It remains in the already
    // settled full-depth state, with the same serial, mix and pressure bed.
    if (current.settled && current.targetPhase === next) return current;
    const seconds = outcome === 'win' && next === 'dry'
      ? config.transitionSeconds.win
      : config.transitionSeconds[next];
    return transition(next, seconds);
  }

  function update(dt = 0) {
    elapsed = Math.min(duration, elapsed + Math.max(0, Number(dt) || 0));
    if (duration - elapsed < 1e-9) elapsed = duration;
    if (duration > 0 && elapsed >= duration) from = { ...to };
    return snapshot();
  }

  function snapshot() {
    const raw = duration <= 0 ? 1 : clamp(elapsed / duration);
    const progress = ease(raw);
    const settled = raw >= 1;
    const surfacing = !settled && to.phase === 'dry' && (from.depth > 0 || from.wetMix > 0);
    return Object.freeze({
      enabled: !!config,
      phase: surfacing ? BATTLE_SUBMERSION_PHASE.RESURFACING : settled ? to.phase : to.phase,
      fromPhase: from.phase,
      targetPhase: to.phase,
      progress: raw,
      easedProgress: progress,
      settled,
      depth: lerp(from.depth, to.depth, progress),
      waterline: lerp(from.waterline, to.waterline, progress),
      wetMix: lerp(from.wetMix, to.wetMix, progress),
      dryMix: 1 - lerp(from.wetMix, to.wetMix, progress),
      lowpassHz: lerp(from.lowpassHz, to.lowpassHz, progress),
      serial,
    });
  }

  return Object.freeze({ config, setMovement, beginResult, transition, update, snapshot });
}
