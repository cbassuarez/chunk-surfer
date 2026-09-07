// Code-native patch hardware. All coordinates are device pixels; no atlas,
// emissive UI text, generated image, or per-frame texture readback is involved.
import { drawHardwareScrew } from './hardware-faceplate.js';

export const PATCH_COLORS = Object.freeze({
  torch: '#e7b64f', recorder: '#d8715d', rig: '#6eabc9',
  nerve: '#8ab879', fork: '#b69bcc', radio: '#d49460',
});

const TAU = Math.PI * 2;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));
function gradient(ctx, x, y, w, h, stops) {
  const paint = ctx.createLinearGradient(x, y, x + w, y + h);
  for (const [at, color] of stops) paint.addColorStop(at, color);
  return paint;
}
function disc(ctx, x, y, r, paint) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = paint; ctx.fill();
}

/** A continuous rack strip, not a collection of button surrounds. */
export function drawPatchRack(ctx, x, y, w, h, { dpr = 1, seed = 0 } = {}) {
  if (!ctx || w <= 0 || h <= 0) return;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#080a09'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = gradient(ctx, x, y, 0, h, [
    [0, '#434944'], [.04, '#262d29'], [.34, '#202522'], [.82, '#171c19'], [1, '#323a34'],
  ]);
  ctx.fillRect(x + dpr, y + dpr, w - dpr * 2, h - dpr * 2);
  ctx.fillStyle = 'rgba(204,214,193,.15)';
  ctx.fillRect(x + dpr, y + dpr, w - dpr * 2, dpr * .55);
  // A punched horizontal opening reads as one rack unit across six modules.
  ctx.fillStyle = '#101411';
  ctx.fillRect(x + 7 * dpr, y + h * .54, w - 14 * dpr, h * .36);
  const screwR = Math.min(3.0 * dpr, h * .105);
  if (w > 80 * dpr) {
    drawHardwareScrew(ctx, x + 4.5 * dpr, y + h * .52, screwR, { dpr, seed: `${seed}:l` });
    drawHardwareScrew(ctx, x + w - 4.5 * dpr, y + h * .52, screwR, { dpr, seed: `${seed}:r` });
  }
  ctx.restore();
}

/** A real jack mouth: insulating ring, turned nickel lip, bevel and throat. */
export function drawPatchSocket(ctx, x, y, radius, {
  color = '#b9b6a5', connected = false, selected = false,
  compatible = false, available = true, dpr = 1,
} = {}) {
  if (!ctx || radius <= 0) return;
  const r = radius;
  ctx.save(); ctx.shadowBlur = 0;
  disc(ctx, x, y + r * .13, r * 1.12, '#070a08');
  disc(ctx, x, y, r, color);
  // The coloured insulation is a physical ring even on an unavailable socket.
  disc(ctx, x, y, r * .81, gradient(ctx, x - r, y - r, r * 2, r * 2, [
    [0, '#ddd9c4'], [.26, '#92998c'], [.45, '#454e45'], [.71, '#bdc2b1'], [1, '#586254'],
  ]));
  disc(ctx, x, y, r * .6, '#10140f');
  disc(ctx, x - r * .025, y + r * .045, r * .49,
    gradient(ctx, x, y - r * .5, 0, r, [[0, '#020402'], [.8, '#080e08'], [1, '#414a3b']]));
  ctx.beginPath(); ctx.arc(x, y, r * .73, Math.PI * 1.05, Math.PI * 1.7);
  ctx.strokeStyle = '#eeedce'; ctx.lineWidth = Math.max(.4 * dpr, r * .075); ctx.stroke();
  if (connected) disc(ctx, x, y, r * .19, '#aba996');
  // Small printed alignment indexes are separated from socket illumination.
  if (selected || compatible) {
    ctx.strokeStyle = compatible ? '#e7e7c8' : color;
    ctx.lineWidth = dpr;
    const span = r * 1.28;
    for (const sign of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x + sign * span, y - r * .36);
      ctx.lineTo(x + sign * span, y + r * .36); ctx.stroke();
    }
  }
  if (!available) {
    // A dead circuit does not erase the colour needed to identify its mate.
    ctx.fillStyle = '#657063'; ctx.fillRect(x - dpr, y + r * 1.28, dpr * 2, dpr * .6);
  }
  ctx.restore();
}

