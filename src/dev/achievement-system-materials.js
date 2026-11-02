/**
 * Study-only bridge to the shipping instrument renderer. No achievement rules,
 * save access, clocks, animation loop, layout, or network activity live here.
 * All coordinates and font sizes are DEVICE PIXELS. Pass dpr once per call;
 * do not additionally scale the context. This matches the production helpers.
 */
import {
  drawInstrumentPlate, drawInstrumentWell, drawInstrumentGlass, drawVfdGrid,
  clearInstrumentMaterialCache, instrumentMaterialCacheStats,
} from '../render/instrument-material.js';
import { drawHardwarePrint, drawHardwareScrew } from '../render/hardware-faceplate.js';
import { drawHardwareCap, hardwareCapGeometry, hardwareMaterialCacheStats } from '../render/hardware-material.js';
import { drawElectronicText, measureElectronicText, electronicTextCacheStats } from '../render/electronic-text.js';
import { drawVfdDots } from '../render/vfd-font.js';

let paperStock = null;
const finite = (v, d) => Number.isFinite(v) ? v : d;
const clamp01 = v => Math.max(0, Math.min(1, finite(v, 1)));
const withAlpha = (ctx, options, fn) => {
  ctx.save();
  ctx.globalAlpha *= clamp01(options?.alpha);
  try { return fn(); } finally { ctx.restore(); }
};

export const provenance = Object.freeze({
  purpose: 'Three non-shipping achievement-system comparisons',
  coordinateSpace: 'device pixels; unscaled Canvas 2D context',
  plate: 'src/render/instrument-material.js:drawInstrumentPlate',
  aperture: 'src/render/instrument-material.js:drawInstrumentWell',
  glass: 'src/render/instrument-material.js:drawInstrumentGlass',
  passiveLettering: 'src/render/hardware-faceplate.js:drawHardwarePrint',
  vfd: 'src/render/electronic-text.js + src/render/vfd-font.js',
  lcd: 'src/render/electronic-text.js',
  caps: 'src/render/hardware-material.js',
  paper: 'protected unprinted crop of assets/paper/inspect/work-order-ffc40254-0.webp',
  font: 'vendored URW Nimbus families, used by approved hardware/paper work',
  limits: 'Canvas UI-overlay comparison. It is not a world-dither capture, native-game acceptance, reading test, or a new production achievement implementation.',
});

export function plate(ctx, options = {}) {
  return withAlpha(ctx, options, () => drawInstrumentPlate(ctx, {
    ...options, finish: options.mode || options.finish || 'anodized',
  }));
}
export function well(ctx, options = {}) {
  return withAlpha(ctx, options, () => drawInstrumentWell(ctx, options));
}
export function glass(ctx, options = {}) {
  return withAlpha(ctx, options, () => drawInstrumentGlass(ctx, options));
}
export function grid(ctx, options = {}) {
  return withAlpha(ctx, options, () => drawVfdGrid(ctx, options));
}
export function cap(ctx, options = {}) {
  const { x = 0, y = 0, w, h, ...finish } = options;
  return drawHardwareCap(ctx, x, y, w, h, finish);
}
export const capGeometry = hardwareCapGeometry;
export const screw = drawHardwareScrew;

function electronic(ctx, text, x, y, options, mode) {
  const { fontPx, width, ...rest } = options;
  return drawElectronicText(ctx, text, x, y, {
    ...rest, mode, fontSize: finite(fontPx, finite(rest.fontSize, 14)),
    maxWidth: finite(width, rest.maxWidth),
  });
}
export function vfd(ctx, text, x, y, options = {}) {
  return electronic(ctx, text, x, y, options, 'vfd');
}
export function lcd(ctx, text, x, y, options = {}) {
  return electronic(ctx, text, x, y, options, 'lcd');
}
export function measureDisplay(text, options = {}) {
  return measureElectronicText(text, {
    ...options, fontSize: finite(options.fontPx, finite(options.fontSize, 14)),
  });
}
export const dots = drawVfdDots;

