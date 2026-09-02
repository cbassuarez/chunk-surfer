const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

export const FRONT_END_PLATE_PRESETS = Object.freeze({
  credits: Object.freeze({
    amount: 1,
    detailRetention: 0.38,
    chromaRetention: 0.36,
    exposureStops: -0.78,
    shoulder: 0.72,
    toe: 0.018,
  }),
  title: Object.freeze({
    amount: 0.72,
    detailRetention: 0.48,
    chromaRetention: 0.44,
    exposureStops: -0.62,
    shoulder: 0.61,
    toe: 0.015,
  }),
  gameplay: Object.freeze({
    amount: 0,
    detailRetention: 1,
    chromaRetention: 1,
    exposureStops: 0,
    shoulder: 0,
    toe: 0,
  }),
  fallback: Object.freeze({
    amount: 0,
    detailRetention: 1,
    chromaRetention: 1,
    exposureStops: 0,
    shoulder: 0,
    toe: 0,
  }),
});

export function normalizeFrontEndPlate(value = FRONT_END_PLATE_PRESETS.gameplay) {
  const source = typeof value === 'string'
    ? (FRONT_END_PLATE_PRESETS[value] || FRONT_END_PLATE_PRESETS.gameplay)
    : (value || {});

  return {
    amount: clamp01(source.amount),
    detailRetention: clamp01(finite(source.detailRetention, 1)),
    chromaRetention: clamp01(finite(source.chromaRetention, 1)),
    exposureStops: Math.max(-3, Math.min(1, finite(source.exposureStops, 0))),
    shoulder: Math.max(0, Math.min(2, finite(source.shoulder, 0))),
    toe: Math.max(0, Math.min(0.15, finite(source.toe, 0))),
  };
}

export function interpolateFrontEndPlate(from, to, t) {
  const a = normalizeFrontEndPlate(from);
  const b = normalizeFrontEndPlate(to);
  const p = clamp01(t);
  const lerp = (x, y) => x + (y - x) * p;

  return {
    amount: lerp(a.amount, b.amount),
    detailRetention: lerp(a.detailRetention, b.detailRetention),
    chromaRetention: lerp(a.chromaRetention, b.chromaRetention),
    exposureStops: lerp(a.exposureStops, b.exposureStops),
    shoulder: lerp(a.shoulder, b.shoulder),
    toe: lerp(a.toe, b.toe),
  };
}
