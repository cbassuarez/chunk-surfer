import { hardwareEffectsReduced } from './hardware-material.js';
import { uiBrightness } from './palette.js';
import { PATCH_LCD_GLYPHS } from './patch-lcd-glyphs.js';

const COLORS = Object.freeze({
  torch: ['#ffd474', '#ec962d'],
  recorder: ['#ff9785', '#e35b52'],
  rig: ['#9ae2f3', '#47adce'],
  nerve: ['#c2ec95', '#8bc957'],
  fork: ['#e0baff', '#ab72e8'],
  radio: ['#ffbc85', '#e47945'],
});
const LEVELS = Object.freeze({
  idle: .31, locked: .25, ready: .47, pulled: .31, patched: .88, pending: 1,
});
const masks = new Map();

export function skillLcdState(entry) {
  if (entry.pending) return 'pending';
  if (entry.owned) return 'patched';
  if (entry.emptied) return 'pulled';
  return entry.enabled ? 'ready' : 'locked';
}

// Every technique has its own indicator. The channel badge repeats the
// selected fitted technique or, when browsing elsewhere, the furthest patch.
export function channelLcdState(branch, entries, selectedId) {
  const fitted = entries.filter(entry => entry.owned || entry.pending);
  const entry = fitted.find(entry => entry.id === selectedId)
    ?? fitted.reduce((highest, candidate) => !highest || candidate.tier > highest.tier ? candidate : highest, null);
  return entry ? { glyph: entry.techniqueId, state: skillLcdState(entry) } : { glyph: branch, state: 'idle' };
}

function electrodeMasks(glyph) {
  if (masks.has(glyph)) return masks.get(glyph);
  const rows = PATCH_LCD_GLYPHS[glyph];
  const off = new Path2D();
  const on = new Path2D();
  const bloom = new Path2D();
  const highlight = new Path2D();
  rows.forEach((row, y) => [...row].forEach((dot, x) => {
    const active = dot === '#';
    (active ? on : off).rect(x + .11, y + .11, .78, .78);
    if (active) {
      bloom.rect(x - .09, y - .09, 1.18, 1.18);
      highlight.rect(x + .13, y + .12, .73, .15);
    }
  }));
  const pattern = { off, on, bloom, highlight };
  masks.set(glyph, pattern);
  return pattern;
}

function box(ctx, x, y, w, h, radius, paint) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = paint;
  ctx.fill();
}

export function patchLcdColors(branch) {
  return COLORS[branch] ?? COLORS.torch;
}

export function drawPatchLcd(ctx, x, y, width, height, { branch, glyph = branch, state = 'idle' }) {
  const id = PATCH_LCD_GLYPHS[glyph] ? glyph : branch;
  if (!PATCH_LCD_GLYPHS[id] || width < 7 || height < 6) return;
  const [ink, backlight] = patchLcdColors(branch);
  const lit = state === 'patched' || state === 'pending';
  const brightness = uiBrightness();
  const glow = lit && !hardwareEffectsReduced();
  const left = x - width / 2;
  const top = y - height / 2;
  const bezel = Math.min(1.65, width * .09);
  const pitch = Math.min((width - bezel * 2 - 1) / 11, (height - bezel * 2 - 1) / 9);
  const radius = Math.min(2.7, height * .14);
  ctx.save();
  box(ctx, left, top + .55, width, height, radius, '#676a55');
  box(ctx, left, top - .25, width, height, radius, '#090e0c');
  box(ctx, left + bezel, top + bezel, width - bezel * 2, height - bezel * 2, radius * .64, '#101c16');
  const alpha = ctx.globalAlpha;
  if (glow) {
    const wash = ctx.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * .66);
    wash.addColorStop(0, backlight + '8c');
    wash.addColorStop(1, backlight + '00');
    ctx.globalAlpha = alpha * Math.min(1, brightness) * .62;
    box(ctx, left + bezel, top + bezel, width - bezel * 2, height - bezel * 2, radius * .64, wash);
  }

  const pattern = electrodeMasks(id);
  ctx.translate(x - 5.5 * pitch, y - 4.5 * pitch);
  ctx.scale(pitch, pitch);
  ctx.fillStyle = backlight;
  ctx.globalAlpha = alpha * .15;
  ctx.fill(pattern.off);
  if (glow) {
    ctx.globalAlpha = alpha * Math.min(1, brightness) * .24;
    ctx.fill(pattern.bloom);
  }
  ctx.fillStyle = lit ? ink : '#a3af97';
  ctx.globalAlpha = alpha * Math.min(1, LEVELS[state] * Math.max(lit ? .62 : .52, brightness));
  ctx.fill(pattern.on);
  if (glow) {
    ctx.fillStyle = '#fff3d7';
    ctx.globalAlpha = alpha * .38;
    ctx.fill(pattern.highlight);
  }
  ctx.restore();

  // The separate amber mark identifies a patch waiting for the case to close.
  if (state === 'pending' && width >= 21) {
    ctx.save();
    ctx.globalAlpha *= Math.min(1, Math.max(.6, brightness));
    ctx.fillStyle = '#f3ba60';
    ctx.fillRect(left + width - bezel - 3, top + bezel + 1, 2, 2);
    ctx.restore();
  }
}