/** Ink/etch on the physical panel: production label sizing and tracking.
 * This is a top-left layout box, not a baseline. Typography never stretches.
 * The production faceplate renderer intentionally caps permanent labels at
 * 12 logical px and screen print at 15; use type() for larger archive titles.
 */
export function ink(ctx, text, x, y, options = {}) {
  return drawHardwarePrint(ctx, text, x, y, {
    ...options, finish: options.finish || 'screenprint',
  });
}
export function etch(ctx, text, x, y, options = {}) {
  return ink(ctx, text, x, y, { ...options, finish: 'etched' });
}

/** Solid type using the same vendored faces. No outline, glow, erosion, or
 * counterfeit wear. Text shaping is ordinary Canvas with real font metrics.
 */
export function type(ctx, text, x, y, options = {}) {
  const dpr = finite(options.dpr, 1);
  const family = options.family === 'mono' ? '"Nimbus Mono PS", monospace'
    : options.family === 'serif' ? '"Nimbus Roman", serif'
    : '"Hardware Sans", "Nimbus Sans", sans-serif';
  const fontPx = finite(options.fontPx, 14 * dpr);
  const weight = options.weight || 400;
  return withAlpha(ctx, options, () => {
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.font = `${weight} ${fontPx}px ${family}`;
    ctx.fillStyle = options.color || '#dcd8c4';
    ctx.textAlign = options.align || 'left';
    ctx.textBaseline = options.baseline || 'alphabetic';
    const metrics = ctx.measureText(String(text));
    if (Number.isFinite(options.width) && metrics.width > options.width) {
      ctx.font = `${weight} ${fontPx * options.width / metrics.width}px ${family}`;
    }
    ctx.fillText(String(text), x, y);
    return ctx.measureText(String(text));
  });
}

/** Call after decoding the embedded stock data URL. No network fetch occurs. */
export function setPaperStock(image) { paperStock = image || null; }

/** Reuses protected, unprinted stock from the actual approved paper bake.
 * It adds no foxing, scratches, folds, grain noise, damage, or invented history.
 * A thin paper edge and the shadow cast by the sheet establish its thickness.
 */
export function paper(ctx, options = {}) {
  const { x = 0, y = 0, w, h } = options;
  if (!(w > 0 && h > 0)) return null;
  const dpr = finite(options.dpr, 1), edge = Math.max(.5, dpr * .7);
  return withAlpha(ctx, options, () => {
    ctx.shadowBlur = 13 * dpr;
    ctx.shadowOffsetY = 6 * dpr;
    ctx.shadowColor = '#0009';
    ctx.fillStyle = '#c5c1b4';
    ctx.fillRect(x, y + edge, w, h);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#eeece2';
    ctx.fillRect(x, y, w, h - edge);
    if (paperStock) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h - edge); ctx.clip();
      // Crop already has the source bake's stock colour/structure. Use an
      // integer physical tile size, avoiding frame-dependent interpolation.
      const scale = Math.max(.5, dpr), pw = paperStock.width * scale;
      const ph = paperStock.height * scale;
      for (let py = y; py < y + h; py += ph) for (let px = x; px < x + w; px += pw) {
        ctx.drawImage(paperStock, px, py, pw, ph);
      }
      ctx.restore();
    }
    ctx.fillStyle = '#fffdf654';
    ctx.fillRect(x, y, w, edge);
    return { x, y, w, h, stockReady: !!paperStock };
  });
}

export function caches() {
  return { instrument: instrumentMaterialCacheStats(), caps: hardwareMaterialCacheStats(), display: electronicTextCacheStats() };
}
export function clearPlateCache() { clearInstrumentMaterialCache(); }

// Verbose aliases make composition code explicit without another dependency.
export const drawActualPlate = plate;
export const drawActualWell = well;
export const drawActualGlass = glass;
export const drawActualVfd = vfd;
export const drawActualLcd = lcd;
export const drawActualInk = ink;
export const drawActualPaper = paper;
