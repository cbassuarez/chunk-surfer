// The instrument surfaces, modelled on the A k a i AM M5 / HX M5 and the hi ta chi
// DA-1000. Two rules the landed refactor broke:
//
//   1. NO GRADIENTS. A VFD is flat black glass. All the depth is the phosphor
//      glow on lit elements and the dim silkscreen legends that never light.
//   2. TEXT IS A DOT MATRIX, not a segment font (see render/vfd-font.js, wired
//      through the atlas). Segments are for the numeric counter only.
//
// A machine panel is a faceplate: a matte bezel, a wordmark, a champagne model
// strip, silkscreen header/footer legends, and the lit data on the glass.

import { uiDraw, uiFill, uiText } from './ui.js';
import { activeTheme, setActiveSurface, uiBrightness, themeRoleColor, themeRoleDim, uiFlickerAlpha } from './palette.js';
import { drawVfdGlyph } from './vfd-font.js';
import { MONITOR_THRESHOLDS, monitorSnapshot } from '../audio/monitor.js';

export const PANEL = Object.freeze({ padX: 2, headerRows: 2, footerRows: 2 });

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : 0));
const nowSec = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) * 0.001;
const pwm16 = (a) => Math.round(clamp01(a) * 16) / 16;
function scanDuty(x = 0, y = 0, strength = 1) {
  // Multiplex scan artifact: subtle, fast, and column-biased. It is not a
  // decorative wobble; it is the display being addressed grid by grid.
  const phase = (nowSec() * 112 + x * 0.37 + y * 0.61) % 1;
  const blank = phase < 0.045 ? 0.90 : phase > 0.955 ? 0.94 : 1;
  return 1 - (1 - blank) * Math.max(0, Math.min(1, strength));
}
function litDuty(x, y, role = 'phosphor', alpha = 1) {
  return pwm16(alpha * uiBrightness() * uiFlickerAlpha(x, y, role) * scanDuty(x, y));
}

// A flat rectangle in device px, no gradient.
function rect(ctx, x, y, w, h, color, alpha = 1) {
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
}
function hairline(ctx, x, y, w, h, color, alpha = 1, lw = 1, dpr = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw * dpr;
  ctx.strokeRect(x + 0.5 * dpr, y + 0.5 * dpr, w - dpr, h - dpr); ctx.restore();
}

// ── the faceplate ─────────────────────────────────────────────────────────────
export function drawMachinePanel(x, y, w, h, {
  label = 'MONITOR', source = '', footer = '', meter = true, scrim = false,
  theme = 'amber', wordmark = 'AUDIOCORP', model = '', buttons = null,
} = {}) {
  setActiveSurface(theme);
  const t = activeTheme();
  if (scrim) uiFill(0, 0, 999, 999, 'rgba(2,2,3,0.74)');

  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = x * cellW * dpr, py = y * cellH * dpr;
    const pw = w * cellW * dpr, ph = h * cellH * dpr;
    // The bezel: matte black, a shade off the glass, with a hairline edge. Flat.
    rect(ctx, px, py, pw, ph, '#101010');
    const gx = px + 1.4 * cellW * dpr, gy = py + (PANEL.headerRows + 0.35) * cellH * dpr;
    const gw = pw - 2.8 * cellW * dpr, gh = ph - (PANEL.headerRows + PANEL.footerRows + 0.7) * cellH * dpr;
    // The glass, flat.
    rect(ctx, gx, gy, gw, gh, t.glass);
    hairline(ctx, gx, gy, gw, gh, '#000', 0.9, 1, dpr);
    hairline(ctx, px, py, pw, ph, '#242424', 1, 1, dpr);
  });

  // Header silkscreen legends. The brand/model/label live on one padded row;
  // earlier revisions split this into two rows and made the top band feel
  // tighter than the footer.
  const meterX = meter ? x + w - 17 : x + w - 3;
  let sourceLabelX = x + w;
  if (source) {
    const s = String(source).toUpperCase();
    const sx = Math.max(x + 9, meterX - 1 - s.length);
    sourceLabelX = sx - 7;
    uiText(sx - 7, y + 1, 'SOURCE', 'ui-label');
    uiText(sx, y + 1, s, 'ui-primary');
  }
  const leftHeader = [wordmark, model, String(label).toUpperCase()].filter(Boolean).join(' ');
  if (leftHeader) {
    const maxLeft = Math.max(1, (source ? sourceLabelX : x + w - 2) - (x + 2) - 1);
    uiText(x + 2, y + 1, leftHeader.slice(0, maxLeft), 'ui-label');
  }
  if (meter) drawVfdMeter(meterX, y + 1, 14, monitorSnapshot(), { theme });

  // Footer.
  if (footer) uiText(x + 2, y + h - 2, String(footer).slice(0, Math.max(0, w - 4)), 'ui-label');
  if (buttons) drawButtonCluster(x + w - buttons.w - 2, y + PANEL.headerRows + 1, buttons);

  return {
    x: x + PANEL.padX + 1,
    y: y + PANEL.headerRows + 2,
    w: Math.max(1, w - PANEL.padX * 2 - 2),
    h: Math.max(1, h - PANEL.headerRows - (footer ? PANEL.footerRows : 1) - 2),
  };
}

