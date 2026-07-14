import { uiDraw, uiFill, uiLine, uiText, uiWrap } from '../render/ui.js';
import { UI_COLOR } from '../render/palette.js';
import { loadStoryArtImage, resolveStoryArt } from './story-art.js';

export const STORY_ART_LAYOUT = Object.freeze({
  compact: { minRows: 8, maxRows: 11, preferredRows: 10 },
  hero: { minRows: 13, maxRows: 19, preferredRows: 16 },
  boss: { minRows: 14, maxRows: 22, preferredRows: 18 },
});

// Side-by-side story plates split the monitor body into two fixed channels:
// image on the left, transcript/action text on the right. Long transcript or
// choice copy must wrap/clip inside the text lane; it must never negotiate the
// art card down to a smaller card.
export const STORY_ART_SIDE_BY_SIDE = Object.freeze({
  rows: 16,
  minArtCols: 24,
  minTextCols: 28,
  gap: 2,
  bottomPadRows: 2,
  // drawMachinePanel consumes header/footer/bezel rows before returning its
  // inner body. Callers use this conservative reserve when sizing the outer
  // panel before the exact body rect exists.
  panelOverheadRows: 6,
  headerReserveRows: 4,
});

export function storyArtSideBySideRows() {
  return STORY_ART_SIDE_BY_SIDE.rows;
}

export function storyArtSideBySideCols() {
  return STORY_ART_SIDE_BY_SIDE.minArtCols;
}

export function storyArtSideBySideSplit(panelCols = 0, gap = STORY_ART_SIDE_BY_SIDE.gap) {
  const cols = Math.max(0, Math.floor(Number(panelCols) || 0));
  const g = Math.max(1, Math.floor(Number(gap) || 1));
  const usable = Math.max(0, cols - g);
  const artCols = Math.floor(usable / 2);
  const textCols = usable - artCols;
  return { artCols, textCols, gap: g };
}

export function storyArtSideBySidePanelRows({
  choicesRows = 0,
  headerRows = STORY_ART_SIDE_BY_SIDE.headerReserveRows,
  bottomPadRows = STORY_ART_SIDE_BY_SIDE.bottomPadRows,
} = {}) {
  return STORY_ART_SIDE_BY_SIDE.panelOverheadRows +
    Math.max(0, Math.floor(Number(headerRows) || 0)) +
    STORY_ART_SIDE_BY_SIDE.rows +
    Math.max(0, Math.floor(Number(bottomPadRows) || 0)) +
    Math.max(0, Math.floor(Number(choicesRows) || 0));
}

export function storyArtRows(mode = 'compact', availableRows = 12) {
  const spec = STORY_ART_LAYOUT[mode] || STORY_ART_LAYOUT.compact;
  const available = Math.max(0, Math.floor(Number(availableRows) || 0));
  if (available <= 0) return spec.minRows;
  return Math.max(spec.minRows, Math.min(spec.preferredRows, spec.maxRows, available));
}

export function storyArtFits({ availableRows = 0, mode = 'compact' } = {}) {
  const spec = STORY_ART_LAYOUT[mode] || STORY_ART_LAYOUT.compact;
  return Math.floor(Number(availableRows) || 0) >= spec.minRows;
}

export function planStoryArtInPanel({
  art,
  mode = 'compact',
  panelRows = 0,
  textRowsMin = 4,
  choicesRows = 3,
} = {}) {
  if (!art) return { show: false, rows: 0 };

  const preferredMode = mode || art.mode || 'compact';
  const usable = Math.max(
    0,
    Math.floor(Number(panelRows) || 0) -
      Math.max(0, Math.floor(Number(textRowsMin) || 0)) -
      Math.max(0, Math.floor(Number(choicesRows) || 0)) -
      1,
  );

  if (storyArtFits({ availableRows: usable, mode: preferredMode })) {
    return { show: true, rows: storyArtRows(preferredMode, usable), mode: preferredMode };
  }

  if (preferredMode !== 'compact' && storyArtFits({ availableRows: usable, mode: 'compact' })) {
    return { show: true, rows: storyArtRows('compact', usable), mode: 'compact', downgraded: true };
  }

  return { show: false, rows: 0, reason: 'not-enough-room' };
}


export function storyArtCols(mode = 'compact', availableCols = 32) {
  const cols = Math.max(0, Math.floor(Number(availableCols) || 0));
  const preferred = mode === 'boss' ? 34 : mode === 'hero' ? 32 : 26;
  const min = mode === 'boss' ? 24 : mode === 'hero' ? 23 : 18;
  const max = mode === 'boss' ? 40 : mode === 'hero' ? 38 : 30;
  if (cols <= 0) return min;
  return Math.max(min, Math.min(preferred, max, cols));
}

