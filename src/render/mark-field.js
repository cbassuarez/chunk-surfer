// The engraving, derived from the material.
//
// The lens generates full-colour material tiles and the recorder draws the
// world with a one-bit threshold, so almost everything those tiles cost is
// destroyed on the way to the eye (see pixel-mesh/shader.js: captureMix is 1.0
// in every profile, and what survives is luminance plus a ±0.10 contrast term
// against a procedural hash). This module takes the same tiles and extracts the
// thing the recorder actually consumes: where marks clot, and which way they
// run.
//
// Nothing here asks the model for anything new. The structure is already in the
// tiles — measured across 577 cached ones by tools/chunk_surfer/analyse-mark-
// fields.py, which found grain to be a property of the MATERIAL rather than the
// bank: ash wood floor 0.91 directional consistency, reclaimed brick 0.59,
// polished concrete 0.16. That 0.70 spread is the source atlas showing through
// img2img, and it is free.
//
// ENCODING. Grain is a LINE, not a vector: a floorboard running at 10° and one
// running at 190° are the same floorboard. Storing an angle would tear at that
// wrap under interpolation and mipmapping — halfway between 10° and 190° is
// either 100° (perpendicular, wrong) or a discontinuity. So the direction is
// stored as a DOUBLED-ANGLE VECTOR, scaled by coherence:
//
//     G,B = 0.5 + 0.5 * coherence * (cos 2φ, sin 2φ)
//
// Doubling makes φ and φ+180° identical, so the wrap disappears. Scaling by
// coherence makes the filtering correct for free: average two perpendicular
// grains and the vectors cancel, so the result reads as LOW coherence rather
// than as a confident average of two things that disagree. A mip of a mixed
// region is honestly uncertain, which is exactly what it should be.
//
// The stored direction is the GRAIN, not the gradient. The structure tensor's
// principal direction is the direction of greatest change — across a floorboard
// rather than along it — so it is rotated a quarter turn, which in doubled-angle
// space is just a negation.

// The tensor window, at the 512px resolution the tiles are generated and the
// offline tool measures at. It matches the scale the recorder's stipple samples
// (patternScale 36-46 per metre), which is the whole reason to measure there.
const TENSOR_RADIUS_AT_512 = 4;
export const MARK_FIELD_SIZE = 128;

// DERIVE FROM A DOWNSAMPLED COPY, AND THIS NUMBER IS NOT A GUESS.
//
// Measured on this machine: deriving from the full 512px tile costs 27.9ms.
// That is a lens-killer, not a slowdown — material-mutation.js disables the
// whole layer FOR THE SESSION if generation overlaps a frame longer than 33ms,
// so a synchronous full-res derivation would have quietly switched the feature
// off in play and looked like a driver problem.
//
// Against real cached tiles, deriving from a 256px copy costs 6.1ms and keeps
// what matters: tile direction within 0.071, and the bank density separation —
// the 191% signal that carries all six profiles' identity — at x2.26 against
// x2.24 at full resolution. Density reads ~0.85 of the full-res value, which is
// a consistent scale, not a distortion.
//
// 128px was tempting at 1.4ms and is wrong: direction error doubles to 0.139,
// the bank separation erodes to x2.03, and coherence actively corrupts —
// polished concrete reads 0.29 at 512 and 0.53 at 128, because box-averaging
// turns isotropic noise into smooth gradients that look directional. A mark
// field that invents grain in concrete is worse than no mark field.
export const MARK_FIELD_SOURCE = 256;

// Keep the window at a constant world scale whatever the source resolution, so
// a caller cannot silently measure something else by handing in a smaller tile.
export const tensorRadiusFor = (size) => Math.max(1, Math.round(TENSOR_RADIUS_AT_512 * size / 512));

// Local contrast is the density channel and it is deliberately NOT normalised
// per tile. Bank identity lives here — measured calm 0.049 to rupture 0.141,
// a 191% spread, by far the strongest differentiator the banks have — and
// per-tile normalisation would erase exactly that. This absolute range is
// calibrated to those measurements with headroom.
const DENSITY_FULL_SCALE = 0.25;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Separable box sum over a (2r+1) window with replicated edges. O(n) per axis.
function boxSum(src, w, h, r) {
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc;
      acc -= src[row + Math.min(w - 1, Math.max(0, x - r))];
      acc += src[row + Math.min(w - 1, Math.max(0, x + r + 1))];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc;
      acc -= tmp[Math.min(h - 1, Math.max(0, y - r)) * w + x];
      acc += tmp[Math.min(h - 1, Math.max(0, y + r + 1)) * w + x];
    }
  }
  return out;
}

export function luminanceFrom(rgba, w, h) {
  const gray = new Float64Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]) / 255;
  }
  return gray;
}

// Box-average a float plane down to `size`, so the tensor is computed at the
// resolution it was measured at and only the RESULT is reduced. A mark field is
// low-frequency by nature; 128 is plenty and keeps the texture array small.
function downsample(plane, w, h, size) {
  const out = new Float64Array(size * size);
  for (let oy = 0; oy < size; oy++) {
    const y0 = Math.floor((oy * h) / size);
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * h) / size));
    for (let ox = 0; ox < size; ox++) {
      const x0 = Math.floor((ox * w) / size);
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * w) / size));
      let acc = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { acc += plane[y * w + x]; n++; }
      out[oy * size + ox] = acc / Math.max(1, n);
    }
  }
  return out;
}

