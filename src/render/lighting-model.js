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
// The physical hall receives a soft, surface-based profile. Elsewhere Source
// may ask for an x-ray inversion or a beam taken by the emergency circuit;
// those modes preserve the battery/failing-bulb power beneath them. The runtime
// owns their geographic boundaries, while the renderer owns their appearance.
//
// Pure, and composes with applyHushTorchInterference rather than replacing it.
const mix = (a, b, t) => a + (b - a) * t;
export const SOURCE_TORCH_RED = Object.freeze([1, 0.14, 0.09]);
export const SOURCE_TORCH_MODE = Object.freeze({
  NONE: 'none',
  XRAY: 'xray',
  EMERGENCY: 'emergency',
});

// A surface-based beam for physical interiors. Compose after the fitted optics
// and HUSH so the softer highlight response cannot restore power or reach.
export function applyPhysicalTorchProfile(torch = {}, { profile = 'hall', flicker = 1 } = {}) {
  const base = Array.isArray(torch.color) ? torch.color : [1, .94, .82];
  const widen = (cosine, amount) => Math.cos(Math.acos(clamp(cosine, -1, 1)) * amount);
  return {
    ...torch,
    color: base.map((channel, index) => mix(channel, [1, .95, .86][index], .35)),
    // The church's recording gain reveals its dim maintained practicals. Its
    // close stone receives a quieter lamp with the renderer's full shoulder.
    power: clamp((Number(torch.power) || 0) * (profile === 'church' ? .18 : profile === 'dock' ? .74 : profile === 'shore' || profile === 'proper' ? .82 : .90) * clamp(flicker, 0, 1), 0, 1),
    coneInner: widen(Number(torch.coneInner) || .88, 1.32),
    coneOuter: widen(Number(torch.coneOuter) || .94, .78),
    spill: clamp((Number(torch.spill) || 0) * (profile === 'shore' ? .85 : 1.25), 0, .12),
    shoulder: profile === 'church' ? 2 : .75,
  };
}

export function applySourceEmergencyTorch(torch = {}, {
  xray = false,
  active = false,
  cycle = 1,
  flicker = 1,
  profile = null,
} = {}) {
  // The hall is still a physical corridor. Its torch lights the paper and
  // concrete, with a broad penumbra and a shoulder on the received light;
  // neither darkness nor empty air is an image to invert. Keep the battery,
  // fitted optics and HUSH attenuation that were composed before this profile.
  if (profile === 'hall' || profile === 'dock' || profile === 'shore' || profile === 'proper') {
    return {
      ...applyPhysicalTorchProfile(torch, { profile, flicker }),
      sourceEmergencyTorch: SOURCE_TORCH_MODE.NONE,
      sourceTorchMode: SOURCE_TORCH_MODE.NONE,
    };
  }
  if (xray) return {
    ...torch,
    sourceEmergencyTorch: SOURCE_TORCH_MODE.XRAY,
    sourceTorchMode: SOURCE_TORCH_MODE.XRAY,
  };
  if (!active) return {
    ...torch,
    // A sagging supply loses throw and runs amber before it goes black. Keep
    // the fitted cone and the player's switch state; only the lamp fails.
    ...(flicker !== 1 ? {
      power: clamp((Number(torch.power) || 0) * clamp(flicker, 0, 1), 0, 1),
      reach: (Number(torch.reach) || 1) * (.58 + .42 * Math.sqrt(clamp(flicker, 0, 1))),
      color: (Array.isArray(torch.color) ? torch.color : [1, .94, .82])
        .map((channel, index) => mix(channel, [1, .56, .24][index], (1 - clamp(flicker, 0, 1)) * .72)),
    } : {}),
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
