export function updateMemory(previous, signal, dt, options = {}) {
  const attackPerSec = Number.isFinite(options.attackPerSec) ? options.attackPerSec : 14;
  const decayPerSec = Number.isFinite(options.decayPerSec) ? options.decayPerSec : 1.8;
  const p = Math.max(0, Math.min(1, Number(previous) || 0));
  const s = Math.max(0, Math.min(1, Number(signal) || 0));
  const safeDt = Math.max(0, Math.min(0.25, Number(dt) || 0));
  const attack = 1 - Math.exp(-safeDt * attackPerSec);
  const decay = Math.exp(-safeDt * decayPerSec);
  if (s >= p) return p + (s - p) * attack;
  return p * decay;
}
