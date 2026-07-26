const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export const TORCH_BAND = Object.freeze({
  OFF: 'off',
  FAILING: 'failing',
  WARM: 'warm',
  CLEAN: 'clean',
});

// Deterministic, continuous visual state. Both renderers receive this object;
// the battery can no longer brown out walls while leaving props in a clean beam.
export function resolveTorchLook({ on = true, battery = 1, timeSec = 0, reducedEffects = false } = {}) {
  const health = clamp(battery, 0, 1);
  if (!on || health <= 0) return {
    band: TORCH_BAND.OFF, health, power: 0, reach: .5,
    color: [1, .72, .38], coneInner: .84, coneOuter: .895, spill: 0,
  };
  let band = TORCH_BAND.CLEAN;
  let reach = 1, color = [1, .94, .82], coneInner = .88, coneOuter = .94, spill = .05;
  if (health <= .15) {
    band = TORCH_BAND.FAILING;
    reach = .50 + health / .15 * .13;
    color = [1, .61 + health * .55, .25 + health * .9];
    coneInner = .81; coneOuter = .91; spill = .025;
  } else if (health <= .40) {
    const t = (health - .15) / .25;
    band = TORCH_BAND.WARM;
    reach = .64 + t * .25;
    color = [1, .72 + t * .18, .43 + t * .27];
    coneInner = .83 + t * .04; coneOuter = .915 + t * .02; spill = .035 + t * .012;
  }
  let flicker = 1;
  if (band === TORCH_BAND.FAILING && !reducedEffects) {
    const wobble = Math.sin(timeSec * 17.31) * Math.sin(timeSec * 4.73);
    const dropout = Math.sin(timeSec * 2.17 + 1.7) > .92 ? .28 : 1;
    flicker = clamp((.78 + .22 * wobble) * dropout, .18, 1);
  }
  return {
    band, health, power: flicker,
    reach, color, coneInner, coneOuter, spill,
  };
}
