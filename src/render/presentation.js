// The instrument surfaces, modelled on the A k a i AM M5 / HX M5 and the hi ta chi
// DA-1000 — the real machines, named here as the reference. The recorder in the
// player's hands is a Lo-D A-1000 (see palette.js). Two rules the landed
// refactor broke:
//
// The VFD is a recessed optical stack: substrate, phosphor, suspended grid,
// then smoked cover glass. Machined aluminum, etched ink, and molded controls
// occupy separate physical planes and never inherit phosphor glow.
//
// A machine panel is a faceplate: a matte bezel, a wordmark, a champagne model
// strip, silkscreen header/footer legends, and the lit data on the glass.

import { uiDraw, uiDrawHardware, uiWithClip, uiWithHardwareLayer, uiFill, uiText, uiCellMetrics } from './ui.js';
import { THEMES, UI_COLOR, activeTheme, activeSurface, setActiveSurface, uiBrightness, themeRoleColor, themeRoleDim, uiFlickerAlpha, uiRoleColor } from './palette.js';
import { drawVfdGlyph, vfdGlowBleed } from './vfd-font.js';
import { drawCapLegend, drawPrintedText } from './keycap.js';
import { drawHardwareCap, hardwareCapGeometry, hardwareMotionReduced } from './hardware-material.js';
import { drawInstrumentPlate, drawInstrumentWell, drawInstrumentGlass, drawVfdGrid } from './instrument-material.js';
import { sampleControl } from '../game/control-mechanics.js';
import { drawPromptParts } from './prompt-glyphs.js';
import { fitText } from './fit-text.js';
import { MONITOR_DANGER_THRESHOLDS, MONITOR_THRESHOLDS, monitorSnapshot } from '../audio/monitor.js';
import {
  METER_MIN_DB, locationMarks, locationScaleFits, locationTicks,
  meterGeometry, meterMarkBoxes, meterMarks, meterScaleFits, meterSegmentAt,
  meterSegmentCount, meterState, meterTicks, unitToDb,
} from './meter.js';

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

export function machinePanelAperture(x, y, w, h) {
  return { x: x + 1.4, y: y + PANEL.headerRows + .35,
    w: Math.max(.1, w - 2.8), h: Math.max(.1, h - PANEL.headerRows - PANEL.footerRows - .7) };
}

/** A synchronous scope guarantees the front cover also paints on early return. */
export function withMachinePanel(x, y, w, h, options = {}, drawContent) {
  const previous = activeSurface();
  try { return drawMachinePanel(x, y, w, h, { ...options, drawContent }); }
  finally { setActiveSurface(previous); }
}

