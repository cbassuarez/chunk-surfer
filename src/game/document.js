// The reader. A page held up in the dark.
//
// Documents are paged physical sheets, not scrollable terminal output. The
// world keeps moving while you read, but the document itself behaves like paper:
// readable type, restrained institutional headers, page turns, and a stable
// erosion pattern. The physical sheet identity lives in render/paper.js;
// this file owns document layout and reading interaction.

import * as scenes from './scenes.js';
import { uiScrim, uiDraw, uiSize } from '../render/ui.js';
import { paperProfile, drawPaperSheet, drawPaperOverlay, applyPaperTransform } from '../render/paper.js';
import { interpolate } from './terror.js';

const PAPER_MIN_W = 48;
const PAPER_MAX_W = 74;
const PAPER_MAX_H = 38;
const OUTER_Y = 2;

const INK = '#241A0E';
const MUTED = '#6A5E49';
const FAINT = '#8B7D62';

let onClose = () => {};
let onTurn = () => {};         // a page turning is a noise event

export function documentInit({ close, turn } = {}) {
  if (close) onClose = close;
  if (turn) onTurn = turn;
}

// The erosion. Decay eats characters, never rewrites them: a hole in a page is
// a hole, and the reader's eye fills it in wrong. That is the whole effect.
//
// Rate rises with the square of decay so the first pages are merely typed on a
// bad ribbon and the last are barely there.
const ROT = '·.,\'`~-';
function erode(line, decay, seed) {
  if (decay <= 0) return line;
  let out = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === ' ') {
      out += ' ';
      continue;
    }

    // A stable hash, so a page does not shimmer while you read it. The same
    // holes are in the same places every time you look, as holes are.
    const h = ((seed * 374761393 + i * 668265263) ^ (line.length * 2246822519)) >>> 0;
    const r = (h % 10000) / 10000;

    if (r < decay * decay) out += ' ';
    else if (r < decay * decay + decay * 0.10) out += ROT[h % ROT.length];
    else out += ch;
  }

  return out;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function canvasFont(px, weight = '') {
  return `${weight ? weight + ' ' : ''}${Math.round(px)}px "Courier New", Courier, ui-monospace, monospace`;
}

function measureTracked(ctx, text, tracking = 0) {
  const s = String(text ?? '');
  if (!s) return 0;
  return ctx.measureText(s).width + Math.max(0, s.length - 1) * tracking;
}

function drawTracked(ctx, text, x, y, {
  font,
  color = INK,
  alpha = 1,
  tracking = 0,
  jitter = 0.035,
  seed = 1,
  dropout = 0.006,
  overprint = 0.075,
  blend = 'multiply',
} = {}) {
  const s = String(text ?? '');
  if (!s) return;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.globalCompositeOperation = blend;

  let cx = x;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const w = ctx.measureText(ch).width;

    if (ch !== ' ') {
      const h = ((seed * 2654435761 + i * 40503) ^ s.length) >>> 0;
      const r0 = (h & 255) / 255;
      const r1 = ((h >>> 8) & 255) / 255;
      const r2 = ((h >>> 16) & 1023) / 1023;
      const r3 = ((h >>> 26) & 63) / 63;

      const a = alpha * (1 - jitter + r0 * jitter) * (r2 < dropout ? 0.38 : 1);
      const jx = (r1 - 0.5) * 0.22;
      const jy = (r3 - 0.5) * 0.20;

      ctx.globalAlpha = a;
      ctx.fillText(ch, cx + jx, y + jy);

      // Rare ribbon double-strike. Subpixel and faint so readability wins.
      if (r2 > 1 - overprint) {
        ctx.globalAlpha = a * 0.28;
        ctx.fillText(ch, cx + jx + 0.32, y + jy - 0.18);
      }
    }

    cx += w + tracking;
  }

  ctx.restore();
}

