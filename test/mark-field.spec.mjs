// The mark field is about to become the thing that draws this game, so its
// derivation is tested against inputs whose correct answer is known by
// inspection rather than by running the code and blessing the output.
//
// The load-bearing property is the doubled-angle encoding. A grain is a line:
// 10° and 190° are the same floorboard. If that wrap is not handled, mipmapping
// and bilinear filtering will produce confident perpendicular garbage exactly
// where two materials meet.

import assert from 'node:assert/strict';
import {
  MARK_FIELD_SIZE,
  MARK_FIELD_DENSITY_FULL_SCALE,
  decodeMark,
  deriveMarkField,
  luminanceFrom,
} from '../src/render/mark-field.js';

const W = 128;

// Build an RGBA tile from a luminance function of (x, y).
function tile(fn, w = W, h = W) {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(255, Math.round(fn(x, y) * 255)));
      const p = (y * w + x) * 4;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

const mean = (field, pick) => {
  let acc = 0;
  const count = field.size * field.size;
  for (let i = 0; i < count; i++) acc += pick(decodeMark(field.data, i));
  return acc / count;
};

// Angles are lines, so compare them modulo π, not modulo 2π.
function grainError(a, b) {
  let d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}

const STRIPE = (v) => 0.5 + 0.4 * Math.sin(v * Math.PI / 4);

// ── the grain runs along the stripes, not across them ───────────────────────
{
  // Horizontal stripes: luminance varies with y, so the GRADIENT is vertical
  // and the GRAIN — what the engraving should stretch along — is horizontal.
  const horizontal = deriveMarkField(tile((_x, y) => STRIPE(y)), W, W, { size: 32 });
  const vertical = deriveMarkField(tile((x) => STRIPE(x)), W, W, { size: 32 });
  const diagonal = deriveMarkField(tile((x, y) => STRIPE(x + y)), W, W, { size: 32 });

  const angleOf = (field) => {
    // Average in doubled-angle space; averaging raw angles is the bug this
    // encoding exists to prevent.
    let cx = 0; let cy = 0;
    for (let i = 0; i < field.size * field.size; i++) {
      const m = decodeMark(field.data, i);
      cx += m.coherence * Math.cos(2 * m.angle);
      cy += m.coherence * Math.sin(2 * m.angle);
    }
    return Math.atan2(cy, cx) / 2;
  };

  assert.ok(grainError(angleOf(horizontal), 0) < 0.06,
    `horizontal stripes grain along x, got ${angleOf(horizontal).toFixed(3)} rad`);
  assert.ok(grainError(angleOf(vertical), Math.PI / 2) < 0.06,
    `vertical stripes grain along y, got ${angleOf(vertical).toFixed(3)} rad`);
  assert.ok(grainError(angleOf(diagonal), -Math.PI / 4) < 0.10,
    `diagonal stripes grain on the anti-diagonal, got ${angleOf(diagonal).toFixed(3)} rad`);

  for (const [name, field] of [['horizontal', horizontal], ['vertical', vertical]]) {
    assert.ok(field.direction > 0.85, `${name} stripes are near-perfectly directional (${field.direction.toFixed(3)})`);
    assert.ok(mean(field, (m) => m.coherence) > 0.7, `${name} stripes are coherent everywhere`);
  }
}

// ── noise has no grain, and says so ─────────────────────────────────────────
{
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const noise = deriveMarkField(tile(() => rand()), W, W, { size: 32 });
  assert.ok(noise.direction < 0.25, `isotropic noise has no tile-wide direction (${noise.direction.toFixed(3)})`);

  const flat = deriveMarkField(tile(() => 0.5), W, W, { size: 32 });
  assert.equal(flat.coherence, 0, 'a flat tile has no grain at all');
  assert.ok(mean(flat, (m) => m.density) < 0.002, 'and no density');
  for (let i = 0; i < flat.size * flat.size; i++) {
    assert.ok(decodeMark(flat.data, i).coherence < 0.01, 'flat decodes to zero-length everywhere');
  }
}

