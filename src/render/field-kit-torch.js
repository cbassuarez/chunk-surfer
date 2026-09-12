// Lens geometry, not a second light or a difficulty preset. Apply before HUSH
// and Source so their authored failures still own the final beam.
export function applyFieldKitTorchLook(base = {}, effects = {}) {
  const scale = (value, fallback, lo, hi) => Number.isFinite(Number(value))
    ? Math.max(lo, Math.min(hi, Number(value))) : fallback;
  const reach = scale(effects.flashlightReachScale, 1, .75, 1.25);
  const spread = scale(effects.flashlightConeScale, 1, .65, 1.35);
  if (reach === 1 && spread === 1) return base;
  const cone = value => Math.cos(Math.acos(Math.max(-1, Math.min(1, value))) * spread);
  return { ...base,
    reach: (Number(base.reach) || 0) * reach,
    coneInner: cone(Number(base.coneInner) || .88),
    coneOuter: cone(Number(base.coneOuter) || .94),
    spill: (Number(base.spill) || 0) * spread,
  };
}
