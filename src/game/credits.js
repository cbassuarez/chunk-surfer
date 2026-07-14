import { uiDraw, uiScrim, uiText, uiSize, uiCenter, uiWrap } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { CREDITS, CREDIT_RECORD_TITLE, flattenCredits } from '../data/credits.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';

const AUTO_SCROLL_DELAY_MS = 1000;
const AUTO_SCROLL_ROWS_PER_SEC = 0.82;
const KEY_SCROLL_ROWS = 3;
const PAGE_SCROLL_ROWS = 10;
export const CREDITS_INTRO_MIN_DWELL = 1.45;
export const CREDITS_INTRO_DURATION = 5.6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smooth01(value) {
  const t = clamp(Number(value) || 0, 0, 1);
  return t * t * (3 - 2 * t);
}

export function creditsIntroFrame(elapsed, duration = CREDITS_INTRO_DURATION, minDwell = CREDITS_INTRO_MIN_DWELL) {
  const time = Math.max(0, Number(elapsed) || 0);
  const total = Math.max(0.1, Number(duration) || CREDITS_INTRO_DURATION);
  const progress = clamp(time / total, 0, 1);
  const roll = smooth01(progress);
  return {
    id: 'credits-intro',
    time,
    duration: total,
    minDwell,
    canContinue: time >= minDwell,
    progress,
    roll,
    title: smooth01(time / 0.9) * (1 - smooth01((time - total + 1.0) / 1.0)),
    record: smooth01((time - 0.75) / 1.0) * (1 - smooth01((time - total + 0.7) / 0.7)),
    prompt: time >= minDwell ? smooth01((time - minDwell) / 0.7) : 0,
    scan: 0.12 + 0.12 * Math.sin(time * 1.4),
  };
}

export function creditPanelLayout({ cols = 80, rows = 30 } = {}) {
  const c = Math.max(20, Math.floor(cols));
  const r = Math.max(8, Math.floor(rows));
  const marginX = c >= 112 ? 10 : c >= 76 ? 6 : c >= 46 ? 3 : 1;
  const marginY = r >= 42 ? 5 : r >= 22 ? 3 : 1;
  const maxW = c >= 112 ? 104 : 96;
  const minW = Math.min(Math.max(28, c - marginX * 2), Math.max(18, c - 2));
  const w = clamp(c - marginX * 2, minW, Math.min(maxW, c - 2));
  const minH = Math.min(Math.max(18, r - marginY * 2), Math.max(6, r - 2));
  const h = clamp(r - marginY * 2, minH, Math.min(42, r - 2));
  const x = Math.max(0, Math.floor((c - w) / 2));
  const y = Math.max(0, Math.floor((r - h) / 2));
  const compact = w < 74;
  return { cols: c, rows: r, x, y, w, h, compact };
}

function renderIntroLayers(frame, cols, rows) {
  uiScrim(0.90);
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const width = cols * cellW * dpr;
    const height = rows * cellH * dpr;
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, 'rgba(0,0,0,0.84)');
    g.addColorStop(0.45, 'rgba(10,10,8,0.46)');
    g.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.18 + Math.max(0, frame.scan);
    ctx.strokeStyle = UI_COLOR.secondary;
    ctx.lineWidth = Math.max(1, dpr);
    const railY = (rows * (0.32 + frame.roll * 0.36)) * cellH * dpr;
    ctx.beginPath();
    ctx.moveTo(width * 0.12, railY);
    ctx.lineTo(width * 0.88, railY);
    ctx.stroke();

    ctx.globalAlpha = 0.08;
    for (let y = ((frame.time * 2.2) % 4) * cellH * dpr; y < height; y += cellH * dpr * 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  });
}

export function makeCreditsIntroScene({
  onDone,
  duration = CREDITS_INTRO_DURATION,
  minDwell = CREDITS_INTRO_MIN_DWELL,
} = {}) {
  let time = 0;
  let done = false;

  function finish() {
    if (done || time < minDwell) return true;
    done = true;
    onDone?.();
    return true;
  }

  return {
    id: 'credits-intro',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    update(dt = 0) {
      if (done) return;
      time += Math.max(0, Number(dt) || 0);
      if (time >= duration) {
        time = duration;
        finish();
      }
    },

    key(e = {}) {
      if (time < minDwell) return true;
      const raw = e.key || '';
      const code = e.code || '';
      if (raw === 'Enter' || code === 'Enter' || raw === ' ' || code === 'Space'
        || raw === 'Escape' || code === 'Escape' || raw === 'Backspace' || code === 'Backspace') return finish();
      return true;
    },

    view() { return creditsIntroFrame(time, duration, minDwell); },

    render() {
      const { cols, rows } = uiSize();
      const frame = creditsIntroFrame(time, duration, minDwell);
      renderIntroLayers(frame, cols, rows);
      const center = (text) => Math.max(0, Math.floor((cols - String(text).length) / 2));
      const y = Math.max(2, Math.min(rows - 6, Math.floor(rows * 0.40 - frame.roll * 2)));
      uiText(center('CHUNK SURFER'), y, 'CHUNK SURFER', 'ui-primary', frame.title);
      uiText(center(CREDIT_RECORD_TITLE), y + 2, CREDIT_RECORD_TITLE, 'ui-amber', frame.record);
      uiText(center('AUDIOCORP FIELD ARCHIVE'), y + 4, 'AUDIOCORP FIELD ARCHIVE', 'ui-secondary', frame.record * 0.82);
      if (frame.canContinue) {
        const prompt = promptLine([{ action: 'confirm', label: 'OPEN RECORD' }]);
        uiText(center(prompt), Math.min(rows - 2, y + 8), prompt, 'ui-label', frame.prompt);
      }
    },
  };
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

      const { x, y, w, h, compact } = creditPanelLayout({ cols, rows });
      const footer = activeInputPromptDevice() === 'controller'
        ? promptLine([
            { action: 'select', label: 'SCROLL' },
            ...(compact ? [] : [{ action: 'confirm', label: 'WEBSITE' }]),
            { action: 'back', label: 'BACK' },
          ])
        : compact
          ? promptLine([{ action: 'select', label: 'SCROLL' }, { action: 'continue', label: 'PAUSE' }, { action: 'back', label: 'BACK' }])
          : promptLine([{ action: 'select', label: 'SCROLL' }, { action: 'continue', label: 'PAUSE' }, { action: 'confirm', label: 'WEBSITE' }, { action: 'back', label: 'BACK' }]);
      const body = drawMachinePanel(x, y, w, h, {
        theme: 'amber',
        wordmark: 'AUDIOCORP',
        label: CREDIT_RECORD_TITLE,
        source: paused ? 'PAUSED' : 'CREDITS',
        footer,
        meter: false,
      });

      const title = 'CHUNK SURFER';
      uiCenter(body.y, title, 'ui-primary');
      uiCenter(body.y + 1, 'a haunting at Ellery Conservatory', 'ui-secondary');

      const padX = compact ? 2 : 4;
      const contentX = body.x + padX;
      const maxW = Math.max(18, body.w - padX * 2 - 2);
      const contentTop = body.y + (compact ? 3 : 4);
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
