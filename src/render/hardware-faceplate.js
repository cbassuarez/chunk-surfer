// Passive hardware, not a light-emitting display. These raw Canvas helpers use
// device-pixel coordinates; callers convert their UI-cell geometry once. They
// never read time, a theme's phosphor brightness, or the current hover state.

const TAU = Math.PI * 2;
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const FONT_FAMILY = '"Hardware Sans", "Nimbus Sans", "Helvetica Neue", Arial, sans-serif';
const PRINT_LAYOUT_LIMIT = 128;
const printLayouts = new WeakMap();

function printLayout(ctx, value, height, width, scale, finish) {
  const faceplate = finish === 'faceplate' || finish === 'etched';
  const weight = faceplate ? 400 : finish === 'engraved' ? 500 : 600;
  // Fonts may finish decoding after the first title paint. Readiness is part of
  // the key, so a fallback face never permanently supplies a shipped layout.
  // Ask for this finish's weight: regular can be ready while bold is decoding.
  const ready = typeof document === 'undefined' || !document.fonts?.check
    ? 'headless' : document.fonts.check(`${weight} 12px "Hardware Sans"`);
  const key = JSON.stringify([value, height, width, scale, finish, ready]);
  let cache = printLayouts.get(ctx);
  if (!cache) { cache = new Map(); printLayouts.set(ctx, cache); }
  if (cache.has(key)) return cache.get(key);
  // A panel's permanent service markings are subordinate to a control's ink.
  // Keep the distinction in the material primitive so differently sized UI
  // surfaces cannot quietly turn every label back into a bold button legend.
  let fontSize = Math.min(height * 0.91, (faceplate ? 12 : 15) * scale);
  const letters = Array.from(value);
  let tracking, widths, inkWidth;
  const measure = () => {
    ctx.font = `${weight} ${fontSize}px ${FONT_FAMILY}`;
    tracking = fontSize * (faceplate ? 0.085 : 0.055);
    widths = letters.map((letter) => ctx.measureText(letter).width);
    inkWidth = widths.reduce((sum, w) => sum + w, 0) + tracking * Math.max(0, letters.length - 1);
  };
  measure();
  if (width != null && inkWidth > width) {
    fontSize *= width / inkWidth;
    measure();
  }
  const metrics = ctx.measureText(value);
  const layout = {
    letters, fontSize, font: ctx.font, tracking, widths, inkWidth,
    ascent: finite(metrics.actualBoundingBoxAscent, fontSize * 0.74),
    descent: finite(metrics.actualBoundingBoxDescent, fontSize * 0.12),
  };
  if (cache.size >= PRINT_LAYOUT_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, layout);
  return layout;
}

function seedValue(value) {
  const source = String(value);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(i), 16777619) >>> 0;
  }
  return hash / 0xffffffff;
}

function disc(ctx, x, y, radius, fill) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

function ramp(ctx, x0, y0, x1, y1, stops) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

/**
 * One countersunk, slotted steel fastener. cx/cy are the centre of its seat and
 * radius is the complete seat's radius, in device pixels (typically 3–4 * dpr).
 * The seat and head are lit from upper left; only the milled slot rotates.
 * `seed` is a stable panel/corner identity, never a frame counter. `darkPanel`
 * adjusts reflected steel, not geometry. No glow or shadowBlur is introduced.
 */