// ── the faceplate ─────────────────────────────────────────────────────────────
export function drawMachinePanel(x, y, w, h, {
  label = 'MONITOR', source = '', footer = '', meter = true, scrim = false,
  // What the needle reads. Defaults to the HUSH exposure snapshot, which is what
  // every in-run surface wants — but that measures SEMANTIC player noise, so it
  // is flat zero anywhere outside a story run and the title's header meter has
  // always been dead. A caller with a better signal supplies it here.
  meterSnapshot = null,
  theme = 'amber', wordmark = 'AUDIOCORP', model = '', buttons = null,
  // Prompt parts, drawn as button glyphs on a pad and as bracketed text on a
  // keyboard. Takes precedence over `footer` when both are given, so a caller
  // can migrate one surface at a time.
  footerParts = null,
  finish = 'aluminum', glass = {}, aperture: hasAperture = true, drawContent = null,
} = {}) {
  // Same guard. god-menu.js asks for theme:'red' for the whole developer panel
  // and has always drawn amber.
  if (THEMES[theme]) setActiveSurface(theme);
  if (scrim) uiFill(0, 0, 999, 999, 'rgba(2,2,3,0.74)');
  const aperture = machinePanelAperture(x, y, w, h);
  const optical = glass && typeof glass === 'object' ? glass : {};
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = x * cellW * dpr, py = y * cellH * dpr;
    const pw = w * cellW * dpr, ph = h * cellH * dpr;
    drawInstrumentPlate(ctx, { x: px, y: py, w: pw, h: ph, dpr, finish,
      seed: `${wordmark}:${model}:${label}` });
    if (hasAperture) drawInstrumentWell(ctx, { x: aperture.x * cellW * dpr, y: aperture.y * cellH * dpr,
      w: aperture.w * cellW * dpr, h: aperture.h * cellH * dpr, dpr, depth: optical.depth ?? 1 });
  });

  const body = machinePanelBody(x, y, w, h, { footer: footer || footerParts?.length ? 'CONTROLS' : '' });
  if (typeof drawContent === 'function') {
    uiWithHardwareLayer(() => uiWithClip(aperture, () => drawContent(body)), () => {
      if (glass === false || !hasAperture) return;
      uiDraw(({ctx,dpr,cellW,cellH}) => drawInstrumentGlass(ctx, {
        ...optical, x: aperture.x * cellW * dpr, y: aperture.y * cellH * dpr,
        w: aperture.w * cellW * dpr, h: aperture.h * cellH * dpr, dpr,
        reducedMotion: hardwareMotionReduced(), grid: false,
      }));
    });
    if (THEMES[theme]) setActiveSurface(theme);
  }

  const darkPanel = finish === 'black' || finish === 'black-anodized';
  const ink = darkPanel ? '#b7bbae' : '#333830';
  const print = (px, py, text, pw) => drawPrintedText(px, py, text,
    { w: pw, ink, finish: 'etched', darkPanel });

  // Header silkscreen legends. The brand/model/label live on one padded row;
  // earlier revisions split this into two rows and made the top band feel
  // tighter than the footer.
  const meterX = meter ? x + w - 17 : x + w - 3;
  let sourceLabelX = x + w;
  if (source) {
    const s = String(source).toUpperCase();
    const sx = Math.max(x + 9, meterX - 1 - s.length);
    sourceLabelX = sx - 7;
    print(sx - 7, y + 1, 'SOURCE', 6);
    print(sx, y + 1, s, Math.max(1, meterX - sx - 1));
  }
  const leftHeader = [wordmark, model, String(label).toUpperCase()].filter(Boolean).join(' ');
  if (leftHeader) {
    const maxLeft = Math.max(1, (source ? sourceLabelX : x + w - 2) - (x + 2) - 1);
    print(x + 2, y + 1, leftHeader.slice(0, maxLeft), maxLeft);
  }
  if (meter) {
    const snapshot = meterSnapshot || monitorSnapshot();
    // The meter is an actual small aperture in the metal header, not glowing
    // paint. Keep its existing scale and reserved hit/layout geometry.
    uiDraw(({ctx,dpr,cellW,cellH}) => {
      rect(ctx, (meterX-.3)*cellW*dpr, (y+.86)*cellH*dpr, 12.6*cellW*dpr, 1.12*cellH*dpr, '#0a130c');
    });
    drawVfdMeter(meterX, y + 1, 12, snapshot, { theme, bandThresholds: MONITOR_DANGER_THRESHOLDS });
    drawVfdWarningTriangle(x + w - 3, y + 1, snapshot);
  }

  // Footer.
  if (footerParts?.length) drawPromptParts(x + 2, y + h - 2, footerParts, {
    role: 'ui-label', printed: true, cols: w, printedInk: ink, printedFinish: 'etched', darkPanel });
  else if (footer) print(x + 2, y + h - 2, String(footer).slice(0, Math.max(0, w - 4)), Math.max(0,w-4));
  if (buttons) drawButtonCluster(x + w - buttons.w - 2, y + PANEL.headerRows + 1, buttons);

  return body;
}

