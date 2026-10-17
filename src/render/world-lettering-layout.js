import { worldLetteringFont } from './world-lettering-fonts.js';

/** Fit a whole physical ink line uniformly; never use fillText's maxWidth,
 * which compresses one axis and changes the actual letter construction. */
export function fitWorldLetteringLine(ctx, text, { width, height = Infinity, maxFont = 14, minFont = 1, role = 'mono' } = {}) {
  const value = String(text ?? '');
  if (!(width > 0 && height > 0 && maxFont > 0 && minFont > 0)) throw new RangeError('Physical lettering needs positive layout bounds');
  let fontSize = maxFont, measured;
  const measure = () => {
    ctx.font = worldLetteringFont(fontSize, role); ctx.fontKerning = role.startsWith('mono') ? 'none' : 'normal';
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const m = ctx.measureText(value);
    const left = Math.max(0, Number(m.actualBoundingBoxLeft) || 0);
    return { left, width: left + Math.max(m.width, Number(m.actualBoundingBoxRight) || m.width),
      ascent: Math.max(0, Number(m.actualBoundingBoxAscent) || 0), descent: Math.max(0, Number(m.actualBoundingBoxDescent) || 0) };
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    measured = measure();
    const ratio = Math.min(1, width / Math.max(.001, measured.width), height / Math.max(.001, measured.ascent + measured.descent));
    if (ratio >= 1 - 1e-7) break;
    fontSize *= ratio * .999;
    if (fontSize < minFont) { fontSize = minFont; measured = measure(); break; }
  }
  return { text: value, font: ctx.font, fontSize, ...measured,
    fits: measured.width <= width + 1e-5 && measured.ascent + measured.descent <= height + 1e-5 };
}