function wrapMeasured(ctx, text, maxPx, { font, tracking = 0 } = {}) {
  const raw = String(text ?? '').trim();
  if (!raw) return [''];

  ctx.save();
  ctx.font = font;

  const lines = [];
  let line = '';

  for (const word of raw.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;

    if (line && measureTracked(ctx, next, tracking) > maxPx) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  ctx.restore();

  return lines.length ? lines : [''];
}

function sourceEntries(doc) {
  // Future-proofing: later authored documents can supply explicit pages without
  // forcing the renderer to learn a new scene shape. Current documents still use
  // `body` and are auto-paginated.
  if (Array.isArray(doc.pages)) {
    const out = [];

    doc.pages.forEach((page, i) => {
      if (i > 0) out.push({ pageBreak: true });
      if (Array.isArray(page)) out.push(...page);
      else out.push(page);
    });

    return out;
  }

  return Array.isArray(doc.body) ? doc.body : [];
}

function layoutLines(doc, ctx, m) {
  const lines = [];

  ctx.save();
  ctx.font = m.bodyFont;
  const bodyMeasureW = Math.min(
    m.bodyW,
    measureTracked(ctx, 'M'.repeat(62), m.bodyTracking),
  );

  ctx.font = m.metaFont;
  const metaMeasureW = Math.min(
    m.bodyW,
    measureTracked(ctx, 'M'.repeat(68), m.metaTracking),
  );
  ctx.restore();

  for (const entry of sourceEntries(doc)) {
    if (entry?.pageBreak) {
      lines.push({ kind: 'pageBreak' });
      continue;
    }

    if (entry === '') {
      lines.push({ kind: 'blank', h: m.lineH * 0.70 });
      continue;
    }

    if (typeof entry === 'string') {
      const paragraph = interpolate(entry);

      for (const text of wrapMeasured(ctx, paragraph, bodyMeasureW, {
        font: m.bodyFont,
        tracking: m.bodyTracking,
      })) {
        lines.push({
          kind: 'body',
          text,
          h: m.lineH,
          font: m.bodyFont,
          tracking: m.bodyTracking,
        });
      }

      continue;
    }

    if (entry?.rule) {
      lines.push({ kind: 'rule', h: m.lineH * 0.95 });
      continue;
    }

    if (entry?.raw != null) {
      const text = interpolate(entry.raw);

      // Raw lines are field rows, signatures, and deliberate fragments. Preserve
      // author spacing, but let future overlong raw text wrap once rather than
      // escaping the sheet.
      if (measureTracked(ctx, text, m.metaTracking) <= metaMeasureW) {
        lines.push({
          kind: 'meta',
          text,
          h: m.lineH * 0.95,
          font: m.metaFont,
          tracking: m.metaTracking,
          cls: entry.cls,
        });
      } else {
        for (const l of wrapMeasured(ctx, text, metaMeasureW, {
          font: m.metaFont,
          tracking: m.metaTracking,
        })) {
          lines.push({
            kind: 'meta',
            text: l,
            h: m.lineH * 0.95,
            font: m.metaFont,
            tracking: m.metaTracking,
            cls: entry.cls,
          });
        }
      }
    }
  }

  return lines;
}

function trimPage(page) {
  while (page.length && page[0].kind === 'blank') page.shift();
  while (page.length && page[page.length - 1].kind === 'blank') page.pop();
  return page;
}

function paginate(lines, maxH) {
  const pages = [[]];
  let used = 0;

  const nextPage = () => {
    trimPage(pages[pages.length - 1]);
    pages.push([]);
    used = 0;
  };

  for (const line of lines) {
    if (line.kind === 'pageBreak') {
      nextPage();
      continue;
    }

    const h = line.h || 1;

    if (pages[pages.length - 1].length && used + h > maxH) nextPage();
    if (!pages[pages.length - 1].length && line.kind === 'blank') continue;

    pages[pages.length - 1].push(line);
    used += h;
  }

  for (const p of pages) trimPage(p);

  const filtered = pages.filter((p) => p.length);
  return filtered.length ? filtered : [[]];
}

function makeMetrics({ dpr, cellW, cellH, cols, rows }, doc) {
  const availableW = Math.max(32, cols - 6);
  const availableH = Math.max(18, rows - OUTER_Y * 2);

  const paperW = Math.round(
    availableW >= PAPER_MIN_W
      ? clamp(availableW, PAPER_MIN_W, PAPER_MAX_W)
      : availableW,
  );

  const paperH = Math.round(
    availableH >= 24
      ? clamp(availableH, 24, PAPER_MAX_H)
      : availableH,
  );

  const x = Math.floor((cols - paperW) / 2);
  const y = Math.floor((rows - paperH) / 2);

  const px = x * cellW * dpr;
  const py = y * cellH * dpr;
  const pw = paperW * cellW * dpr;
  const ph = paperH * cellH * dpr;

  const marginX = 5.0 * cellW * dpr;
  const top = 3.1 * cellH * dpr;
  const bodyTop = 8.1 * cellH * dpr;
  const footerY = ph - 2.2 * cellH * dpr;
  const bodyBottom = footerY - 1.35 * cellH * dpr;

  const titlePx = clamp(cellH * 0.72, 11, 15) * dpr;
  const bylinePx = clamp(cellH * 0.55, 9, 12) * dpr;
  const bodyPx = clamp(cellH * 0.78, 13, 16) * dpr;
  const metaPx = clamp(cellH * 0.62, 10, 13) * dpr;
  const footerPx = clamp(cellH * 0.56, 9, 12) * dpr;

  const lineH = cellH * 1.34 * dpr;

  return {
    key: `${doc.id || doc.title || 'doc'}:${cols}x${rows}:${paperW}x${paperH}:${dpr}`,
    paperW,
    paperH,
    x,
    y,
    px,
    py,
    pw,
    ph,
    textX: px + marginX,
    textW: pw - marginX * 2,
    headerY: py + top,
    bylineY: py + top + 1.55 * cellH * dpr,
    ruleY: py + top + 3.05 * cellH * dpr,
    bodyY: py + bodyTop,
    bodyW: pw - marginX * 2,
    maxBodyH: Math.max(lineH * 5, bodyBottom - bodyTop),
    footerY: py + footerY,
    titleFont: canvasFont(titlePx, 'bold'),
    bylineFont: canvasFont(bylinePx),
    bodyFont: canvasFont(bodyPx),
    metaFont: canvasFont(metaPx),
    footerFont: canvasFont(footerPx),
    titleTracking: 2.8 * dpr,
    bylineTracking: 3.2 * dpr,
    bodyTracking: 0.12 * dpr,
    metaTracking: 1.55 * dpr,
    footerTracking: 1.1 * dpr,
    lineH,
  };
}

function drawRule(ctx, x, y, w, color, alpha = 0.42) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 7]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.restore();
}

