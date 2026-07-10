// Canvas glyph-grid compositor. Scenes/renderers never touch the canvas:
// they stream cells through begin()/cell()/end() (same call order the DOM
// renderer used to build innerHTML) and trigger effects through `fx`.
// Post passes (scanline/vignette/noise) and event FX (flash/shake/glitch,
// frame-hold and dead-grid for the corruption register) live here.

import { CELL_W, CELL_H, FONT_PX, atlasConfigure, atlasDpr, getTile } from './atlas.js';

const REDUCED_MOTION = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

const params = new URLSearchParams(location.search);
const SHOW_STATS = params.get('stats') === '1';
const CRT_ON = params.get('crt') !== '0';

let mapEl = null, canvas = null, ctx = null;      // visible
let frame = null, fctx = null;                    // offscreen frame
let cols = 0, rows = 0, cw = 0, chh = 0;          // device-px cell metrics
let cellGlyph = [], cellCls = [], cellAlpha = []; // current frame stream
let cursor = 0;
let frameMsEma = 0;

// pre-baked overlays
let scanlinePattern = null, vignette = null, noiseTiles = [];

const fxState = {
  flashUntil: 0, flashColor: 'rgba(230,236,245,0.85)', flashDur: 1,
  shakeUntil: 0, shakeAmp: 0,
  glitchUntil: 0, glitchAmp: 0,
  holdUntil: 0,           // frame-hold: skip redraw, keep last frame
  dead: false,            // dead-grid: black frame, ignores everything
};

export const fx = {
  flash(ms = 90, color = 'rgba(230,236,245,0.85)') {
    fxState.flashColor = color; fxState.flashDur = ms;
    fxState.flashUntil = performance.now() + ms;
  },
  shake(intensity = 1, ms = 220) {
    if (REDUCED_MOTION) return;
    fxState.shakeAmp = intensity; fxState.shakeUntil = performance.now() + ms;
  },
  glitch(intensity = 1, ms = 240) {
    if (REDUCED_MOTION) return;
    fxState.glitchAmp = intensity; fxState.glitchUntil = performance.now() + ms;
  },
  hold(ms = 400) { fxState.holdUntil = performance.now() + ms; },
  dead(on = true) { fxState.dead = on; },
};

function bakeOverlays() {
  const p = document.createElement('canvas');
  p.width = 1; p.height = 4;
  const pc = p.getContext('2d');
  pc.fillStyle = 'rgba(0,0,0,0.55)';
  pc.fillRect(0, 2, 1, 2);
  scanlinePattern = ctx.createPattern(p, 'repeat');

  vignette = document.createElement('canvas');
  vignette.width = canvas.width; vignette.height = canvas.height;
  const vc = vignette.getContext('2d');
  const grad = vc.createRadialGradient(
    canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.42,
    canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.78
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.42)');
  vc.fillStyle = grad;
  vc.fillRect(0, 0, canvas.width, canvas.height);

  noiseTiles = [];
  for (let n = 0; n < 4; n++) {
    const t = document.createElement('canvas');
    t.width = 128; t.height = 128;
    const tc = t.getContext('2d');
    const img = tc.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() * 2 - 1) * 128;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 14;
    }
    tc.putImageData(img, 0, 0);
    noiseTiles.push(t);
  }
}

export function canvasSetup(el) {
  mapEl = el;
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  mapEl.textContent = '';
  mapEl.appendChild(canvas);
  ctx = canvas.getContext('2d');
  frame = document.createElement('canvas');
  fctx = frame.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  return { viewDims };
}

function resize() {
  atlasConfigure(window.devicePixelRatio);
  const dpr = atlasDpr();
  const w = Math.max(1, mapEl.clientWidth), h = Math.max(1, mapEl.clientHeight);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  frame.width = canvas.width; frame.height = canvas.height;
  cw = CELL_W * dpr; chh = CELL_H * dpr;
  bakeOverlays();
}

// Same viewport math as the DOM path's computeViewDims — identical FOV.
export function viewDims() {
  return {
    w: Math.max(40, Math.floor(mapEl.clientWidth / CELL_W)),
    h: Math.max(10, Math.floor(mapEl.clientHeight / CELL_H)),
  };
}