export function planStoryArtSideBySide({
  art,
  mode = 'compact',
  panelRows = 0,
  panelCols = 0,
  textRowsMin = 4,
  choicesRows = 3,
  minTextCols = STORY_ART_SIDE_BY_SIDE.minTextCols,
  bottomPadRows = STORY_ART_SIDE_BY_SIDE.bottomPadRows,
} = {}) {
  if (!art) return { show: false, rows: 0, artCols: 0, textCols: 0 };

  // Intentionally read, but do not let these values resize the plate. They are
  // part of the API because older callers pass them; the side-by-side contract
  // is stricter: the portrait card is fixed, and prose wraps inside the lane.
  void textRowsMin;
  void choicesRows;

  const preferredMode = mode || art.mode || 'compact';
  const cols = Math.max(0, Math.floor(Number(panelCols) || 0));
  const rows = STORY_ART_SIDE_BY_SIDE.rows;
  const split = storyArtSideBySideSplit(cols, STORY_ART_SIDE_BY_SIDE.gap);
  const artCols = split.artCols;
  const textCols = split.textCols;
  const gap = split.gap;
  const pad = Math.max(0, Math.floor(Number(bottomPadRows) || 0));
  const requiredRows = rows + pad;
  const availableRows = Math.max(0, Math.floor(Number(panelRows) || 0));
  const requiredTextCols = Math.max(
    STORY_ART_SIDE_BY_SIDE.minTextCols,
    Math.floor(Number(minTextCols) || 0),
  );
  if (availableRows < requiredRows) {
    return {
      show: false,
      rows: 0,
      artCols: 0,
      textCols: 0,
      reason: 'not-enough-fixed-art-height',
      requiredRows,
    };
  }

  if (artCols < STORY_ART_SIDE_BY_SIDE.minArtCols || textCols < requiredTextCols) {
    return {
      show: false,
      rows: 0,
      artCols: 0,
      textCols: 0,
      reason: 'not-enough-fixed-art-width',
      requiredCols: STORY_ART_SIDE_BY_SIDE.minArtCols + gap + requiredTextCols,
    };
  }

  return {
    show: true,
    mode: preferredMode,
    rows,
    artCols,
    textCols,
    gap,
    bottomPadRows: pad,
    fixed: true,
  };
}

