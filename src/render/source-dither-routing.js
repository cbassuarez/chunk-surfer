// Source's print pressure follows its existing journey and visible threat,
// rather than a clock: waiting does not manufacture an escalating encounter.
const unit = n => Math.max(0, Math.min(1, Number.isFinite(Number(n)) ? Number(n) : 0));

export function continuationDitherIntensity(state = {}) {
  const chart = Math.max(0, Math.min(4, Number(state.chartId) || 0));
  const level = Math.max(0, Math.min(3, Number(state.level) || 0));
  const base = state.phase === 'catch' ? .52 + level * .09 : .18 + chart * .08;
  const hush = state.hush;
  let proximity = 0;
  if (hush?.active && Number(hush.chartId || 0) === Number(state.chartId || 0)
      && [state.x, state.z, state.feet, hush.x, hush.z, hush.feet].every(Number.isFinite)) {
    const distance = Math.hypot(state.x - hush.x, state.z - hush.z, (state.feet - hush.feet) * 1.5);
    proximity = .18 * unit((14 - distance) / 11);
  }
  const rest = unit(state.sourceRestView?.degradation);
  return unit(Math.max(base + proximity, rest > 0 ? .28 + rest * .62 : 0));
}

export function sourceIVDitherIntensity(state = {}, { startZ = 0, endZ = -1 } = {}) {
  const z = Number.isFinite(Number(state.z)) ? Number(state.z) : startZ;
  const span = endZ - startZ;
  return .22 + .48 * unit(Math.abs(span) > 1e-6 ? (z - startZ) / span : 0);
}

export function standingTearDitherIntensity(frame = {}) {
  const memories = Array.isArray(frame.memories) ? frame.memories : [];
  const assembly = Number.isFinite(frame.assembly) ? unit(frame.assembly)
    : memories.length ? memories.reduce((sum, item) => sum + unit(item?.pressure), 0) / memories.length : 0;
  return .16 + .72 * assembly;
}

export function sourcePubDitherIntensity(state = {}, rounds = 1) {
  const stage = unit((Number(state.stage) || 0) / Math.max(1, Number(rounds) || 1));
  const layer = unit((Number(state.layer) || 0) / 2);
  return unit(.18 + .53 * stage + .14 * layer);
}

export function earthfallDitherIntensity(frame = {}, { upper = 100, lower = 0 } = {}) {
  const feet = Number.isFinite(Number(frame.player?.feet)) ? Number(frame.player.feet) : upper;
  const height = upper - lower;
  return .18 + .56 * unit(height > 0 ? (upper - feet) / height : 0);
}

export function screenForWorld(override = null) {
  // An explicit user/debug override remains authoritative. Room/profile
  // suggestions formerly scattered three different defaults across the world.
  return override || 'crosshatch';
}

export function advanceSourceDither(current, target, dt, { reducedMotion = false, reducedFlash = false } = {}) {
  const rate = reducedMotion || reducedFlash ? .06 : .20;
  const limit = rate * Math.max(0, Math.min(.25, Number(dt) || 0));
  const value = unit(current), wanted = unit(target);
  return unit(value + Math.max(-limit, Math.min(limit, wanted - value)));
}

export function targetSourceDither(state = {}, { active = false, override = null } = {}) {
  if (!active || override) return 0;
  return state.sourceDitherIntensity == null ? .18 : unit(state.sourceDitherIntensity);
}
