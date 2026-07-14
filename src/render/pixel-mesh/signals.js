export function stableHash2(x, y, seed = 0) {
  let h = ((Number(x) | 0) * 374761393) ^ ((Number(y) | 0) * 668265263) ^ ((Number(seed) | 0) * 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function sampleFallbackSignal({
  x = 0,
  y = 0,
  pressure = 0,
  audio = 0,
  fear = 0,
  time = 0,
  reduceMotion = false,
} = {}) {
  const t = reduceMotion ? 0 : Math.floor(Number(time || 0) * 0.7);
  const n = stableHash2(x, y, t);
  const band = reduceMotion ? 0.5 : Math.sin(Number(x) * 0.073 + Number(y) * 0.021 + Number(time || 0) * 0.0009) * 0.5 + 0.5;
  const raw = Number(pressure || 0) * 0.28
    + Number(audio || 0) * 0.22
    + Number(fear || 0) * 0.18
    + n * 0.10
    + band * 0.10;
  return Math.max(0, Math.min(1, raw));
}
