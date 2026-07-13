export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function luminance(r, g, b) {
  return clamp01(Number(r) / 255) * 0.2126
    + clamp01(Number(g) / 255) * 0.7152
    + clamp01(Number(b) / 255) * 0.0722;
}

export function classifyCell({ luma = 0, signal = 0, memory = 0, edge = 0, mode = {} } = {}) {
  const y = clamp01(luma);
  const active = Math.max(clamp01(signal), clamp01(memory) * 0.72);
  const worldAmount = Number.isFinite(mode.worldAmount) ? mode.worldAmount : 0.82;
  const signalAmount = Number.isFinite(mode.signalAmount) ? mode.signalAmount : 1;

  if (active * signalAmount > 0.88) return 'SIGNAL_HOT';
  if (active * signalAmount > 0.42) return 'SIGNAL_DIM';
  if (edge > 0.60 && y > 0.18) return 'WORLD_LIGHT';
  if (y * worldAmount > 0.56) return 'WORLD_LIGHT';
  if (y * worldAmount > 0.20) return 'WORLD_MID';
  return 'WORLD_DARK';
}

export function roleStrength({ role, luma = 0, signal = 0, memory = 0, edge = 0 } = {}) {
  const y = clamp01(luma);
  switch (role) {
    case 'SIGNAL_HOT': return Math.max(clamp01(signal), clamp01(memory));
    case 'SIGNAL_DIM': return Math.max(clamp01(signal) * 0.82, clamp01(memory) * 0.62);
    case 'WORLD_LIGHT': return Math.max(y, clamp01(edge) * 0.55);
    case 'WORLD_MID': return y * 0.74;
    default: return y * 0.32;
  }
}
