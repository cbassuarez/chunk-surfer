import { uiScrim, uiText, uiSize, uiCenter, uiWrap } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { CREDITS, CREDIT_RECORD_TITLE, flattenCredits } from '../data/credits.js';

const AUTO_SCROLL_DELAY_MS = 1000;
const AUTO_SCROLL_ROWS_PER_SEC = 0.72;
const KEY_SCROLL_ROWS = 3;
const PAGE_SCROLL_ROWS = 10;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function makeCreditsScene({
  credits = CREDITS,
  onClose,
  onWebsite,
  now = () => performance.now(),
} = {}) {
  const source = flattenCredits(credits);
  let scroll = 0;
  let paused = false;
  let lastUserInputMs = now();
  let enteredAtMs = now();

  function userScroll(delta) {
    scroll = clamp(scroll + delta, 0, Math.max(0, source.length - 1));
    lastUserInputMs = now();
    paused = true;
  }

  function close() {
    onClose?.();
    return true;
  }

  return {
    id: 'credits',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    enter() {
      enteredAtMs = now();
      lastUserInputMs = enteredAtMs;
    },

    update(dt = 0) {
      if (paused) return;
      if (now() - enteredAtMs < AUTO_SCROLL_DELAY_MS) return;
      scroll = clamp(scroll + dt * AUTO_SCROLL_ROWS_PER_SEC, 0, Math.max(0, source.length - 1));
    },

    key(e) {
      const raw = e.key || '';
      const code = e.code || '';
      const k = raw.toLowerCase();

      if (raw === 'Escape' || code === 'Escape' || raw === 'Backspace' || code === 'Backspace') return close();
      if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { userScroll(-KEY_SCROLL_ROWS); return true; }
      if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { userScroll(KEY_SCROLL_ROWS); return true; }
      if (raw === 'PageUp') { userScroll(-PAGE_SCROLL_ROWS); return true; }
      if (raw === 'PageDown') { userScroll(PAGE_SCROLL_ROWS); return true; }
      if (raw === 'Home') { scroll = 0; paused = true; lastUserInputMs = now(); return true; }
      if (raw === 'End') { scroll = Math.max(0, source.length - 1); paused = true; lastUserInputMs = now(); return true; }
      if (raw === ' ' || code === 'Space') { paused = !paused; lastUserInputMs = now(); return true; }
      if (raw === 'Enter' || code === 'Enter') { onWebsite?.(); return true; }
      return true;
    },

    view() {
      return { id: 'credits', paused, scroll, lines: source.length, lastUserInputMs };
    },

    render() {
      const { cols, rows } = uiSize();
      uiScrim(0.82);

      const w = Math.min(96, Math.max(56, cols - 6));
      const h = Math.min(Math.max(30, rows - 6), rows - 2);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        theme: 'amber',
        wordmark: 'AUDIOCORP',
        label: CREDIT_RECORD_TITLE,
        source: paused ? 'PAUSED' : 'CREDITS',
        footer: '[↑↓] SCROLL · [SPACE] PAUSE · [ENTER] WEBSITE · [ESC] BACK',
        meter: false,
      });

      const title = 'CHUNK SURFER';
      uiCenter(body.y, title, 'ui-primary');
      uiCenter(body.y + 1, 'a haunting at Ellery Conservatory', 'ui-secondary');

      const contentX = body.x + 4;
      const maxW = Math.max(24, body.w - 8);
      const contentTop = body.y + 4;
      const contentBottom = body.y + body.h - 1;
      const visibleRows = Math.max(1, contentBottom - contentTop);
      const start = Math.floor(scroll);
      let cy = contentTop;

      for (let i = start; i < source.length && cy < contentBottom; i++) {
        const item = source[i];
        if (!item || item.kind === 'blank') { cy++; continue; }
        if (item.kind === 'heading') {
          uiText(contentX, cy, String(item.text || '').toUpperCase(), 'ui-amber');
          cy += 2;
          continue;
        }
        const lines = uiWrap(item.text, maxW);
        for (const line of lines) {
          if (cy >= contentBottom) break;
          uiText(contentX + 2, cy, line, 'ui-secondary');
          cy++;
        }
      }

      if (source.length > visibleRows) {
        const pct = source.length <= 1 ? 1 : clamp(scroll / (source.length - 1), 0, 1);
        const railH = Math.max(4, body.h - 7);
        const knobY = body.y + 4 + Math.round(pct * (railH - 1));
        for (let yy = body.y + 4; yy < body.y + 4 + railH; yy++) uiText(body.x + body.w - 2, yy, '│', 'ui-label');
        uiText(body.x + body.w - 2, knobY, '█', 'ui-primary');
      }
    },
  };
}