/**
 * Derive the mark field from one generated tile.
 *
 * @returns {{data: Uint8Array, size: number, coherence: number, density: number,
 *            direction: number}}
 *   data is RGBA8, `size` square:
 *     R  density        — where marks clot, absolute so bank identity survives
 *     G  0.5 + 0.5·coh·cos2φ  \ coherence-weighted grain, doubled angle
 *     B  0.5 + 0.5·coh·sin2φ  /
 *     A  coherence      — how directional this texel is at all
 *   `direction` is the tile-wide directional consistency, the same statistic
 *   analyse-mark-fields.py reports, so runtime and tooling can be compared.
 */
export function deriveMarkField(rgba, width, height, { size = MARK_FIELD_SIZE, radius = null } = {}) {
  if (!rgba || !(width > 0) || !(height > 0)) throw new Error('deriveMarkField needs pixels');
  if (radius == null) radius = tensorRadiusFor(Math.max(width, height));
  const gray = luminanceFrom(rgba, width, height);
  const n = width * height;

  // Central differences, edges replicated. np.gradient's convention, so the
  // JS and the Python tool agree on what they are measuring.
  const gx = new Float64Array(n);
  const gy = new Float64Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const xl = x > 0 ? i - 1 : i;
      const xr = x < width - 1 ? i + 1 : i;
      const yu = y > 0 ? i - width : i;
      const yd = y < height - 1 ? i + width : i;
      gx[i] = (gray[xr] - gray[xl]) / (xr === xl ? 1 : (x > 0 && x < width - 1 ? 2 : 1));
      gy[i] = (gray[yd] - gray[yu]) / (yd === yu ? 1 : (y > 0 && y < height - 1 ? 2 : 1));
    }
  }

  const xx = new Float64Array(n);
  const yy = new Float64Array(n);
  const xy = new Float64Array(n);
  for (let i = 0; i < n; i++) { xx[i] = gx[i] * gx[i]; yy[i] = gy[i] * gy[i]; xy[i] = gx[i] * gy[i]; }
  const jxx = boxSum(xx, width, height, radius);
  const jyy = boxSum(yy, width, height, radius);
  const jxy = boxSum(xy, width, height, radius);

  // Local contrast in the same window: E[l²] - E[l]² over (2r+1)².
  const sq = new Float64Array(n);
  for (let i = 0; i < n; i++) sq[i] = gray[i] * gray[i];
  const sumL = boxSum(gray, width, height, radius);
  const sumSq = boxSum(sq, width, height, radius);
  const window = (2 * radius + 1) ** 2;

  const cohPlane = new Float64Array(n);
  const cosPlane = new Float64Array(n);
  const sinPlane = new Float64Array(n);
  const denPlane = new Float64Array(n);
  let dirX = 0;
  let dirY = 0;
  let dirW = 0;
  let cohTotal = 0;
  let denTotal = 0;

  for (let i = 0; i < n; i++) {
    const trace = jxx[i] + jyy[i];
    const spread = Math.sqrt(Math.max(0, (jxx[i] - jyy[i]) ** 2 + 4 * jxy[i] * jxy[i]));
    const coherence = trace > 1e-12 ? clamp01(spread / trace) : 0;
    // Doubled angle of the GRADIENT, then negated to become the GRAIN — a
    // quarter turn is a sign flip once the angle is doubled.
    const theta2 = Math.atan2(2 * jxy[i], jxx[i] - jyy[i]);
    const c = -Math.cos(theta2);
    const s = -Math.sin(theta2);
    cohPlane[i] = coherence;
    cosPlane[i] = coherence * c;
    sinPlane[i] = coherence * s;
    const mean = sumL[i] / window;
    denPlane[i] = Math.sqrt(Math.max(0, sumSq[i] / window - mean * mean));
    dirX += coherence * c; dirY += coherence * s; dirW += coherence;
    cohTotal += coherence;
    denTotal += denPlane[i];
  }

  const coh = downsample(cohPlane, width, height, size);
  const cos2 = downsample(cosPlane, width, height, size);
  const sin2 = downsample(sinPlane, width, height, size);
  const den = downsample(denPlane, width, height, size);

  const data = new Uint8Array(size * size * 4);
  for (let i = 0, p = 0; i < coh.length; i++, p += 4) {
    data[p] = Math.round(255 * clamp01(den[i] / DENSITY_FULL_SCALE));
    data[p + 1] = Math.round(255 * clamp01(0.5 + 0.5 * cos2[i]));
    data[p + 2] = Math.round(255 * clamp01(0.5 + 0.5 * sin2[i]));
    data[p + 3] = Math.round(255 * clamp01(coh[i]));
  }

  return {
    data,
    size,
    coherence: cohTotal / n,
    density: denTotal / n,
    direction: Math.hypot(dirX, dirY) / Math.max(dirW, 1e-9),
  };
}

// Recover what the shader will recover, so tests and tools read the encoding
// through the same door the GPU does.
export function decodeMark(data, index) {
  const p = index * 4;
  const cos2 = data[p + 1] / 255 * 2 - 1;
  const sin2 = data[p + 2] / 255 * 2 - 1;
  return {
    density: data[p] / 255 * DENSITY_FULL_SCALE,
    // Length of the doubled-angle vector IS the coherence after any filtering,
    // which is the property that makes mips honest.
    coherence: Math.min(1, Math.hypot(cos2, sin2)),
    // Undouble. Result is in [0, π): a grain, not a direction.
    angle: Math.atan2(sin2, cos2) / 2,
    rawCoherence: data[p + 3] / 255,
  };
}

export const MARK_FIELD_DENSITY_FULL_SCALE = DENSITY_FULL_SCALE;