// ── the bargraph meter (A-1000 / Akai VOLUME scale) ─────────────────────────
//
// The instrument, not a texture. See render/meter.js for why it has a scale at
// all — two authored lines describe a meter "flat at the bottom of the scale",
// and the sound design files a flat meter as evidence the protagonist reasons
// from rather than decoration. The arithmetic lives there, pure and tested;
// this draws it.
//
// Three things this fixes that no amount of restyling would have:
//
//   · It was hard-capped at twelve segments. `n = min(THRESHOLDS.length, width)`
//     and then `totalW = n * cellW`, so a caller asking for thirty cells got
//     twelve segments in twelve cells and the rest of its budget vanished.
//   · The peak marker was dead code everywhere but one call site. It drew only
//     when `peakIndex >= lit`, and every recorder meter is fed
//     `monitorSnapshotForRms(scalar)` — where `peak === rms`, so `peakIndex` is
//     always inside the lit run. The tape has always kept peak-hold; the needle
//     beside it never showed one.
//   · Dormant segments were hard-coded phosphor at 0.10, ignoring the `dim`
//     token the palette explicitly calls "dormant phosphor — the VFD tell".
//
// SIZE is `auto` by default: the widget takes the rows it is given and drops
// the scale rather than overflowing a panel. The grid is not generous at the
// extremes — uiScale runs to 1.5, so the worst case is 75x20 — and roughly
// twenty machine-panel headers draw this in a single row.
export function drawVfdMeter(x, y, width = 14, snapshot = monitorSnapshot(), {
  thresholdDb = -3, label = '', theme = null, bandThresholds = null,
  rows = 1, marks = null, id = null, scaleLabel = '', over = null,
} = {}) {
  // A bad theme name used to repaint the surface amber AND leave it amber for
  // everything drawn afterwards, because setActiveSurface is global and sticky.
  // drawVfdText was fixed for this; this was missed. Only amber and green are
  // themes.
  if (theme && THEMES[theme]) setActiveSurface(theme);
  const t = activeTheme();

  const w = Math.max(1, Number(width) || 1);
  const count = meterSegmentCount(w);
  const key = id || `${x}:${y}`;

  // `segments` stays authoritative for how much is lit, so the HUSH pressure
  // monitorDisplaySnapshot injects and the clip-to-full-scale rule both survive
  // exactly — but position comes from dB, so the bar and the printed scale
  // cannot describe different things.
  const rawDb = Number.isFinite(Number(snapshot?.db)) ? Number(snapshot.db) : METER_MIN_DB;
  const flooredDb = snapshot?.segments > 0
    ? Math.max(rawDb, MONITOR_THRESHOLDS[Math.min(MONITOR_THRESHOLDS.length, snapshot.segments) - 1])
    : rawDb;

  const ballistic = meterState(key, flooredDb, nowSec() * 1000, { clipped: !!snapshot?.clipped });
  const lit = meterSegmentAt(ballistic.needleDb, count);
  const peakSeg = meterSegmentAt(ballistic.peakDb, count);
  const overNow = over != null ? !!over : nowSec() * 1000 < (ballistic.overUntilMs || 0);

  // Banks of four across twelve-ish segments land on the same boundaries as
  // MONITOR_DANGER_THRESHOLDS' normal / mid-hot / hot, so the grouping and the
  // colouring say the same thing in two languages.
  const { shape, offset } = meterGeometry({ x, w, segments: count, bankSize: 4 });
  const scaleRow = rows >= 2 && meterScaleFits(w);
  const placed = scaleRow ? meterMarks(marks, w) : [];

  uiDraw(({ ctx, dpr, cellW, cellH, cols }) => {
    const top = (y + 0.24) * cellH * dpr;
    const height = 0.44 * cellH * dpr;

    for (const cell of shape.cells) {
      const i = cell.index;
      const px = (offset + cell.x) * cellW * dpr;
      const pw = Math.max(1, cell.w * cellW * dpr);
      const at = offset + cell.x;
      const phosphor = themeRoleColor('phosphor', at, cols);
      const db = unitToDb((i + 0.5) / count);
      const on = i < lit;

      ctx.save();
      if (on) {
        const hot = bandThresholds ? db >= Number(bandThresholds.hotDb) : db >= thresholdDb;
        const midHot = bandThresholds && !hot && db >= Number(bandThresholds.midHotDb);
        ctx.fillStyle = hot ? t.danger : midHot ? themeRoleColor('warning', at, cols) : phosphor;
        ctx.globalAlpha = litDuty(at, y, hot ? 'danger' : midHot ? 'counter' : 'phosphor', 1);
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 4.5 * dpr;
      } else {
        // Dormant. Unlit elements on a real VFD do not go black; that faint
        // grid is the tell.
        //
        // NOT `themeRoleDim` — the `dim` token carries its own alpha (0.055
        // amber / 0.06 green), which is little more than HALF the 0.10 used
        // here, and globalAlpha cannot scale it back up. Switching to it would
        // have quietly dimmed the dormant segments on all sixteen metered panel
        // headers. The token is right for the unlit dot matrix under a glyph,
        // where drawVfdGlyph applies it; it is too faint for a segment.
        ctx.fillStyle = phosphor;
        ctx.globalAlpha = 0.10;
      }
      ctx.fillRect(px, top, pw, height);
      ctx.restore();
    }

    // THE HELD PEAK. A cap above the lit run that sits, then falls — which is
    // what a microphone does, and the rule the tape already keeps: a single
    // close pass is on the recording forever.
    if (peakSeg > 0 && peakSeg > lit) {
      const cell = shape.cells[Math.min(shape.cells.length - 1, peakSeg - 1)];
      ctx.save();
      ctx.globalAlpha = 0.95 * uiFlickerAlpha(x + peakSeg, y, 'counter');
      ctx.fillStyle = themeRoleColor('counter', x + peakSeg, cols);
      ctx.fillRect((offset + cell.x) * cellW * dpr, top, Math.max(1, cell.w * cellW * dpr), height);
      ctx.restore();
    }

    // Reference marks: a hairline standing through the bar at a level the
    // player is being asked to stay under. Drawn over the segments so the bar
    // visibly crosses it.
    for (const mark of placed) {
      const mx = (x + mark.x) * cellW * dpr;
      ctx.save();
      // The SPOIL mark is the A-1000's red POSITION marker, which is exactly
      // its meaning here: the one place on the scale that matters.
      ctx.fillStyle = mark.kind === 'spoil' || mark.kind === 'catch'
        ? themeRoleColor('marker', x + mark.x, cols)
        : themeRoleColor('silkscreen', x + mark.x, cols);
      ctx.globalAlpha = mark.kind === 'floor' ? .55 : .92;
      ctx.fillRect(mx, top - .10 * cellH * dpr, Math.max(1, dpr), height + .20 * cellH * dpr);
      ctx.restore();
    }
  });

  // OVER, latched. A clip that blinks out before you look up did not tell you
  // anything.
  if (overNow) uiText(x + Math.max(0, w - 4), y, 'OVER', 'ui-danger', 1, 4);

  if (label) uiText(Math.max(0, x - label.length - 1), y, String(label).toUpperCase(), 'ui-label');

  if (!scaleRow) return { rows: 1, scale: false };

  // ── the printed scale ──────────────────────────────────────────────────────
  //
  // Marks are placed first and the numbers step around them. A player needs to
  // know where SPOIL is more than they need to read -12, and drawing both into
  // the same cells produced "SPOIL12CATCH".
  const boxes = meterMarkBoxes(marks, w);
  for (const tick of meterTicks(w, { avoid: boxes })) {
    uiText(x + Math.round(tick.left), y + 1, tick.label, 'ui-label', .72);
  }
  for (const box of boxes) {
    uiText(x + Math.round(box.left), y + 1, box.mark.label,
      box.mark.kind === 'floor' ? 'ui-secondary' : 'ui-marker', .85);
  }
  if (scaleLabel) uiText(x, y + 1, String(scaleLabel).toUpperCase(), 'ui-label', .6);
  return { rows: 2, scale: true };
}