function coverRect(srcW, srcH, dstW, dstH) {
  if (!srcW || !srcH || !dstW || !dstH) {
    return { sx: 0, sy: 0, sw: srcW || 1, sh: srcH || 1 };
  }

  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;

  if (srcRatio > dstRatio) {
    const sw = srcH * dstRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }

  const sh = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

function toneIsWarning(art) {
  return art?.tone === 'device' || art?.tone === 'signal';
}

function imageLoaded(imgRec) {
  return !!(imgRec?.loaded && !imgRec.error && imgRec.image?.naturalWidth && imgRec.image?.naturalHeight);
}

export function drawStoryArtCard(ref, {
  x = 0,
  y = 0,
  w = 40,
  rows = 8,
  mode = null,
  fallbackCaption = 'Source not mounted',
  reduceFlash = false,
  lockRows = false,
} = {}) {
  const art = resolveStoryArt(ref);
  if (!art) return { rendered: false, rows: 0, art: null };

  const cardMode = mode || art.mode || 'compact';
  const h = lockRows
    ? Math.max(1, Math.floor(Number(rows) || 1))
    : storyArtRows(cardMode, rows);
  const imgRec = art.src ? loadStoryArtImage(art.src) : null;
  const warning = toneIsWarning(art);

  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = x * cellW * dpr;
    const py = y * cellH * dpr;
    const pw = w * cellW * dpr;
    const ph = h * cellH * dpr;
    const railH = Math.max(2.25 * cellH * dpr, 28 * dpr);
    const pad = Math.max(0.55 * cellW * dpr, 5 * dpr);
    const border = warning ? 'rgba(255,178,74,0.52)' : 'rgba(112,255,230,0.42)';
    const dimBorder = warning ? 'rgba(255,178,74,0.18)' : 'rgba(112,255,230,0.16)';
    const glow = warning ? 'rgba(255,178,74,0.10)' : 'rgba(112,255,230,0.08)';

    ctx.save();
    ctx.fillStyle = 'rgba(0,8,7,0.90)';
    ctx.fillRect(px, py, pw, ph);

    // A nested evidence-frame: glass, bevel, corner brackets. The image pane
    // fills the card; metadata rides over the plate instead of stealing a
    // separate stacked block.
    ctx.strokeStyle = dimBorder;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(px + 0.5 * dpr, py + 0.5 * dpr, pw - dpr, ph - dpr);
    ctx.strokeStyle = border;
    ctx.strokeRect(px + 1.5 * dpr, py + 1.5 * dpr, pw - 3 * dpr, ph - 3 * dpr);

    const imageBoxX = px + pad;
    const imageBoxY = py + pad;
    const imageBoxW = Math.max(1, pw - 2 * pad);
    const imageBoxH = Math.max(1, ph - 2 * pad);

    ctx.fillStyle = 'rgba(1,4,8,0.98)';
    ctx.fillRect(imageBoxX, imageBoxY, imageBoxW, imageBoxH);

    if (imageLoaded(imgRec)) {
      const img = imgRec.image;
      const r = coverRect(img.naturalWidth, img.naturalHeight, imageBoxW, imageBoxH);
      ctx.save();
      ctx.beginPath();
      ctx.rect(imageBoxX, imageBoxY, imageBoxW, imageBoxH);
      ctx.clip();
      ctx.globalAlpha = warning ? 0.94 : 0.97;
      ctx.filter = warning
        ? 'saturate(0.92) contrast(1.14) brightness(0.91)'
        : 'saturate(0.94) contrast(1.08) brightness(0.95)';
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, imageBoxX, imageBoxY, imageBoxW, imageBoxH);
      ctx.filter = 'none';

      // Phosphor plate wash: screen-space, quiet, stable.
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = warning ? 0.10 : 0.07;
      ctx.fillStyle = warning ? 'rgba(255,178,74,1)' : 'rgba(112,255,230,1)';
      ctx.fillRect(imageBoxX, imageBoxY, imageBoxW, imageBoxH);
      ctx.restore();
    } else {
      ctx.fillStyle = art.missing ? 'rgba(255,178,74,0.07)' : 'rgba(112,255,230,0.05)';
      ctx.fillRect(imageBoxX, imageBoxY, imageBoxW, imageBoxH);
      ctx.strokeStyle = art.missing ? 'rgba(255,178,74,0.28)' : 'rgba(112,255,230,0.18)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.strokeRect(imageBoxX + dpr, imageBoxY + dpr, imageBoxW - 2 * dpr, imageBoxH - 2 * dpr);
    }

    // Static VFD faceplate. It covers the whole still so the card reads as an
    // instrument surface, but never becomes a flashing effect.
    ctx.save();
    ctx.globalAlpha = reduceFlash ? 0.014 : 0.030;
    ctx.fillStyle = warning ? 'rgba(255,178,74,1)' : 'rgba(112,255,230,1)';
    const step = Math.max(6, Math.round(8 * dpr));
    for (let yy = imageBoxY; yy < imageBoxY + imageBoxH; yy += step) {
      ctx.fillRect(imageBoxX, yy, imageBoxW, Math.max(1, dpr));
    }
    ctx.restore();

    // Corner brackets and side calibration ticks make the frame feel built.
    ctx.save();
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(1, dpr);
    const br = Math.max(8 * dpr, 0.9 * cellW * dpr);
    const ix0 = imageBoxX + 1.5 * dpr;
    const iy0 = imageBoxY + 1.5 * dpr;
    const ix1 = imageBoxX + imageBoxW - 1.5 * dpr;
    const iy1 = imageBoxY + imageBoxH - 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(ix0, iy0 + br); ctx.lineTo(ix0, iy0); ctx.lineTo(ix0 + br, iy0);
    ctx.moveTo(ix1 - br, iy0); ctx.lineTo(ix1, iy0); ctx.lineTo(ix1, iy0 + br);
    ctx.moveTo(ix0, iy1 - br); ctx.lineTo(ix0, iy1); ctx.lineTo(ix0 + br, iy1);
    ctx.moveTo(ix1 - br, iy1); ctx.lineTo(ix1, iy1); ctx.lineTo(ix1, iy1 - br);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = reduceFlash ? 0.045 : 0.085;
    ctx.fillStyle = glow;
    ctx.fillRect(px + 2 * dpr, py + 2 * dpr, pw - 4 * dpr, ph - 4 * dpr);
    ctx.restore();

    // Lower identification rail is translucent and overlaid on the still, not a
    // separate top/bottom stack.
    const railY = py + ph - railH - pad;
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(imageBoxX, railY, imageBoxW, railH);
    ctx.strokeStyle = dimBorder;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.moveTo(imageBoxX, railY + 0.5 * dpr);
    ctx.lineTo(imageBoxX + imageBoxW, railY + 0.5 * dpr);
    ctx.stroke();
    ctx.restore();
  });

  const label = String(art.label || '').toUpperCase();
  const status = String(art.status || '').toUpperCase();
  const caption = art.missing ? fallbackCaption : art.caption;
  const labelY = y + h - 2;
  const captionY = y + h - 1;

  if (label) uiText(x + 2, labelY, label.slice(0, Math.max(0, w - 4)), warning ? 'ui-amber' : 'ui-label');
  if (status) uiText(
    Math.max(x + 2, x + w - status.length - 2),
    labelY,
    status,
    warning ? 'ui-amber' : 'ui-secondary',
    warning ? 0.82 : 0.72,
  );

  if (caption && h >= 8) {
    const lines = uiWrap(caption, Math.max(12, w - 4));
    if (lines[0]) uiText(x + 2, captionY, lines[0], 'ui-secondary', 0.66);
  }

  // A one-cell dormant baseline keeps missing stills from looking broken.
  if (art.missing) {
    uiFill(x + 2, y + Math.max(2, Math.floor(h / 2)), Math.max(4, w - 4), 0.16, 'rgba(255,178,74,0.20)');
    uiLine(x + 2, y + Math.max(3, Math.floor(h / 2) + 1), x + Math.max(4, w - 2), y + Math.max(3, Math.floor(h / 2) + 1), UI_COLOR.amber, 0.34, 1);
  }

  return { rendered: true, rows: h, art };
}
