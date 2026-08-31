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
import { THEMES, activeTheme, setActiveSurface, uiBrightness, themeRoleColor, themeRoleDim, uiFlickerAlpha, uiRoleColor } from './palette.js';
import { drawVfdGlyph } from './vfd-font.js';
import { drawPromptParts } from './prompt-glyphs.js';
import { fitText } from './fit-text.js';
import { MONITOR_DANGER_THRESHOLDS, MONITOR_THRESHOLDS, monitorSnapshot } from '../audio/monitor.js';

export const PANEL = Object.freeze({ padX: 2, headerRows: 2, footerRows: 2 });

export function machinePanelBody(x, y, w, h, { footer = '' } = {}) {
  return {
    x: x + PANEL.padX + 1,
    y: y + PANEL.headerRows + 2,
    w: Math.max(1, w - PANEL.padX * 2 - 2),
    h: Math.max(1, h - PANEL.headerRows - (footer ? PANEL.footerRows : 1) - 2),
  };
}

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

function drawPanelHardware(ctx, { px, py, pw, ph, gx, gy, gw, gh, dpr }) {
  const screw = Math.max(1.5 * dpr, 2);
  const inset = Math.max(0.72 * dpr, 1);
  ctx.save();

  // Four punched square heads in the bezel. Their slots all face the same way,
  // as if one technician closed every panel on the line.
  for (const [sx, sy] of [
    [px + inset, py + inset],
    [px + pw - inset - screw, py + inset],
    [px + inset, py + ph - inset - screw],
    [px + pw - inset - screw, py + ph - inset - screw],
  ]) {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#8a887f';
    ctx.fillRect(sx, sy, screw, screw);
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#050505';
    ctx.fillRect(sx + screw * 0.18, sy + screw * 0.46, screw * 0.64, Math.max(0.5, dpr * 0.36));
  }

  // Registration crosses live on the silkscreen, outside the data area.
  ctx.strokeStyle = '#74776e';
  ctx.lineWidth = Math.max(0.5, dpr * 0.42);
  ctx.globalAlpha = 0.32;
  const arm = Math.max(2 * dpr, 1.5);
  for (const [cx, cy] of [[gx + arm * 1.4, gy - arm], [gx + gw - arm * 1.4, gy + gh + arm]]) {
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
    ctx.stroke();
  }

  // Dormant service lamps are manufacturing detail, not state. They never
  // animate or brighten and remain below the footer's information hierarchy.
  ctx.globalAlpha = 0.12;
  const led = Math.max(1, dpr * 0.8);
  for (let index = 0; index < 3; index += 1) {
    ctx.fillStyle = index === 1 ? '#7b5431' : '#35584f';
    ctx.fillRect(px + pw - (7 - index * 1.7) * dpr, py + ph - 2.3 * dpr, led, led);
  }

  // A second imperfect stamping line gives the matte plate thickness without
  // introducing a glossy bevel or gradient.
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#6a675f';
  ctx.lineWidth = Math.max(0.5, dpr * 0.45);
  ctx.strokeRect(px + 1.6 * dpr, py + 1.35 * dpr, pw - 3.2 * dpr, ph - 2.7 * dpr);
  ctx.restore();
}