// ── ANNUNCIATORS ─────────────────────────────────────────────────────────────
//
// The row of fixed legends across the top of every real VFD: RECORD, PLAY,
// MONITOR, MIC. The panel had none, and it is the single thing that most makes
// one of these read as a device rather than as a drawing of one — because the
// legends that are NOT lit are still there. A machine that only shows you the
// state it is in could be anything; a machine showing you the four states it
// has, three of them dark, is a machine.
//
// So every item is always drawn. Lit is phosphor at full duty with a lamp block
// beside it; unlit is the SAME phosphor at 0.10 — the dormant convention this
// file already uses for meter segments, and for the same reason (see the note in
// drawVfdMeter: the `dim` token is too faint for anything bigger than the unlit
// dot matrix under a glyph).
//
// `items` are `{ label, lit, role }`. `role` only matters when lit; REC is the
// one legend allowed to come up red, which is the rule the transport lamp
// already follows.
export const ANNUNCIATOR_DORMANT = 0.11;

export function drawVfdAnnunciators(x, y, items = [], { theme = null, gap = 2 } = {}) {
  if (theme) setActiveSurface(theme);
  let at = x;
  for (const item of items) {
    if (!item?.label) continue;
    const label = String(item.label).toUpperCase();
    const lit = !!item.lit;
    // The lamp block. A legend without one reads as a heading; with one it reads
    // as an indicator that happens to be off.
    uiFill(at, y + .3, .62, .42, lit
      ? (item.role === 'ui-marker' ? 'rgba(255,86,72,0.95)' : 'rgba(119,224,187,0.92)')
      : 'rgba(119,224,187,0.13)');
    uiText(at + 1.1, y, label, lit ? (item.role || 'ui-primary') : 'ui-primary',
      lit ? 1 : ANNUNCIATOR_DORMANT, label.length);
    at += label.length + 1.1 + gap;
  }
  return at - x;
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

// The A-1000 LOCATION INDICATOR: a row of vertical bars with a red position
// marker, used for take progress. `p` is 0..1.
export function drawLocationIndicator(x, y, width, p, {
  theme = 'green', seconds = 45, marks = null, rows = 1, label = '',
} = {}) {
  // Guarded, like drawVfdText. Only amber and green are themes; setActiveSurface
  // is global and sticky, so a bad name repainted this amber AND left the
  // surface amber for everything drawn after it. combat.js asks for 'red' on
  // the correction stage and has never once rendered it.
  if (THEMES[theme]) setActiveSurface(theme);
  const t = activeTheme();
  const b = uiBrightness();

  const w = Math.max(4, Math.floor(width));
  const placed = locationMarks(marks, w);
  const scaleRow = rows >= 2 && locationScaleFits(w);
  const ticks = scaleRow ? locationTicks(w, { seconds }) : [];

  uiDraw(({ ctx, dpr, cellW, cellH, cols }) => {
    const n = w;
    const gap = Math.max(1, Math.round(1.6 * dpr));
    const totalW = n * cellW * dpr;
    const segW = Math.max(2 * dpr, (totalW - gap * (n - 1)) / n);
    const base = (y + 0.9) * cellH * dpr;
    const mark = Math.round(clamp01(p) * (n - 1));
    // FLAT, NOT SWELLED. The bars used to grow toward the middle on a sine,
    // which made both ends read as less important — backwards, because the
    // right-hand end is where the take completes. A graduated scale earns its
    // shape from its marks, not from a curve.
    const bh = 0.62 * cellH * dpr;

    for (let i = 0; i < n; i++) {
      const px = x * cellW * dpr + i * (segW + gap);
      const phosphor = themeRoleColor('phosphor', x + i, cols);
      const on = i <= mark;
      ctx.save();
      ctx.fillStyle = phosphor;
      ctx.globalAlpha = on ? Math.min(1, b * uiFlickerAlpha(x + i, y, 'phosphor')) : 0.12;
      if (on) { ctx.shadowColor = phosphor; ctx.shadowBlur = 3 * dpr; }
      ctx.fillRect(px, base - bh, segW, bh);
      ctx.restore();
    }

    // Graduation notches, standing in the dormant run so the strip reads as a
    // scale even before anything has been recorded on it.
    for (const tick of ticks) {
      const tx = (x + tick.x) * cellW * dpr;
      ctx.save();
      ctx.fillStyle = themeRoleColor('silkscreen', x + tick.x, cols);
      ctx.globalAlpha = tick.major ? .85 : .5;
      ctx.fillRect(tx, base - bh - (tick.major ? .16 : .09) * cellH * dpr,
        Math.max(1, dpr), (tick.major ? .18 : .11) * cellH * dpr + bh * (tick.major ? .34 : .2));
      ctx.restore();
    }

    // WHAT HAPPENED, AND WHEN. Everything here was already being recorded and
    // had nowhere to be seen: after a spoiled take you knew THAT it went wrong
    // and never when. Drawn through the whole strip so a mark reads against the
    // lit run rather than beside it.
    for (const entry of placed) {
      const mx = (x + entry.x) * cellW * dpr;
      // Three kinds, three weights. The one that ended the take is the marker
      // red — the same colour as the playhead, because both are answers to
      // "where": one is where you are, the other is where it went wrong.
      const role = entry.kind === 'spoil' ? 'marker'
        : entry.kind === 'presence' ? 'counter'
          : 'warning';
      ctx.save();
      ctx.fillStyle = themeRoleColor(role, x + entry.x, cols);
      ctx.globalAlpha = entry.kind === 'near' ? .62 : .95;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 4 * dpr;
      ctx.fillRect(mx, base - bh - .12 * cellH * dpr, Math.max(1, dpr), bh + .24 * cellH * dpr);
      ctx.restore();
    }

    // THE PLAYHEAD, through the strip rather than floating above it. It used to
    // be a block in its own row at y+0.05, which read as a separate object
    // sitting near the bar instead of a position on it.
    const mx = x * cellW * dpr + mark * (segW + gap);
    ctx.save();
    ctx.globalAlpha = litDuty(x + mark, y, 'marker', 1);
    ctx.fillStyle = t.marker;
    ctx.shadowColor = t.marker;
    ctx.shadowBlur = 5 * dpr;
    ctx.fillRect(mx, base - bh - .22 * cellH * dpr, Math.max(segW, 1.5 * dpr), bh + .34 * cellH * dpr);
    ctx.restore();
  });

  if (scaleRow) {
    for (const tick of ticks) uiText(x + Math.round(tick.left), y + 1, tick.label, 'ui-label', .68);
    if (label) uiText(x, y + 1, String(label).toUpperCase(), 'ui-label', .6);
  }
  return { rows: scaleRow ? 2 : 1, scale: scaleRow };
}


// ── the numeric counter (7-segment, pale-cyan on the A-1000) ────────────────
const DIGIT = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '',
};
// Formed phosphor plates, with clipped ends and a slight manufacturing slant.
// Coordinates normalize the approved study's 46 × 76 electrode, not a font
// stroke with round caps. The existing digit advances/hit geometry are intact.
const SEG7 = {
  a: [[10,1],[37,1],[42,6],[36,11],[11,11],[6,6]],
  b: [[40,8],[44,11],[42,33],[37,37],[33,32],[35,14]],
  c: [[37,39],[41,43],[39,65],[33,70],[29,65],[32,45]],
  d: [[10,65],[28,65],[34,71],[28,76],[7,76],[2,70]],
  e: [[3,39],[8,44],[6,63],[1,68],[-2,63],[0,44]],
  f: [[7,9],[11,13],[9,31],[4,36],[0,31],[2,13]],
  g: [[9,33],[32,33],[37,38],[31,43],[9,43],[4,38]],
};
export function drawVfdCounter(x, y, value, { scale = 1, theme = null, color = null } = {}) {
  if (theme) setActiveSurface(theme);

  const text = String(value);

  uiDraw(({ ctx, dpr, cellW, cellH, cols }) => {
    ctx.save();
    const uw = cellW * 1.05 * scale;
    const uh = cellH * scale;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const bx = (x + i * 1.15 * scale) * cellW * dpr;
      const by = y * cellH * dpr;
      const cellX = x + i * 1.15 * scale;
      const col = color || themeRoleColor('counter', cellX, cols);
      const dim = '#4a5a46';
      const duty = litDuty(cellX, y, 'counter', 1);

      if (ch === ':' || ch === '.') {
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 4 * dpr;
        ctx.globalAlpha = duty;

        const dots = ch === ':' ? [.34, .66] : [.9];
        for (const dy of dots) {
          ctx.fillRect(bx + uw * .42 * dpr, by + uh * dy * dpr, 2 * dpr, 2 * dpr);
        }

        continue;
      }

      const active = DIGIT[ch] || '';

      for (const [name, polygon] of Object.entries(SEG7)) {
        const on = active.includes(name);
        const plate = (dx = 0, dy = 0) => {
          ctx.beginPath();
          polygon.forEach(([px,py],j) => {
            const tx=bx+(px+2)/46*uw*dpr+dx, ty=by+py/76*uh*dpr+dy;
            if(j)ctx.lineTo(tx,ty);else ctx.moveTo(tx,ty);
          });
          ctx.closePath();
        };
        // Internal return is faint and belongs only to energized phosphor.
        // Dormant electrodes are passive geometry and never acquire a halo.
        if (on) {
          ctx.fillStyle=col;ctx.globalAlpha=duty*.035;ctx.shadowBlur=0;
          plate(.75*dpr,1.1*dpr);ctx.fill();
        }
        ctx.fillStyle=on?col:dim;
        ctx.globalAlpha=on?duty:.19;
        ctx.shadowColor=on?col:'transparent';ctx.shadowBlur=on?3.8*dpr:0;
        plate();ctx.fill();
      }
    }
    ctx.shadowBlur=0;
    ctx.globalAlpha = 1;
    // At ordinary body-text size a visible mesh would destroy legibility.
    // Larger counters expose the separately suspended gate and filament pair.
    if (uh >= 20) drawVfdGrid(ctx, {
      x:x*cellW*dpr, y:y*cellH*dpr, w:text.length*1.15*scale*cellW*dpr,
      h:uh*dpr, dpr, reducedMotion:hardwareMotionReduced(),
    });
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
// THE BIG-TEXT PATH IS CACHED TOO, AND IT HAS TO BE.
//
// uiText goes through the atlas, so its glow is baked once per glyph and blitted
// thereafter. drawVfdText did not: it re-ran the whole dot loop every frame, for
// every character, at 50 call sites across combat, dialogue, titles, credits and
// the recorder. A 20-character title at scale 2 was several hundred shadowed
// fills a frame. Making the glow better without caching this would have made the
// worst path worse.
//
// BRIGHTNESS IS NOT PART OF THE KEY. It is the blit.
//
// The two time-varying terms — litDuty (16 pwm steps) and scanDuty (three
// values) — are both pure amplitude multipliers, so folding them into the cache
// key would have meant baking 48 variants of every character and re-baking as
// the multiplex artifact cycled. Measured, the two-lobe bake is ~0.15ms a glyph
// against ~0.02ms for the shadowBlur it replaced, so 48 variants of a title is
// a real hitch rather than a rounding error.
//
// So the tile is baked ONCE at full duty and dimmed with globalAlpha when it is
// blitted. The key collapses to (glyph, colour, size) and the whole display
// dims together, which is what a display does. It is also exactly what the
// atlas has always done for uiText — bake at brightness, blit at alpha.
const vfdTextTiles = new Map();
const VFD_TEXT_TILE_LIMIT = 1400;

function vfdTextTile(glyph, { color, dim, cw, ch, dpr, blur, halation }) {
  const key = `${glyph}|${color}|${dim}|${Math.round(cw)}|${Math.round(ch)}|${dpr}`;
  const hit = vfdTextTiles.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const bleed = vfdGlowBleed(cw, ch);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(cw + bleed * 2);
  canvas.height = Math.ceil(ch + bleed * 2);
  const tileCtx = canvas.getContext('2d');
  if (!tileCtx) return null;
  drawVfdGlyph(tileCtx, glyph, bleed, bleed, cw, ch, { color, dim, blur, dpr, alpha: 1, scan: 1, halation });
  // A flat cap rather than an LRU: the key space is bounded by construction, so
  // this only trips if a caller invents sizes every frame — and if that happens,
  // dropping the lot is cheaper than pretending to be clever about it.
  if (vfdTextTiles.size > VFD_TEXT_TILE_LIMIT) vfdTextTiles.clear();
  const tile = { canvas, bleed };
  vfdTextTiles.set(key, tile);
  return tile;
}

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
      const px = (x * cellW * dpr) + i * cw;
      const glyphColor = tint || uiRoleColor(role, cellX, cols);
      const glyphDim = themeRoleDim('phosphor', cellX, cols);
      const scan = scanDuty(cellX, y);
      const tile = vfdTextTile(value[i], {
        color: glyphColor, dim: glyphDim, cw, ch, dpr, blur: 4.25, halation: 0.18,
      });
      if (tile) {
        const level = Math.max(0, Math.min(1, duty * scan));
        if (level <= 0) continue;
        if (level !== 1) ctx.globalAlpha = level;
        ctx.drawImage(tile.canvas, px - tile.bleed, oy - tile.bleed);
        if (level !== 1) ctx.globalAlpha = 1;
      } else {
        drawVfdGlyph(ctx, value[i], px, oy, cw, ch, {
          color: glyphColor, dim: glyphDim, blur: 4.25, dpr, alpha: duty, scan, halation: 0.18,
        });
      }
    }
  });

  return value.length * scale;
}