// ── the bargraph meter (DA-1000 / Akai VOLUME scale) ─────────────────────────
export function drawVfdMeter(x, y, width = 14, snapshot = monitorSnapshot(), {
  thresholdDb = -3, label = '', theme = null,
} = {}) {
  const t = theme ? (setActiveSurface(theme), activeTheme()) : activeTheme();
  const n = Math.max(1, Math.min(MONITOR_THRESHOLDS.length, width));
  const lit = Math.min(n, snapshot?.segments || 0);
  const peakIndex = MONITOR_THRESHOLDS.reduce((p, db, i) => (snapshot?.peakDb >= db ? i : p), -1);
  const b = uiBrightness();

  uiDraw(({ ctx, dpr, cellW, cellH, cols }) => {
    const gap = Math.max(1, Math.round(1.4 * dpr));
    const totalW = n * cellW * dpr;
    const segW = Math.max(2 * dpr, (totalW - gap * (n - 1)) / n);
    const top = (y + 0.24) * cellH * dpr;
    const height = 0.44 * cellH * dpr;

    for (let i = 0; i < n; i++) {
      const px = x * cellW * dpr + i * (segW + gap);
      const phosphor = themeRoleColor('phosphor', x + i, cols);
      const counter = themeRoleColor('counter', x + i, cols);
      const on = i < lit;
      const db = MONITOR_THRESHOLDS[i];

      ctx.save();
      if (on) {
        ctx.fillStyle = db >= thresholdDb ? t.danger : phosphor;
        ctx.globalAlpha = litDuty(x + i, y, db >= thresholdDb ? 'danger' : 'phosphor', 1);
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 4.5 * dpr;
      } else {
        ctx.fillStyle = phosphor;
        ctx.globalAlpha = 0.10;
      }
      ctx.fillRect(px, top, segW, height);
      ctx.restore();

      if (i === peakIndex && i >= lit) {
        ctx.save();
        ctx.globalAlpha = 0.95 * uiFlickerAlpha(x + i, y, 'counter');
        ctx.fillStyle = counter;
        ctx.fillRect(px, top, segW, Math.max(1, 1.5 * dpr));
        ctx.restore();
      }
    }
  });

  if (label) uiText(x - label.length - 1, y, label.toUpperCase(), 'ui-label');
}