export function patchCableCurve(from, to, { sag = null, side = 1 } = {}) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const drop = sag == null ? clamp(length * .28 + 12, 12, 42) : Math.max(0, sag);
  const bow = side * clamp(Math.abs(dy) * .16 + Math.abs(dx) * .08, 7, 20);
  return {
    from: { x: from.x, y: from.y },
    c1: { x: from.x + bow, y: from.y + Math.max(drop, dy * .64) },
    c2: { x: to.x + bow, y: to.y + drop },
    to: { x: to.x, y: to.y },
  };
}

function trace(ctx, curve, offsetX = 0, offsetY = 0) {
  ctx.beginPath(); ctx.moveTo(curve.from.x + offsetX, curve.from.y + offsetY);
  ctx.bezierCurveTo(curve.c1.x + offsetX, curve.c1.y + offsetY,
    curve.c2.x + offsetX, curve.c2.y + offsetY, curve.to.x + offsetX, curve.to.y + offsetY);
}

/** One weight-bearing rubber lead, with plug barrels and a restrained glint. */
export function drawPatchCable(ctx, from, to, {
  color = '#dbad4e', dpr = 1, radius = 5, preview = false,
  valid = true, side = 1, sag = null,
} = {}) {
  if (!ctx || ![from?.x, from?.y, to?.x, to?.y].every(Number.isFinite)) return;
  const curve = patchCableCurve(from, to, { side, sag });
  ctx.save(); ctx.shadowBlur = 0; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (preview) ctx.globalAlpha *= valid ? .98 : .66;
  trace(ctx, curve, 1.4 * dpr, 2.7 * dpr);
  ctx.strokeStyle = 'rgba(0,0,0,.66)'; ctx.lineWidth = 5.2 * dpr; ctx.stroke();
  trace(ctx, curve); ctx.strokeStyle = '#080a08'; ctx.lineWidth = 5 * dpr; ctx.stroke();
  trace(ctx, curve); ctx.strokeStyle = color; ctx.lineWidth = 3.4 * dpr; ctx.stroke();
  trace(ctx, curve, -.45 * dpr, -.5 * dpr);
  ctx.strokeStyle = 'rgba(243,239,204,.27)'; ctx.lineWidth = .65 * dpr; ctx.stroke();
  for (const end of [from, to]) {
    const barrelW = Math.min(radius * 1.22, 7.5 * dpr), barrelH = Math.min(radius * 1.9, 11 * dpr);
    ctx.fillStyle = '#090b09'; ctx.fillRect(end.x - barrelW * .62, end.y - 2 * dpr, barrelW * 1.24, barrelH + 2 * dpr);
    ctx.fillStyle = gradient(ctx, end.x - barrelW / 2, end.y, barrelW, 0,
      [[0, '#302e23'], [.23, color], [.54, color], [1, '#282d22']]);
    ctx.fillRect(end.x - barrelW / 2, end.y - 1.1 * dpr, barrelW, barrelH);
    ctx.fillStyle = '#d4cfb3'; ctx.fillRect(end.x - barrelW * .49, end.y - 2 * dpr, barrelW * .98, 1.2 * dpr);
    ctx.strokeStyle = 'rgba(0,0,0,.37)'; ctx.lineWidth = .65 * dpr;
    for (let rib = 0; rib < 3; rib++) {
      const y = end.y + barrelH * .5 + rib * barrelH * .15;
      ctx.beginPath(); ctx.moveTo(end.x - barrelW * .44, y); ctx.lineTo(end.x + barrelW * .44, y); ctx.stroke();
    }
  }
  ctx.restore();
}

/** Removable service tape with paper thickness, never a raised button. */
export function drawPatchLabel(ctx, x, y, w, h, { color = '#c3c1a7', dpr = 1, selected = false } = {}) {
  if (!ctx || w <= 0 || h <= 0) return;
  ctx.save(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,.44)'; ctx.fillRect(x + .5 * dpr, y + dpr, w, h);
  ctx.fillStyle = gradient(ctx, x, y, 0, h, [[0, '#d2ceb4'], [.1, color], [.86, color], [1, '#a49f84']]);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(250,247,214,.38)'; ctx.fillRect(x, y, w, .5 * dpr);
  if (selected) {
    ctx.fillStyle = '#141b14'; ctx.fillRect(x + dpr, y + dpr, Math.min(2 * dpr, w * .04), Math.max(0, h - 2 * dpr));
  }
  ctx.restore();
}