// ── ILLUMINATED PUSHBUTTON LEGEND CAPS ───────────────────────────────────────
//
// Colored resin remains visible with the lamp off. Heating the lamp changes
// the transmitted field, never the printed legend. Cap travel carries both the
// face and its ink; the metal retainer and hit target stay fixed. Electronic
// state belongs in the neighboring phosphor readout, not on the plastic.
export const LAMP = Object.freeze({
  amber: '#E9A62A', red: '#D63B2B', green: '#5FB878', blue: '#4A86C8', white: '#D9D8CE',
});

/**
 * A physical actuator. All public/returned geometry is UI cells. Lamp heat and
 * cap travel are independent; selected/focused only marks the fixed surround.
 * The moving content rectangle owns every printed icon and legend on its face.
 */
export function drawLampButton(x, y, w, h, {
  legend = '', code = '', lit = false, color = 'amber', enabled = true,
  selected = false, focused = selected, alpha = 1, controlId = null,
  latched = false, finish = 'lens', travel = null, lampHeat = null,
} = {}) {
  const state = controlId ? sampleControl(controlId, {lit,latched,enabled,reducedMotion:hardwareMotionReduced()}) : { travel: latched ? .8 : 0, lampHeat: lit && enabled ? 1 : 0 };
  const depth = clamp01(travel ?? state.travel), heat = clamp01(lampHeat ?? state.lampHeat);
  const ink = '#12150d';
  const metrics = uiCellMetrics();
  const geometry = hardwareCapGeometry(w*metrics.cellW,h*metrics.cellH,depth,{finish});
  const content = { x: x+geometry.content.x/metrics.cellW, y: y+geometry.content.y/metrics.cellH,
    w: geometry.content.w/metrics.cellW, h: geometry.content.h/metrics.cellH };
  uiDrawHardware(({ ctx, dpr, cellW, cellH }) => {
    const px = x * cellW * dpr, py = y * cellH * dpr;
    const pw = w * cellW * dpr, ph = h * cellH * dpr;
    drawHardwareCap(ctx,px,py,pw,ph,{color,finish,travel:depth,lampHeat:heat,enabled,focused,alpha,dpr});
    if (code) {
      drawCapLegend(ctx,code,content.x,content.y,content.w,content.h*.34,ink,dpr,cellW,cellH,alpha*.82);
    }
    drawCapLegend(ctx,legend,content.x,code ? content.y+content.h*.34 : content.y,
      content.w,content.h*(code ? .66 : 1),ink,dpr,cellW,cellH,alpha);
  });
  return { x,y,w,h,content,ink,travel:depth,lampHeat:heat,offsetY:geometry.distance*depth/metrics.cellH };
}

export function drawButtonCluster(x, y, { w = 6, keys = [] } = {}) {
  // Legend caps, not outlined labels. `lit` names which lamp is behind the cap,
  // and it stays the transport's own vocabulary: rec is the red one, play the
  // green, power the blue. A key with no lamp is unlit plastic, which is still a
  // key — see drawLampButton for why that matters.
  const lamp = { rec: 'red', play: 'green', power: 'blue' };
  keys.forEach((k, i) => {
    drawLampButton(x, y + i * 2, w - 2, 1.6, {
      legend: k.label || '',
      code: k.code || '',
      lit: !!k.lit,
      color: k.color || lamp[k.lit] || 'white',
      enabled: k.enabled !== false,
      selected: !!k.selected,
      controlId: k.controlId || null,
      latched: !!k.latched,
      finish: k.finish || ((k.color || lamp[k.lit] || 'white') === 'white' ? 'opaque' : 'lens'),
    });
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