// ── the encoding survives filtering, which is the whole point ───────────────
{
  // Two grains a quarter turn apart must AVERAGE TO UNCERTAINTY, not to a
  // confident direction between them. This is what a mip of a boundary does,
  // and getting it wrong is how you get perpendicular garbage at every seam.
  const encode = (angle, coherence) => {
    const c = coherence * Math.cos(2 * angle);
    const s = coherence * Math.sin(2 * angle);
    return [0, Math.round(255 * (0.5 + 0.5 * c)), Math.round(255 * (0.5 + 0.5 * s)), 255];
  };
  const a = encode(0, 1);
  const b = encode(Math.PI / 2, 1);
  const blended = Uint8Array.from([0, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 255]);
  assert.ok(decodeMark(blended, 0).coherence < 0.02,
    'perpendicular grains cancel to no grain, so a mixed mip is honestly uncertain');

  // Two grains that agree must survive at full strength — including across the
  // ±180° wrap, where a naive angle encoding averages to perpendicular.
  const same = encode(0.35, 1);
  const wrapped = encode(0.35 + Math.PI, 1);
  const kept = Uint8Array.from([0, (same[1] + wrapped[1]) / 2, (same[2] + wrapped[2]) / 2, 255]);
  const keptMark = decodeMark(kept, 0);
  assert.ok(keptMark.coherence > 0.98, 'the same grain 180° apart is the same grain');
  // RGBA8 puts ~1/255 on each vector component, which is ~0.004 rad on the
  // doubled angle and so ~0.002 rad — a tenth of a degree — on the grain.
  // That is the precision the texture format buys, and it is ample: the
  // anisotropic warp cannot resolve anything near it.
  assert.ok(grainError(keptMark.angle, 0.35) < 0.01,
    `angle survives the wrap to 8-bit precision (off by ${grainError(keptMark.angle, 0.35).toFixed(5)} rad)`);
}

// ── density is absolute, because bank identity lives there ──────────────────
{
  // Measured: calm 0.049 local contrast, rupture 0.141 — a 191% spread and the
  // strongest signal the six banks have. Per-tile normalisation would erase it,
  // so a low-contrast tile must decode LOWER than a high-contrast one.
  const quiet = deriveMarkField(tile((_x, y) => 0.5 + 0.05 * Math.sin(y * Math.PI / 4)), W, W, { size: 32 });
  const violent = deriveMarkField(tile((_x, y) => 0.5 + 0.45 * Math.sin(y * Math.PI / 4)), W, W, { size: 32 });
  const quietDensity = mean(quiet, (m) => m.density);
  const violentDensity = mean(violent, (m) => m.density);
  assert.ok(violentDensity > quietDensity * 4,
    `contrast survives into density (${quietDensity.toFixed(4)} vs ${violentDensity.toFixed(4)})`);
  assert.ok(violentDensity < MARK_FIELD_DENSITY_FULL_SCALE, 'and stays inside the calibrated range');
  // Both instruments agree on ORIENTATION regardless of contrast.
  assert.ok(Math.abs(quiet.direction - violent.direction) < 0.1,
    'direction is independent of how loud the material is');
}

// ── shape, defaults and refusals ────────────────────────────────────────────
{
  const field = deriveMarkField(tile((_x, y) => STRIPE(y)), W, W);
  assert.equal(field.size, MARK_FIELD_SIZE);
  assert.equal(field.data.length, MARK_FIELD_SIZE * MARK_FIELD_SIZE * 4);
  assert.ok(field.data instanceof Uint8Array, 'uploadable to texImage3D without a copy');

  // Non-square and non-power-of-two sources must not crash: generated tiles are
  // 512 today but the burst path already degrades 384 -> 320.
  const odd = deriveMarkField(tile((_x, y) => STRIPE(y), 96, 60), 96, 60, { size: 16 });
  assert.equal(odd.data.length, 16 * 16 * 4);
  assert.ok(odd.direction > 0.8, 'and still finds the grain');

  assert.throws(() => deriveMarkField(null, 8, 8), /needs pixels/);
  assert.throws(() => deriveMarkField(new Uint8Array(4), 0, 8), /needs pixels/);

  const gray = luminanceFrom(Uint8Array.from([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
  assert.ok(Math.abs(gray[0] - 1) < 1e-9 && gray[1] === 0, 'luminance is Rec.709');
}

console.log('# mark field tests ok');
