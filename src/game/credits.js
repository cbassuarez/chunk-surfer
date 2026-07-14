import { uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawVfdText } from '../render/presentation.js';
import { CREDITS, flattenCredits } from '../data/credits.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import { creditAtmosphereFrame, renderCreditAtmosphere } from './credit-visual.js';

const AUTO_SCROLL_ROWS_PER_SEC = 0.72;
const KEY_SCROLL_ROWS = 3;
const PAGE_SCROLL_ROWS = 10;
export const END_CREDITS_OPENING_DURATION = 3.8;
export const END_CREDITS_CLOSING_HOLD = 4.0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function centerX(text, cols) {
  return Math.max(0, Math.floor((cols - String(text).length) / 2));
}

function fit(text, width) {
  const value = String(text ?? '');
  const w = Math.max(1, Math.floor(width));
  return value.length <= w ? value : value.slice(0, w);
}

function wrap(text, width) {
  const lines = uiWrap(text, Math.max(1, Math.floor(width)));
  return lines.length ? lines : [''];
}

export function creditRollLayout({ cols = 80, rows = 30, credits = CREDITS } = {}) {
  const c = Math.max(20, Math.floor(cols));
  const r = Math.max(8, Math.floor(rows));
  const maxWidth = clamp(c - 6, Math.min(18, c - 2), Math.min(72, c - 2));
  const entries = [];
  let offset = 0;

  for (const item of flattenCredits(credits)) {
    if (!item || item.kind === 'blank') {
      offset += 2.2;
      continue;
    }
    if (item.kind === 'heading') {
      if (entries.length) offset += 0.8;
      for (const line of wrap(String(item.text || '').toUpperCase(), maxWidth)) {
        entries.push({
          kind: 'heading',
          text: line,
          x: centerX(line, c),
          offset,
          cls: 'ui-amber',
        });
        offset += 1.35;
      }
      offset += 0.75;
      continue;
    }
    for (const line of wrap(item.text, maxWidth)) {
      entries.push({
        kind: 'line',
        text: line,
        x: centerX(line, c),
        offset,
        cls: 'ui-primary',
      });
      offset += 1.35;
    }
  }

  const contentHeight = offset;
  const startY = Math.max(3, r - 5);
  const closingOffset = contentHeight + Math.max(8, r * 0.72);
  const centerRow = Math.floor(r * 0.46);
  const maxScroll = Math.max(0, startY + closingOffset - centerRow);
  return {
    cols: c,
    rows: r,
    maxWidth,
    entries,
    contentHeight,
    startY,
    closingOffset,
    centerRow,
    maxScroll,
  };
}

export function positionedCreditEntries(layout, scroll = 0) {
  const amount = clamp(scroll, 0, layout.maxScroll);
  return layout.entries.map((entry) => ({
    ...entry,
    y: layout.startY + entry.offset - amount,
  }));
}

function openingCardAlpha(elapsed, duration) {
  return smooth01(elapsed / 0.75) * (1 - smooth01((elapsed - duration + 0.85) / 0.85));
}

