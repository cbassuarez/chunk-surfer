// Optional Hall light behavior. The host owns eligibility, the shared STAB
// reservation, and synchronous save writes. This module owns no world clocks,
// power circuits, audio, actors, interactions, or progression requirements.
export const HALL_CHANDELIER_FLICKER = Object.freeze({
  fixtureId: 'acq-hall-chandelier-west',
  maximumEpisodes: 2,
  firstQuietSeconds: Object.freeze([120, 240]),
  repeatQuietSeconds: Object.freeze([240, 480]),
  durationSeconds: 1.12,
  maximumStepSeconds: .9,
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const countOf = (value, maximum) => clamp(Math.floor(Number(value) || 0), 0, maximum);
const smooth = (value) => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x); };
const hash = (value) => {
  let result = 2166136261;
  for (const char of String(value)) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); }
  return result >>> 0;
};
const rangeOf = (value, fallback) => Array.isArray(value) && value.length === 2
  && value.every((v) => Number.isFinite(v) && v > 0) && value[1] >= value[0] ? [...value] : [...fallback];

// One warm rise, a slight hesitation while still lit, and a longer decay. No
// repeated on/off transitions or rapid random pulses are hidden in the curve.
export function hallChandelierGlow(progress = 0) {
  if (!Number.isFinite(progress) || progress <= 0 || progress >= 1) return 0;
  if (progress < .18) return smooth(progress / .18);
  if (progress < .36) return 1 - .14 * smooth((progress - .18) / .18);
  return .86 * (1 - smooth((progress - .36) / .64));
}

export function hallChandelierBlockedReason(input = {}) {
  if (input.eligible !== true || input.inHall === false) return 'outside-hall';
  if (input.paused) return 'paused';
  if (input.hidden || input.focused === false) return 'away';
  if (input.recording || input.listening || input.playback || input.stalled || input.slating) return 'recorder';
  if (input.blocked || input.battle || input.finale || input.dialogue || input.suppressActors) return 'occupied';
  if (input.reduceDread || (input.effectsMode ?? 'full') !== 'full') return 'effects';
  if (input.applausePriority) return 'applause-priority';
  if (Number(input.threatNear) > .25) return 'threat';
  return null;
}

export function createHallChandelierFlicker({ seed = 'hall', consumedCount = 0, config = {} } = {}) {
  const maximum = HALL_CHANDELIER_FLICKER.maximumEpisodes;
  const firstQuiet = rangeOf(config.firstQuietSeconds, HALL_CHANDELIER_FLICKER.firstQuietSeconds);
  const repeatQuiet = rangeOf(config.repeatQuietSeconds, HALL_CHANDELIER_FLICKER.repeatQuietSeconds);
  const duration = Number.isFinite(config.durationSeconds) && config.durationSeconds > 0
    ? config.durationSeconds : HALL_CHANDELIER_FLICKER.durationSeconds;
  const maximumStep = HALL_CHANDELIER_FLICKER.maximumStepSeconds;
  let consumed = countOf(consumedCount, maximum), elapsed = 0, activeAge = null;
  let pending = null, serial = 0, reason = 'quiet';
  const quietFor = () => {
    const [low, high] = consumed === 0 ? firstQuiet : repeatQuiet;
    return low + (high - low) * hash(`${seed}:hall-chandelier:${consumed}`) / 4294967296;
  };
  let quietSeconds = quietFor();
  const restartQuiet = () => { pending = null; elapsed = 0; activeAge = null; quietSeconds = quietFor(); };
  const view = () => Object.freeze({
    fixtureId: HALL_CHANDELIER_FLICKER.fixtureId,
    active: activeAge !== null,
    power: activeAge === null ? 0 : hallChandelierGlow(activeAge / duration),
    progress: activeAge === null ? 0 : clamp(activeAge / duration, 0, 1),
    consumedCount: consumed,
    remainingEpisodes: maximum - consumed,
    eligibleSeconds: elapsed,
    quietSeconds,
    opportunity: pending,
    reason,
  });
  return {
    advance(input = {}) {
      const dt = Number(input.dt);
      const blocked = hallChandelierBlockedReason(input);
      const invalidClock = !Number.isFinite(dt) || dt < 0 || dt > maximumStep;
      if (blocked || invalidClock) {
        // An emitted episode has already been saved. It can be interrupted,
        // but never resumes later inside a take or after returning to the room.
        if (activeAge !== null || pending || elapsed >= quietSeconds) restartQuiet();
        pending = null;
        reason = blocked || 'away-gap';
        return null;
      }
      if (activeAge !== null) {
        activeAge += dt;
        if (activeAge >= duration) { restartQuiet(); reason = consumed >= maximum ? 'complete' : 'quiet'; }
        else reason = 'glow';
        return null;
      }
      if (consumed >= maximum) { reason = 'complete'; pending = null; return null; }
      elapsed = Math.min(quietSeconds, elapsed + dt);
      if (elapsed < quietSeconds) { reason = 'quiet'; return null; }
      // Ordinary Hall time earns one quiet period even while the shared budget
      // cools down. The budget gates onset; elapsed time can never accumulate
      // several queued episodes. Protection/away holds above clear a due beat.
      if (input.budgetReady === false) { pending = null; reason = 'budget'; return null; }
      pending ||= Object.freeze({ token: ++serial, fixtureId: HALL_CHANDELIER_FLICKER.fixtureId, episode: consumed + 1 });
      reason = 'opportunity';
      return pending;
    },
    commit({ opportunity = pending, reserveBudget, persistConsumed } = {}) {
      if (!pending || opportunity !== pending || activeAge !== null || consumed >= maximum
        || typeof reserveBudget !== 'function' || typeof persistConsumed !== 'function') return false;
      // No emission is exposed until both callbacks have succeeded. A failed
      // save conservatively leaves a reserved budget spent and the light dark.
      try {
        const reserved = reserveBudget();
        if (reserved !== true) { restartQuiet(); reason = 'budget-race'; return false; }
        const saved = persistConsumed(consumed + 1);
        if (saved === false || saved && typeof saved.then === 'function') {
          restartQuiet(); reason = 'persistence-failed'; return false;
        }
      } catch (_) { restartQuiet(); reason = 'persistence-failed'; return false; }
      consumed += 1;
      pending = null;
      elapsed = 0;
      activeAge = 0;
      reason = 'glow';
      return true;
    },
    cancel(reasonId = 'cancelled') { restartQuiet(); reason = String(reasonId); },
    view,
    snapshot: () => Object.freeze({ consumedCount: consumed }),
  };
}