// The DA-1000 LOCATION INDICATOR: a row of vertical bars with a red position
// marker, used for take progress. `p` is 0..1.
export function drawLocationIndicator(x, y, width, p, { theme = 'green' } = {}) {
  setActiveSurface(theme);
  const t = activeTheme();
  const b = uiBrightness();

  uiDraw(({ ctx, dpr, cellW, cellH, cols }) => {
    const n = Math.max(4, Math.floor(width));
    const gap = Math.max(1, Math.round(1.6 * dpr));
    const totalW = n * cellW * dpr;
    const segW = Math.max(2 * dpr, (totalW - gap * (n - 1)) / n);
    const base = (y + 0.9) * cellH * dpr;
    const mark = Math.round(p * (n - 1));

    for (let i = 0; i < n; i++) {
      const px = x * cellW * dpr + i * (segW + gap);
      const phosphor = themeRoleColor('phosphor', x + i, cols);
      const on = i <= mark;

      // Bars grow toward the middle then shrink, like the real graduated scale.
      const climb = 0.35 + 0.65 * Math.sin((i / (n - 1)) * Math.PI);
      const bh = climb * cellH * 0.7 * dpr;

      ctx.save();
      ctx.fillStyle = phosphor;
      ctx.globalAlpha = on ? Math.min(1, b * uiFlickerAlpha(x + i, y, 'phosphor')) : 0.12;
      if (on) {
        ctx.shadowColor = phosphor;
        ctx.shadowBlur = 3 * dpr;
      }
      ctx.fillRect(px, base - bh, segW, bh);
      ctx.restore();
    }

    // the red marker
    const mx = x * cellW * dpr + mark * (segW + gap);
    ctx.save();
    ctx.globalAlpha = litDuty(x + mark, y, 'marker', 1);
    ctx.fillStyle = t.marker;
    ctx.shadowColor = t.marker;
    ctx.shadowBlur = 5 * dpr;
    ctx.fillRect(mx, (y + 0.05) * cellH * dpr, segW, 0.28 * cellH * dpr);
    ctx.restore();
  });
}

// ── the numeric counter (7-segment, pale-cyan on the DA-1000) ────────────────
const DIGIT = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '',
};
const SEG7 = {
  a: [.16, .06, .84, .06], b: [.88, .10, .88, .48], c: [.88, .52, .88, .90],
  d: [.16, .94, .84, .94], e: [.12, .52, .12, .90], f: [.12, .10, .12, .48], g: [.18, .50, .82, .50],
};
export function drawVfdCounter(x, y, value, { scale = 1, theme = null, color = null } = {}) {
  if (theme) setActiveSurface(theme);

  const b = uiBrightness();
  const text = String(value);

  uiDraw(({ ctx, dpr, cellW, cellH, cols }) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.4, 2.0 * scale) * dpr;

    const uw = cellW * 1.05 * scale;
    const uh = cellH * scale;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const bx = (x + i * 1.15 * scale) * cellW * dpr;
      const by = y * cellH * dpr;
      const cellX = x + i * 1.15 * scale;
      const col = color || themeRoleColor('counter', cellX, cols);
      const dim = themeRoleDim('counter', cellX, cols) || 'rgba(255,255,255,0.05)';
      const duty = litDuty(cellX, y, 'counter', 1);

      if (ch === ':' || ch === '.') {
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 4 * dpr;
        ctx.globalAlpha = duty;

        const dots = ch === ':' ? [.34, .66] : [.9];
        for (const dy of dots) {
          ctx.fillRect(bx + uw * .42, by + uh * dy, 2 * dpr, 2 * dpr);
        }

        continue;
      }

      const active = DIGIT[ch] || '';

      // dormant segments first, then lit
      for (const [name, p] of Object.entries(SEG7)) {
        const on = active.includes(name);

        ctx.strokeStyle = on ? col : dim;
        ctx.globalAlpha = on ? duty : 1;
        ctx.shadowColor = on ? col : 'transparent';
        ctx.shadowBlur = on ? 5.5 * dpr : 0;

        ctx.beginPath();
        ctx.moveTo(bx + p[0] * uw * dpr, by + p[1] * uh * dpr);
        ctx.lineTo(bx + p[2] * uw * dpr, by + p[3] * uh * dpr);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  });
}

