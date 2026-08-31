const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export const TORCH_BAND = Object.freeze({
  OFF: 'off',
  FAILING: 'failing',
  WARM: 'warm',
  CLEAN: 'clean',
});

// Deterministic, continuous visual state. Both renderers receive this object;
// the battery can no longer brown out walls while leaving props in a clean beam.
// THE LAMP IS FINE. THE EYE IS NOT.
//
// `perception` is 1 for a recordist who is himself, and falls as oxygen does.
// It scales the reach and the throw and touches NOTHING else — not `health`,
// not `band`, not the battery the HUD is drawing from. That separation is the
// entire point of the parameter: the light in the world is unchanged, the meter
// still reads what it read, and the room has got darker anyway.
//
// It is the most unsettling effect available here precisely because the player's
// first instinct is to check the battery, and the battery will tell them
// everything is fine.
export function resolveTorchLook({ on = true, battery = 1, timeSec = 0, reducedEffects = false, perception = 1 } = {}) {
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
  // Applied last, so it composes over whatever the battery already decided
  // rather than pretending to be a battery state of its own.
  const seen = clamp(perception, 0, 1);
  return {
    band, health, power: flicker * (.35 + seen * .65),
    reach: reach * (.55 + seen * .45),
    color, coneInner, coneOuter, spill: spill * (.4 + seen * .6),
    // For anything that wants to know the difference between the lamp and the
    // man. Never rendered as a quantity.
    perception: seen,
  };
}

// THE TORCH INSIDE SOURCE.
//
// Before the body crosses the FOH threshold it is an x-ray: the screen-space
// cone inverts the picture instead of pretending Source's paper and code are
// ordinary surfaces a warm bulb could illuminate. The renderer owns that
// inversion; this pure look object only names the mode and preserves the real
// battery/failing-bulb power beneath it.
//
// Across the threshold, in the white nothingness and everything beyond it, the
// torch is taken by the maintained emergency circuit. It throws red and its
// power follows the SAME cycle as sourceEmergencyFrame. The flashlight does not
// wait for the room-wide wash ten seconds into the crossing: it is the first red
// thing the player carries into the blank field.
//
// Pure, and composes with applyHushTorchInterference rather than replacing it.
const mix = (a, b, t) => a + (b - a) * t;
export const SOURCE_TORCH_RED = Object.freeze([1, 0.14, 0.09]);
export const SOURCE_TORCH_MODE = Object.freeze({
  NONE: 'none',
  XRAY: 'xray',
  EMERGENCY: 'emergency',
});

export function applySourceEmergencyTorch(torch = {}, {
  xray = false,
  active = false,
  cycle = 1,
} = {}) {
  if (xray) return {
    ...torch,
    sourceEmergencyTorch: SOURCE_TORCH_MODE.XRAY,
    sourceTorchMode: SOURCE_TORCH_MODE.XRAY,
  };
  if (!active) return {
    ...torch,
    sourceEmergencyTorch: SOURCE_TORCH_MODE.NONE,
    sourceTorchMode: SOURCE_TORCH_MODE.NONE,
  };
  const base = Array.isArray(torch.color) ? torch.color : [1, .94, .82];
  const pulse = clamp(cycle, 0, 1);
  return {
    ...torch,
    // Driven most of the way to the circuit's red, not all: a filament behind a
    // red gel is still a filament, and a perfectly saturated beam reads as a UI
    // overlay rather than as light.
    color: base.map((channel, index) => mix(channel, SOURCE_TORCH_RED[index], .88)),
    power: clamp((Number(torch.power) || 0) * (.34 + pulse * .66), 0, 1),
    sourceEmergencyTorch: SOURCE_TORCH_MODE.EMERGENCY,
    sourceTorchMode: SOURCE_TORCH_MODE.EMERGENCY,
  };
}