export function makeCreditsScene({
  credits = CREDITS,
  context = 'menu',
  onDone,
  onWebsite,
  openingDuration = END_CREDITS_OPENING_DURATION,
  closingHold = END_CREDITS_CLOSING_HOLD,
  initialCols = 80,
  initialRows = 30,
} = {}) {
  const presentationContext = context === 'ending' ? 'ending' : 'menu';
  let layout = creditRollLayout({ cols: initialCols, rows: initialRows, credits });
  let elapsed = 0;
  let scroll = 0;
  let paused = false;
  let closingElapsed = 0;
  let done = false;

  function refreshLayout(cols, rows) {
    layout = creditRollLayout({ cols, rows, credits });
    scroll = clamp(scroll, 0, layout.maxScroll);
    return layout;
  }

  function phase() {
    if (elapsed < openingDuration && scroll <= 0.001) return 'opening';
    if (scroll >= layout.maxScroll - 0.001) return 'closing';
    return 'roll';
  }

  function finish() {
    if (done) return true;
    done = true;
    onDone?.();
    return true;
  }

  function enterRoll() {
    elapsed = Math.max(elapsed, openingDuration);
  }

  function userScroll(delta) {
    enterRoll();
    scroll = clamp(scroll + delta, 0, layout.maxScroll);
    closingElapsed = 0;
    paused = true;
  }

  return {
    id: 'credits',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    update(dt = 0) {
      if (done || paused) return;
      const delta = Math.max(0, Number(dt) || 0);
      const before = elapsed;
      elapsed += delta;
      if (elapsed < openingDuration) return;
      const rollDelta = before < openingDuration ? Math.max(0, elapsed - openingDuration) : delta;
      if (scroll < layout.maxScroll) {
        scroll = Math.min(layout.maxScroll, scroll + rollDelta * AUTO_SCROLL_ROWS_PER_SEC);
        if (scroll < layout.maxScroll) return;
      }
      closingElapsed += rollDelta;
      if (presentationContext === 'ending' && closingElapsed >= closingHold) finish();
    },

    key(e = {}) {
      const raw = e.key || '';
      const code = e.code || '';
      const k = raw.toLowerCase();

      if (raw === 'Escape' || code === 'Escape' || raw === 'Backspace' || code === 'Backspace') return finish();
      if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { userScroll(-KEY_SCROLL_ROWS); return true; }
      if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { userScroll(KEY_SCROLL_ROWS); return true; }
      if (raw === 'PageUp') { userScroll(-PAGE_SCROLL_ROWS); return true; }
      if (raw === 'PageDown') { userScroll(PAGE_SCROLL_ROWS); return true; }
      if (raw === 'Home') {
        enterRoll();
        scroll = 0;
        closingElapsed = 0;
        paused = true;
        return true;
      }
      if (raw === 'End') {
        enterRoll();
        scroll = layout.maxScroll;
        closingElapsed = 0;
        paused = true;
        return true;
      }
      if (raw === ' ' || code === 'Space') {
        paused = !paused;
        return true;
      }
      if (raw === 'Enter' || code === 'Enter') {
        onWebsite?.();
        return true;
      }
      return true;
    },

    resize(cols, rows) { return refreshLayout(cols, rows); },

    view() {
      return {
        id: 'credits',
        context: presentationContext,
        phase: phase(),
        paused,
        elapsed,
        scroll,
        maxScroll: layout.maxScroll,
        lines: layout.entries.length,
        closingElapsed,
        done,
      };
    },

    render() {
      const { cols, rows } = uiSize();
      refreshLayout(cols, rows);
      renderCreditAtmosphere(creditAtmosphereFrame(elapsed + scroll * 0.08, {
        alpha: 1,
        intensity: phase() === 'opening' ? 0.78 : 0.62,
      }));

      if (phase() === 'opening') {
        const alpha = openingCardAlpha(elapsed, openingDuration);
        const scale = cols < 54 ? 1.35 : cols < 92 ? 1.78 : 2.05;
        const title = 'CHUNK SURFER';
        drawVfdText(Math.max(0, (cols - title.length * scale) / 2), Math.max(1, rows * 0.34), title, {
          scale,
          theme: 'amber',
          alpha,
        });
        uiText(centerX('RELEASE CREDITS', cols), Math.round(rows * 0.55), 'RELEASE CREDITS', 'ui-amber', alpha * 0.88);
        uiText(
          centerX('A HAUNTING AT ELLERY CONSERVATORY', cols),
          Math.round(rows * 0.55) + 2,
          fit('A HAUNTING AT ELLERY CONSERVATORY', cols - 2),
          'ui-secondary',
          alpha * 0.72,
        );
      } else {
        for (const entry of positionedCreditEntries(layout, scroll)) {
          if (entry.y < -1.5 || entry.y > rows - 2.5) continue;
          uiText(entry.x, entry.y, entry.text, entry.cls, entry.kind === 'heading' ? 0.96 : 0.84);
        }

        const closingY = layout.startY + layout.closingOffset - scroll;
        if (closingY > -5 && closingY < rows + 4) {
          const thanks = 'THANK YOU FOR LISTENING.';
          const scale = cols < 54 ? 1.05 : cols < 92 ? 1.28 : 1.45;
          const alpha = smooth01((scroll - layout.maxScroll + 5) / 5);
          drawVfdText(Math.max(0, (cols - thanks.length * scale) / 2), closingY - 2, thanks, {
            scale,
            theme: 'amber',
            alpha,
          });
          uiText(centerX('CBASSUAREZ.COM', cols), closingY + 2, 'CBASSUAREZ.COM', 'ui-secondary', alpha * 0.82);
        }
      }

      const footer = activeInputPromptDevice() === 'controller'
        ? promptLine([
            { action: 'select', label: 'SCROLL' },
            { action: 'confirm', label: 'WEBSITE' },
            { action: 'back', label: presentationContext === 'ending' ? 'SKIP' : 'BACK' },
          ])
        : `[↑↓] SCROLL · [SPACE] ${paused ? 'RESUME' : 'PAUSE'} · [ENTER] WEBSITE · [ESC] ${presentationContext === 'ending' ? 'SKIP' : 'BACK'}`;
      uiText(centerX(fit(footer, cols - 4), cols), rows - 2, fit(footer, cols - 4), 'ui-label', 0.52);
    },
  };
}