// Big dot-matrix text (the title, a speaker name) at an arbitrary scale.
export function drawVfdText(x, y, text, { scale = 2, theme = null, role = 'ui-primary', alpha = 1 } = {}) {
  if (theme) setActiveSurface(theme);

  const value = String(text).toUpperCase();
  const colorRole = role === 'ui-counter' ? 'counter' : 'phosphor';

  uiDraw(({ ctx, dpr, cellW, cellH, cols }) => {
    const cw = cellW * scale * dpr;
    const ch = cellW * 1.42 * scale * dpr;
    const oy = y * cellH * dpr;

    for (let i = 0; i < value.length; i++) {
      const cellX = x + i * scale;
      const duty = litDuty(cellX, y, colorRole, alpha);
      drawVfdGlyph(ctx, value[i], (x * cellW * dpr) + i * cw, oy, cw, ch, {
        color: themeRoleColor(colorRole, cellX, cols),
        dim: themeRoleDim(colorRole, cellX, cols),
        blur: 4.25,
        dpr,
        alpha: duty,
        scan: scanDuty(cellX, y),
        ghost: 0.18,
      });
    }
  });

  return value.length * scale;
}

// A right-hand button cluster: square silkscreened keys, a few lit. `spec` is
// { w, keys: [{ label, lit?: 'rec'|'play'|'power' }] }.
export function drawButtonCluster(x, y, { w = 6, keys = [] } = {}) {
  const t = activeTheme();
  const lit = { rec: '#FF3B30', play: t.phosphor, power: '#3B7BFF' };
  keys.forEach((k, i) => {
    const by = y + i * 2;
    uiDraw(({ ctx, dpr, cellW, cellH }) => {
      const bx = x * cellW * dpr, byy = by * cellH * dpr;
      const bw = (w - 2) * cellW * dpr, bh = 1.4 * cellH * dpr;
      rect(ctx, bx, byy, bw, bh, '#161616');
      hairline(ctx, bx, byy, bw, bh, '#333', 1, 1, dpr);
      if (k.lit) {
        const c = lit[k.lit] || t.phosphor;
        ctx.save(); ctx.globalAlpha = uiFlickerAlpha(x + w - 2, by, k.lit === 'rec' ? 'marker' : 'phosphor'); ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 4 * dpr;
        ctx.beginPath(); ctx.arc(bx + bw - 4 * dpr, byy + bh / 2, 2.2 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    });
    if (k.label) uiText(x, by, k.label, k.lit ? 'ui-primary' : 'ui-label');
  });
}

// ── the paper ─────────────────────────────────────────────────────────────────
// A real typed sheet: flat warm cream stock with a fine tooth (noise, not
// bands), a soft contact shadow beneath it, and a letterhead rule. The type
// itself is drawn by the reader with slightly uneven ink.
let paperTex = null, paperTexW = 0, paperTexH = 0;
function paperTexture(w, h) {
  if (paperTex && paperTexW === w && paperTexH === h) return paperTex;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#D8CFB8'; ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;      // fibre tooth, subtle
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.9));
  }
  ctx.putImageData(img, 0, 0);
  paperTex = c; paperTexW = w; paperTexH = h;
  return c;
}

export function drawPaperPanel(x, y, w, h) {
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = x * cellW * dpr, py = y * cellH * dpr, pw = w * cellW * dpr, ph = h * cellH * dpr;
    // contact shadow: a soft dark pad offset down-right, no gradient fill — a
    // blurred rect.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18 * dpr;
    ctx.shadowOffsetX = 3 * dpr; ctx.shadowOffsetY = 6 * dpr;
    ctx.fillStyle = '#000'; ctx.fillRect(px, py, pw, ph);
    ctx.restore();
    // the sheet, flat cream with a fibre tooth
    const tex = paperTexture(Math.max(2, Math.round(pw)), Math.max(2, Math.round(ph)));
    ctx.drawImage(tex, px, py);
    // a faint deckle edge
    ctx.save(); ctx.globalAlpha = 0.10; ctx.strokeStyle = '#20180F'; ctx.lineWidth = dpr;
    ctx.strokeRect(px + 0.5 * dpr, py + 0.5 * dpr, pw - dpr, ph - dpr); ctx.restore();
  });
  return { x: x + 3, y: y + 2, w: Math.max(1, w - 6), h: Math.max(1, h - 4) };
}
