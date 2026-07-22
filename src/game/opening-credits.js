import * as scenes from './scenes.js';
import { uiSize, uiText, uiWrap } from '../render/ui.js';
import { creditAtmosphereFrame, renderCreditAtmosphere } from './credit-visual.js';

export const OPENING_CREDITS_DURATION = 23.5;

const AUTHORED_DURATION = 23.5;
const QUOTE_LINES = Object.freeze([
  '...might not the glory of the machines consist',
  'in their being without this same boasted gift',
  'of language?',
  '',
  "'Silence,' it has been said by one writer,",
  "'is a virtue which renders us agreeable",
  "to our fellow-creatures.'",
]);

function wallClockSeconds() {
  const monotonic = globalThis.performance?.now?.();
  return Number.isFinite(monotonic) ? monotonic / 1000 : Date.now() / 1000;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smooth(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function fadeWindow(t, fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd) {
  const into = smooth((t - fadeInStart) / Math.max(0.001, fadeInEnd - fadeInStart));
  const out = 1 - smooth((t - fadeOutStart) / Math.max(0.001, fadeOutEnd - fadeOutStart));
  return clamp01(into * out);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function openingCreditFrame(time, duration = OPENING_CREDITS_DURATION) {
  const scale = Math.max(0.01, Number(duration) || OPENING_CREDITS_DURATION) / AUTHORED_DURATION;
  const t = Math.max(0, Number(time) || 0) / scale;
  const creator = fadeWindow(t, 0.85, 1.75, 5.65, 6.40);
  const sound = fadeWindow(t, 7.20, 8.10, 12.00, 12.80);
  const quote = fadeWindow(t, 13.60, 14.55, 22.50, 23.30);
  const attribution = fadeWindow(t, 15.05, 15.85, 22.50, 23.30);
  const beats = { creator, sound, quote, attribution };
  const activeBeat = Object.entries(beats).reduce(
    (best, [key, alpha]) => (alpha > best.alpha ? { key, alpha } : best),
    { key: 'black', alpha: 0.05 },
  ).key;
  return {
    time: Math.max(0, Number(time) || 0),
    duration,
    activeBeat,
    creator,
    sound,
    quote,
    attribution,
    atmosphere: creditAtmosphereFrame(t, {
      alpha: smooth((t - 0.20) / 1.7) * (1 - smooth((t - 22.85) / 0.65)),
      intensity: 0.72,
    }),
  };
}

function fitLine(text, width) {
  const s = String(text ?? '');
  const w = Math.max(1, Math.floor(width));
  return s.length <= w ? s : s.slice(0, w);
}

function wrappedLines(text, width) {
  const w = Math.max(1, Math.floor(width));
  const lines = uiWrap(text, w);
  return lines.length ? lines.flatMap((line) => (line.length <= w ? [line] : [fitLine(line, w)])) : [''];
}

function centeredEntry(text, y, cls, alpha, cols, key) {
  const line = fitLine(text, Math.max(1, cols - 2));
  const x = clamp(Math.floor((cols - line.length) / 2), 0, Math.max(0, cols - line.length));
  return { key, text: line, x, y: Math.round(y), cls, alpha };
}

function stackedCentered(texts, startY, gap, cls, alpha, cols, key) {
  return texts.flatMap((text, index) => wrappedLines(text, Math.max(18, cols - 4)).map((line, wrapIndex) => (
    centeredEntry(line, startY + index * gap + wrapIndex, cls, alpha, cols, key)
  )));
}

export function openingCreditLayout({ cols = 80, rows = 30, frame = openingCreditFrame(0) } = {}) {
  const c = Math.max(20, Math.floor(cols));
  const r = Math.max(8, Math.floor(rows));
  const middle = Math.floor(r / 2);
  const small = r < 22;
  const creditGap = small ? 1 : 2;
  const creditY = clamp(Math.round(r * 0.38), 1, Math.max(1, r - 4));
  const quoteWidth = clamp(c - (c >= 96 ? 28 : 6), Math.min(22, c - 2), Math.min(72, c - 2));
  const quote = [];
  for (const raw of QUOTE_LINES) {
    if (!raw) { quote.push(''); continue; }
    quote.push(...wrappedLines(raw, quoteWidth));
  }
  const attribution = ['SAMUEL BUTLER · EREWHON', 'THE BOOK OF THE MACHINES']
    .flatMap((line) => wrappedLines(line, quoteWidth));
  const quoteBlock = [...quote, '', ...attribution];
  const quoteStart = clamp(
    Math.round(middle - quoteBlock.length / 2),
    1,
    Math.max(1, r - quoteBlock.length - 1),
  );
  const entries = [
    ...stackedCentered(['A GAME BY', 'SEBASTIAN SUAREZ-SOLIS', '2026'], creditY, creditGap, 'ui-secondary', frame.creator, c, 'creator'),
    ...stackedCentered(['SOUND DESIGN', 'SEBASTIAN SUAREZ-SOLIS', 'PAUL YORKE'], creditY, creditGap, 'ui-secondary', frame.sound, c, 'sound'),
  ];
  quoteBlock.forEach((line, index) => {
    const cls = index >= quote.length + 1 ? 'ui-amber' : 'ui-secondary';
    const alpha = index >= quote.length + 1 ? frame.attribution : frame.quote;
    entries.push(centeredEntry(line, quoteStart + index, cls, alpha, c, cls === 'ui-amber' ? 'attribution' : 'quote'));
  });
  return {
    cols: c,
    rows: r,
    creditBand: { y: creditY, gap: creditGap },
    quoteBand: { y: quoteStart, width: quoteWidth, lines: quoteBlock.length },
    entries: entries.filter((entry) => entry.y >= 0 && entry.y < r),
  };
}

// This is part of app boot, not an optional credits page. It deliberately owns
// every key and ends only on its authored clock before the title menu is made.
export function makeOpeningCreditsScene({
  onDone,
  duration = OPENING_CREDITS_DURATION,
  now = wallClockSeconds,
} = {}) {
  let time = 0;
  let done = false;
  let scene = null;
  let lastWallAt = Number(now()) || 0;

  function finish() {
    if (done) return;
    done = true;
    scenes.remove(scene);
    onDone?.();
  }

  scene = {
    id: 'opening-credits',
    blocksInput: true,
    blocksWorld: true,
    lookProfile: 'calm',

    enter() {
      lastWallAt = Number(now()) || lastWallAt;
      document.body.classList.add('opening-credits-screen');
    },
    exit() { document.body.classList.remove('opening-credits-screen'); },
    update(dt) {
      // Credits are part of boot, not an attention prompt. Use real elapsed
      // time when an unfocused/background WebView throttles its frame clock,
      // while retaining dt as the deterministic fixed-step fallback.
      const wallAt = Number(now());
      const wallDelta = Number.isFinite(wallAt)
        ? Math.max(0, wallAt - lastWallAt)
        : 0;
      if (Number.isFinite(wallAt)) lastWallAt = wallAt;
      time += Math.max(Math.max(0, Number(dt) || 0), wallDelta);
      if (time >= duration) finish();
    },
    key() { return true; },
    view() { return { ...openingCreditFrame(time, duration), skippable: false }; },

    render() {
      const { cols, rows } = uiSize();
      const frame = openingCreditFrame(time, duration);
      renderCreditAtmosphere(frame.atmosphere);
      const layout = openingCreditLayout({ cols, rows, frame });
      for (const entry of layout.entries) {
        if (entry.alpha <= 0.01 || !entry.text) continue;
        let cls = entry.cls;
        if (entry.key === 'creator' && entry.text.includes('SEBASTIAN')) cls = 'ui-primary';
        if (entry.key === 'sound' && entry.text !== 'SOUND DESIGN') cls = 'ui-primary';
        uiText(entry.x, entry.y, entry.text, cls, entry.alpha);
      }
    },
  };

  return scene;
}