export function drawHardwareScrew(ctx, cx, cy, radius, {
  seed = 0, alpha = 1, dpr = 1, darkPanel = true,
} = {}) {
  if (!ctx || ![cx, cy, radius].every(Number.isFinite) || radius <= 0 || alpha <= 0) return;
  const r = radius;
  const scale = Math.max(0.1, finite(dpr, 1));
  const angle = (seedValue(seed) * 0.82 + 0.09) * Math.PI;
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Punched seat: a black seam remains around the conical countersink. Its
  // highlight is below/right because this surface slopes into the panel.
  disc(ctx, cx, cy + r * 0.08, r, '#080a09');
  disc(ctx, cx, cy, r * 0.91, ramp(ctx, cx - r, cy - r, cx + r, cy + r, [
    [0, '#141817'], [0.38, '#424844'], [0.68, darkPanel ? '#aaa99e' : '#d0cbb9'], [1, '#525951'],
  ]));
  disc(ctx, cx, cy, r * 0.76, '#191d1b');

  // A domed head with a narrow turned rim, rather than a flat painted circle.
  const head = ctx.createRadialGradient(cx - r * 0.27, cy - r * 0.34, r * 0.02, cx, cy, r * 0.73);
  for (const [at, color] of [
    [0, darkPanel ? '#d0cec2' : '#e0dccc'], [0.34, '#a6aa9f'], [0.72, '#70786e'], [0.9, '#485047'], [1, '#a1a497'],
  ]) head.addColorStop(at, color);
  disc(ctx, cx, cy, r * 0.71, head);
  ctx.strokeStyle = 'rgba(243,239,216,0.55)';
  ctx.lineWidth = Math.min(r * 0.085, scale * 0.45);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.64, Math.PI * 1.08, Math.PI * 1.73);
  ctx.stroke();

  // A true recessed single slot: square-cut ends, dark floor and a thin lower
  // cut edge. Lighting on the head above does not turn with the screwdriver.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const slotLength = r * 1.08;
  const slotWidth = Math.max(r * 0.17, Math.min(scale * 0.52, r * 0.22));
  ctx.fillStyle = '#20251f';
  ctx.fillRect(-slotLength / 2, -slotWidth * 0.76, slotLength, slotWidth * 1.44);
  ctx.fillStyle = '#070a08';
  ctx.fillRect(-slotLength / 2, -slotWidth / 2, slotLength, slotWidth);
  ctx.fillStyle = 'rgba(233,233,209,0.55)';
  ctx.fillRect(-slotLength * 0.47, slotWidth * 0.55, slotLength * 0.94, Math.min(r * 0.055, scale * 0.3));
  ctx.restore();

  // One restrained, stable machining mark. Omit it at tiny sizes where a
  // scratch would become a second slot and erase the reading of the fastener.
  if (r >= 3 * scale) {
    ctx.strokeStyle = 'rgba(242,237,217,0.15)';
    ctx.lineWidth = scale * 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.46, angle + 0.38, angle + 0.96);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Real printed/engraved sans lettering. x/y is the TOP LEFT of its layout box,
 * not a baseline. width/height are device pixels; height defaults to 14 * dpr.
 * Left/centre/right alignment happens inside that box. Text remains upright:
 * long labels shrink their font, never horizontally stretch their letterforms.
 * Returns its measured layout for callers that need to place adjacent hardware.
 *
 * `screenprint`: the bolder cap legend, with a 15-logical-pixel maximum.
 * `faceplate`: regular-weight permanent service markings, 12-logical-pixel max
 * and wider 0.085em tracking. Both use one ink layer and stable, barely visible
 * ink density variation. `engraved`: a cut with a lower-right caught edge.
 * Neither finish uses emissive blur, VFD glyphs or animated texture. At small
 * sizes texture is omitted entirely so required labels stay legible.
 */
export function drawHardwarePrint(ctx, text, x, y, {
  width, height, color = '#b7b6a9', alpha = 1, align = 'left',
  finish = 'screenprint', seed = 0, dpr = 1, darkPanel = true,
} = {}) {
  const value = String(text ?? '').replace(/[\r\n\t]+/g, ' ');
  const scale = Math.max(0.1, finite(dpr, 1));
  const h = finite(height, 14 * scale);
  const requestedWidth = width == null ? null : finite(width);
  if (!ctx || !value || ![x, y].every(Number.isFinite) || h <= 0 || requestedWidth === 0 || alpha <= 0) return null;
  if (requestedWidth != null && requestedWidth < 0) return null;
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  const baseAlpha = ctx.globalAlpha;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fontKerning = 'normal';

  const { letters, fontSize, font, tracking, widths, inkWidth, ascent, descent } = printLayout(ctx, value, h, requestedWidth, scale, finish);
  ctx.font = font;
  const w = requestedWidth ?? inkWidth;
  const baseline = y + (h - ascent - descent) / 2 + ascent;
  const startX = x + (align === 'right' ? w - inkWidth : (align === 'center' || align === 'centre') ? (w - inkWidth) / 2 : 0);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const stamp = (offsetX, offsetY, ink, opacity, varied) => {
    let cursor = startX;
    ctx.fillStyle = ink;
    for (let i = 0; i < letters.length; i += 1) {
      // Small print is clean. Larger print gets ink density, not missing pixels
      // or jittered glyph positions: these are labels, not horror typography.
      const density = varied && fontSize >= 12 * scale ? 0.98 + seedValue(`${seed}:${i}`) * 0.02 : 1;
      ctx.globalAlpha = baseAlpha * opacity * density;
      ctx.fillText(letters[i], cursor + offsetX, baseline + offsetY);
      cursor += widths[i] + tracking;
    }
  };
  if (finish === 'etched') {
    // Approved instrument finish: a very shallow, ink-filled incision. The
    // caught lower wall must not turn the marking into embossed white type.
    stamp(scale * 0.10, scale * 0.27, darkPanel ? '#b8c2ad' : '#fffff1', darkPanel ? .20 : .48, false);
    stamp(-scale * 0.09, -scale * 0.16, darkPanel ? '#080d0d' : '#38382d', .40, false);
  } else if (finish === 'engraved') {
    stamp(scale * 0.22, scale * 0.36, darkPanel ? '#ece7ce' : '#f8f3dd', 0.34, false);
    stamp(-scale * 0.13, -scale * 0.15, '#050706', 0.44, false);
  }
  stamp(0, 0, color, 1, finish !== 'engraved' && finish !== 'etched');
  ctx.restore();
  return { x: startX, y, width: inkWidth, height: h, baseline, fontSize };
}