export function readDocument(doc) {
  if (!doc) return null;
  return scenes.push(makeDocumentScene(doc));
}

function makeDocumentScene(doc) {
  const decay = Math.max(0, Math.min(1, doc.decay || 0));
  let page = 0;
  let cacheKey = '';
  let pages = [[]];

  function close() {
    scenes.pop();
    onClose(doc);
  }

    function turnTo(next) {
      const max = Math.max(0, pages.length - 1);
      const prev = page;
      const clamped = clamp(next, 0, max);

      if (clamped !== page) {
        page = clamped;
        onTurn({
          doc,
          page,
          prev,
          total: pages.length,
          dir: Math.sign(clamped - prev) || 1,
        });
      }
    }

  function rebuild(ctx, m) {
    if (cacheKey === m.key) return;

    cacheKey = m.key;

    ctx.save();
    const lines = layoutLines(doc, ctx, m);
    pages = paginate(lines, m.maxBodyH);
    ctx.restore();

    page = clamp(page, 0, Math.max(0, pages.length - 1));
  }

  return {
    id: `doc:${doc.id}`,
    blocksInput: true,
    blocksWorld: false,        // the building does not wait while you read
    lensPreset: 'calm',

    enter() {},

    render() {
      uiScrim(0.88);

      uiDraw((surface) => {
        const { ctx, dpr, cellW, cellH, cols, rows } = surface;
        const m = makeMetrics({ dpr, cellW, cellH, cols, rows }, doc);

          rebuild(ctx, m);

          const total = Math.max(1, pages.length);
          const current = pages[page] || [];
          const profile = paperProfile(doc, page, total);
          const rect = { x: m.px, y: m.py, w: m.pw, h: m.ph, dpr };

          ctx.save();
          applyPaperTransform(ctx, rect, profile);

          // Physical sheet first: base paper, tooth, edge darkening, folds,
          // stains, stamps, authored clerk marks, and page-specific damage.
          // document.js keeps the text readable; render/paper.js makes the sheet
          // feel handled and specific.
          drawPaperSheet(ctx, rect, profile);

          // Header: institutional and widely tracked. Body: readable.
        const title = erode(String(doc.title || 'DOCUMENT').toUpperCase(), decay * 0.45, 1);

        drawTracked(ctx, title, m.textX, m.headerY, {
          font: m.titleFont,
          color: INK,
          alpha: 0.82,
          tracking: m.titleTracking,
          jitter: 0.025,
          seed: 1,
        });

        if (doc.byline) {
          drawTracked(ctx, erode(String(doc.byline).toUpperCase(), decay * 0.6, 2), m.textX, m.bylineY, {
            font: m.bylineFont,
            color: MUTED,
            alpha: 0.68,
            tracking: m.bylineTracking,
            jitter: 0.02,
            seed: 2,
          });
        }

        drawRule(ctx, m.textX, m.ruleY, m.textW, MUTED, 0.36);

        let y = m.bodyY;

        current.forEach((line, i) => {
          if (line.kind === 'blank') {
            y += line.h;
            return;
          }

          if (line.kind === 'rule') {
            drawRule(ctx, m.textX, y - m.lineH * 0.18, m.textW, FAINT, 0.36);
            y += line.h;
            return;
          }

          const isMeta = line.kind === 'meta';
          const seed = page * 1009 + i + 5;
          const color = isMeta || line.cls === 'paper-muted' ? MUTED : INK;
          const alpha = isMeta ? 0.70 : 0.88;

          drawTracked(ctx, erode(line.text, decay, seed), m.textX, y, {
            font: line.font || (isMeta ? m.metaFont : m.bodyFont),
            color,
            alpha,
            tracking: line.tracking ?? (isMeta ? m.metaTracking : m.bodyTracking),
            jitter: isMeta ? 0.028 : 0.040,
            seed,
          });

          y += line.h;
        });

          const left = total > 1 ? `${page + 1} / ${total}` : 'ARCHIVAL COPY';
          const nav = total <= 1
            ? '[ESC] CLOSE'
            : page === 0
              ? '[→] NEXT · [ESC] CLOSE'
              : page === total - 1
                ? '[←] BACK · [ESC] CLOSE'
                : '[←→] PAGE · [ESC] CLOSE';

          ctx.save();
          ctx.font = m.footerFont;
          const rightW = measureTracked(ctx, nav, m.footerTracking);
          ctx.restore();

          drawTracked(ctx, left, m.textX, m.footerY, {
            font: m.footerFont,
            color: MUTED,
            alpha: 0.62,
            tracking: m.footerTracking,
            jitter: 0.02,
            seed: 900 + page,
          });

          drawTracked(ctx, nav, m.textX + m.textW - rightW, m.footerY, {
            font: m.footerFont,
            color: MUTED,
            alpha: 0.62,
            tracking: m.footerTracking,
            jitter: 0.02,
            seed: 1000 + page,
          });

          drawPaperOverlay(ctx, rect, profile);
          ctx.restore();
      });
    },

    key(e) {
      const raw = e.key || '';
      const k = raw.toLowerCase();
      const code = e.code || '';

      const next = () => {
        if (page < pages.length - 1) turnTo(page + 1);
        else close();
      };

      if (
        raw === 'ArrowRight' ||
        raw === 'PageDown' ||
        raw === ' ' ||
        raw === 'Enter' ||
        k === 'd' ||
        k === 'j' ||
        code === 'Space'
      ) {
        next();
        return true;
      }

      if (raw === 'ArrowLeft' || raw === 'PageUp' || k === 'a' || k === 'h') {
        turnTo(page - 1);
        return true;
      }

      if (raw === 'ArrowDown') {
        next();
        return true;
      }

      if (raw === 'ArrowUp') {
        turnTo(page - 1);
        return true;
      }

      if (raw === 'Escape' || k === 'e') {
        close();
        return true;
      }

      return true;   // modal: the building may move, but you may not
    },
  };
}