// ── the faceplate ─────────────────────────────────────────────────────────────
export function drawMachinePanel(x, y, w, h, {
  label = 'MONITOR', source = '', footer = '', meter = true, scrim = false,
  theme = 'amber', wordmark = 'AUDIOCORP', model = '', buttons = null,
  // Prompt parts, drawn as button glyphs on a pad and as bracketed text on a
  // keyboard. Takes precedence over `footer` when both are given, so a caller
  // can migrate one surface at a time.
  footerParts = null,
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
    drawPanelHardware(ctx, { px, py, pw, ph, gx, gy, gw, gh, dpr });
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
  if (meter) {
    const snapshot = monitorSnapshot();
    drawVfdMeter(meterX, y + 1, 12, snapshot, { theme, bandThresholds: MONITOR_DANGER_THRESHOLDS });
    drawVfdWarningTriangle(x + w - 3, y + 1, snapshot);
  }

  // Footer.
  if (footerParts?.length) drawPromptParts(x + 2, y + h - 2, footerParts, { role: 'ui-label', cols: w });
  else if (footer) uiText(x + 2, y + h - 2, String(footer).slice(0, Math.max(0, w - 4)), 'ui-label');
  if (buttons) drawButtonCluster(x + w - buttons.w - 2, y + PANEL.headerRows + 1, buttons);

  return machinePanelBody(x, y, w, h, { footer: footer || footerParts?.length ? 'CONTROLS' : '' });
}

// ── the bargraph meter (DA-1000 / Akai VOLUME scale) ─────────────────────────
export function drawVfdMeter(x, y, width = 14, snapshot = monitorSnapshot(), {
  thresholdDb = -3, label = '', theme = null, bandThresholds = null,
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
        const hot = bandThresholds && db >= Number(bandThresholds.hotDb);
        const midHot = bandThresholds && !hot && db >= Number(bandThresholds.midHotDb);
        const danger = hot || (!bandThresholds && db >= thresholdDb);
        ctx.fillStyle = danger ? t.danger : midHot ? themeRoleColor('warning', x + i, cols) : phosphor;
        ctx.globalAlpha = litDuty(x + i, y, danger ? 'danger' : midHot ? 'counter' : 'phosphor', 1);
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

export function drawVfdWarningTriangle(x, y, snapshot = monitorSnapshot(), { now = null } = {}) {
  const band = snapshot?.band || 'normal';
  if (band === 'normal') return false;
  const hot = band === 'hot';
  const seconds = Number.isFinite(Number(now)) ? Number(now) / 1000 : nowSec();
  const blink = .34 + .66 * (Math.sin(seconds * Math.PI * (hot ? 5.2 : 3.4)) > 0 ? 1 : .18);
  const color = hot ? activeTheme().danger : themeRoleColor('warning');
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const left = x * cellW * dpr;
    const top = (y + .08) * cellH * dpr;
    const width = Math.max(4, 1.75 * cellW * dpr);
    const height = Math.max(4, .78 * cellH * dpr);
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.shadowColor = color;
    ctx.shadowBlur = 4 * dpr;
    ctx.beginPath();
    ctx.moveTo(left + width * .5, top);
    ctx.lineTo(left + width, top + height);
    ctx.lineTo(left, top + height);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  });
  uiText(x + .64, y, '!', hot ? 'ui-danger' : 'ui-warning', blink);
  return true;
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
//
// FOUR THINGS THIS USED TO GET WRONG, all of them silently:
//
//   · `color` and `max` were accepted and dropped on the floor. Ten call sites
//     passed them expecting a colour override and a width, and got a full-length
//     string in plain phosphor that could run off the end of its panel.
//   · `theme:'danger'` and `theme:'red'` are not themes. setActiveSurface falls
//     back to amber, so five call sites asking for red have been drawing amber.
//     A colour is what they wanted; `color` now does it, and a bad theme name
//     no longer silently repaints the whole surface.
//   · every `role` except 'ui-counter' collapsed to phosphor, so 'ui-danger'
//     and 'ui-primary' were the same word in the same colour. The palette
//     already has the map (uiRoleColor); use it.
//   · the glyph box was `cellW * 1.42 * scale` tall while the row advanced by
//     `cellH`, so anything above scale ~1.4 overflowed the row below it.
//
// The DORMANT GRID is deliberately always the panel's own dim phosphor, whatever
// colour the lit dots are: the unlit matrix belongs to the glass, not to what is
// written on it.
export function drawVfdText(x, y, text, {
  scale = 2, theme = null, role = 'ui-primary', alpha = 1, color = null, max = null,
} = {}) {
  if (theme && THEMES[theme]) setActiveSurface(theme);
  const tint = color || (theme && !THEMES[theme] ? theme : null);

  const value = fitText(String(text).toUpperCase(), max == null ? null : Math.floor(max / Math.max(0.25, scale)));

  uiDraw(({ ctx, dpr, cellW, cellH, cols }) => {
    const cw = cellW * scale * dpr;
    // Height follows the ROW the text sits on, so a scaled word occupies the
    // rows it claims and nothing underneath it.
    const ch = Math.min(cellW * 1.42, cellH) * scale * dpr;
    const oy = y * cellH * dpr;

    for (let i = 0; i < value.length; i++) {
      const cellX = x + i * scale;
      const duty = litDuty(cellX, y, 'phosphor', alpha);
      drawVfdGlyph(ctx, value[i], (x * cellW * dpr) + i * cw, oy, cw, ch, {
        color: tint || uiRoleColor(role, cellX, cols),
        dim: themeRoleDim('phosphor', cellX, cols),
        blur: 4.25,
        dpr,
        alpha: duty,
        scan: scanDuty(cellX, y),
        halation: 0.18,
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
