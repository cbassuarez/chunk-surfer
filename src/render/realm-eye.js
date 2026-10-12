// Body steps arrive at the input cadence. Only the rendered eye follows this
// short segment; collision, distance walked and look remain immediate.
export function createRealmEyeInterpolator({ duration = .045, maxDistance = .4 } = {}) {
  let state = null;
  const sample = (time) => {
    const mix = Math.max(0, Math.min(1, (time - state.startedAt) / duration));
    return state.from.map((value, axis) => value + (state.target[axis] - value) * mix);
  };
  return {
    reset() { state = null; },
    position(key, eye, time) {
      const target = Array.from(eye);
      if (!Number.isFinite(time)) { state = null; return target; }
      if (!state || state.key !== key || time < state.lastTime ||
          Math.hypot(...target.map((value, axis) => value - state.target[axis])) > maxDistance) {
        state = { key, from: target, target, startedAt: time, lastTime: time };
        return target;
      }
      const current = sample(time);
      if (target.some((value, axis) => value !== state.target[axis])) {
        state.from = current;
        state.target = target;
        state.startedAt = time;
      }
      state.lastTime = time;
      return current;
    },
  };
}