export function begin(viewW, viewH) {
  cols = viewW; rows = viewH; cursor = 0;
  const n = cols * rows;
  if (cellGlyph.length !== n) {
    cellGlyph = new Array(n); cellCls = new Array(n); cellAlpha = new Float32Array(n);
  }
}

export function cell(glyph, cls, alpha) {
  cellGlyph[cursor] = glyph;
  cellCls[cursor] = cls;
  cellAlpha[cursor] = alpha == null ? 1 : +alpha;
  cursor++;
}

export function space() {
  cellGlyph[cursor] = null;
  cursor++;
}

export function end() {
  const t0 = performance.now();
  if (fxState.dead) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  if (t0 < fxState.holdUntil) return; // frame-hold: keep what's on screen

  fctx.clearRect(0, 0, frame.width, frame.height);
  const pulse = 0.72 + 0.28 * Math.sin(t0 / 255); // shared t-key style pulse
  for (let i = 0; i < cols * rows; i++) {
    const glyph = cellGlyph[i];
    if (glyph == null || glyph === ' ') continue;
    const tile = getTile(glyph, cellCls[i] || '');
    const a = cellAlpha[i];
    const mod = tile.pulse ? pulse : 1;
    if (a * mod !== 1) fctx.globalAlpha = Math.max(0, Math.min(1, a * mod));
    fctx.drawImage(tile.canvas, (i % cols) * cw - tile.ox, ((i / cols) | 0) * chh - tile.oy);
    if (a * mod !== 1) fctx.globalAlpha = 1;
  }
  composite(t0);
  frameMsEma = frameMsEma * 0.9 + (performance.now() - t0) * 0.1;
}

function composite(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  if (now < fxState.shakeUntil) {
    const k = fxState.shakeAmp * atlasDpr();
    ctx.translate((Math.random() * 2 - 1) * 2 * k, (Math.random() * 2 - 1) * 2 * k);
  }
  if (now < fxState.glitchUntil) {
    const k = fxState.glitchAmp * atlasDpr();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.drawImage(frame, -2 * k, 0);
    ctx.drawImage(frame, 2 * k, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // displaced horizontal slices
    const slices = 3 + ((Math.random() * 3) | 0);
    for (let s = 0; s < slices; s++) {
      const sy = (Math.random() * canvas.height) | 0;
      const sh = 4 + ((Math.random() * 14 * k) | 0);
      const dx = (Math.random() * 2 - 1) * 18 * k;
      ctx.drawImage(frame, 0, sy, canvas.width, sh, dx, sy, canvas.width, sh);
    }
  } else {
    ctx.drawImage(frame, 0, 0);
  }
  ctx.restore();

  const budgetOk = frameMsEma < 12;
  if (CRT_ON) {
    if (budgetOk && !REDUCED_MOTION) {
      const t = noiseTiles[(now / 80 | 0) % noiseTiles.length];
      ctx.save();
      ctx.globalAlpha = 0.5;
      const ox = -((now / 16) % 128), oy = -((now / 23) % 128);
      for (let y = oy; y < canvas.height; y += 128)
        for (let x = ox; x < canvas.width; x += 128) ctx.drawImage(t, x, y);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = scanlinePattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.drawImage(vignette, 0, 0);
  }
  if (now < fxState.flashUntil) {
    ctx.save();
    ctx.globalAlpha = (fxState.flashUntil - now) / fxState.flashDur;
    ctx.fillStyle = fxState.flashColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  if (SHOW_STATS) {
    ctx.save();
    ctx.font = `${11 * atlasDpr()}px 'Courier New', monospace`;
    ctx.fillStyle = '#7f8';
    ctx.textAlign = 'right';
    ctx.fillText(`${frameMsEma.toFixed(1)}ms`, canvas.width - 8, 14 * atlasDpr());
    ctx.restore();
  }
}

// Boot/loading screen path: plain text lines, no grid semantics.
export function textScreen(text) {
  if (!ctx) return;
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const dpr = atlasDpr();
  ctx.font = `${FONT_PX * dpr}px 'Courier New', Courier, monospace`;
  ctx.fillStyle = '#bbbbbb';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 4 * dpr, (i * CELL_H + 2) * dpr);
  }
}
