const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

// `negative` is the reference grade: the front end prints the camera behind it
// rather than dimming it. `print` says WHERE the negative is taken.
//
//   print 0 — in the PIXEL-MESH shader, before the dither, as the reference
//             stack had it (its colour halftone sat OVER the invert, and this
//             renderer's dither is that halftone). The curve is FRONT_END_GRADE
//             in look-profiles.js.
//   print 1 — in the POST pass, off the finished frame: luminance turns over,
//             hue stays.
//
// The front end prints at 1. Screening the negative put a mostly-white frame
// into a recording stage built to lift a dark night out of black — its exposure
// gain, black floor and one-bit threshold — and that stage blew the whole field
// out to the solid bit. Every contour went with it, and the dimming fields below
// then pushed the blank field down to a flat, murky grey: neither the street
// you stopped in nor the room behind the menu could be read. The finished frame
// already holds the contours, so its negative is paper with the scene in ink.
//
// Detail and chroma are retained in full now: those two fields were written to
// push a lit picture back behind text, and on a print they only smear the ink.
export const FRONT_END_PLATE_PRESETS = Object.freeze({
  credits: Object.freeze({
    negative: 1,
    print: 1,
    amount: 1,
    detailRetention: 1,
    chromaRetention: 1,
    exposureStops: -0.25,
    shoulder: 0,
    toe: 0,
  }),
  title: Object.freeze({
    negative: 1,
    print: 1,
    amount: 1,
    detailRetention: 1,
    chromaRetention: 1,
    exposureStops: -0.25,
    shoulder: 0,
    toe: 0,
  }),
  gameplay: Object.freeze({
    negative: 0,
    print: 0,
    amount: 0,
    detailRetention: 1,
    chromaRetention: 1,
    exposureStops: 0,
    shoulder: 0,
    toe: 0,
  }),
  fallback: Object.freeze({
    negative: 0,
    print: 0,
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
    negative: clamp01(finite(source.negative, 0)),
    print: clamp01(finite(source.print, 0)),
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
    negative: lerp(a.negative, b.negative),
    print: lerp(a.print, b.print),
    amount: lerp(a.amount, b.amount),
    detailRetention: lerp(a.detailRetention, b.detailRetention),
    chromaRetention: lerp(a.chromaRetention, b.chromaRetention),
    exposureStops: lerp(a.exposureStops, b.exposureStops),
    shoulder: lerp(a.shoulder, b.shoulder),
    toe: lerp(a.toe, b.toe),
  };
}
