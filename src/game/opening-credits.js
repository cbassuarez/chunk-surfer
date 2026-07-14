import * as scenes from './scenes.js';
import { uiSize, uiText, uiWrap } from '../render/ui.js';
import { cinematicConservatoryFrame, renderCinematicConservatory } from './cinematic-conservatory.js';

export const OPENING_CREDITS_DURATION = 22;

const AUTHORED_DURATION = 22;
const QUOTE_LINES = Object.freeze([
  '...might not the glory of the machines consist',
  'in their being without this same boasted gift',
  'of language?',
  '',
  "'Silence,' it has been said by one writer,",
  "'is a virtue which renders us agreeable",
  "to our fellow-creatures.'",
]);

// A native window can be alive and rendering behind another application for
// the whole authored opening. Do not spend that time until the player can
// actually see it; otherwise a slow calibration followed by an unfocused
// launch appears to jump directly to the title menu.
export function openingCreditsArePresentable(doc = globalThis.document) {
  if (!doc) return true;
  if (doc.visibilityState === 'hidden' || doc.hidden === true) return false;
  return typeof doc.hasFocus !== 'function' || doc.hasFocus();
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

function drift(t, phase, strength = 1) {
  return Math.sin(t * 0.58 + phase) * strength;
}

function beat(alpha, t, phase, yBias = 0) {
  return {
    alpha,
    xOffset: drift(t, phase, 0.34) * alpha,
    yOffset: yBias + drift(t, phase + 1.7, 0.18) * alpha,
    drift: drift(t, phase + 0.6, 1) * alpha,
  };
}

export function openingCreditFrame(time, duration = OPENING_CREDITS_DURATION) {
  const scale = Math.max(0.01, Number(duration) || OPENING_CREDITS_DURATION) / AUTHORED_DURATION;
  const t = Math.max(0, Number(time) || 0) / scale;
  const title = fadeWindow(t, 0.70, 1.85, 4.15, 5.20);
  const creator = fadeWindow(t, 5.35, 6.30, 9.45, 10.45);
  const sound = fadeWindow(t, 10.35, 11.25, 14.00, 15.00);
  const quote = fadeWindow(t, 15.00, 16.10, 21.00, 21.85);
  const attribution = fadeWindow(t, 16.45, 17.25, 21.00, 21.85);
  const beats = { title, creator, sound, quote, attribution };
  const activeBeat = Object.entries(beats).reduce(
    (best, [key, alpha]) => (alpha > best.alpha ? { key, alpha } : best),
    { key: 'black', alpha: 0.05 },
  ).key;
  const reveal = smooth((t - 0.35) / 2.2) * (1 - smooth((t - AUTHORED_DURATION + 0.6) / 0.6));
  return {
    time: Math.max(0, Number(time) || 0),
    duration,
    activeBeat,
    title,
    creator,
    sound,
    quote,
    attribution,
    beats: {
      title: beat(title, t, 0.1, -0.08),
      creator: beat(creator, t, 1.8, 0),
      sound: beat(sound, t, 2.9, 0.04),
      quote: beat(quote, t, 4.1, 0.08),
      attribution: beat(attribution, t, 4.8, 0.08),
    },
    cinematic: cinematicConservatoryFrame(t, {
      duration: AUTHORED_DURATION,
      intensity: 0.82,
      reveal,
      variant: 'opening',
    }),
    layers: {
      scene: { alpha: reveal },
      light: { alpha: 0.18 + 0.20 * reveal, x: 0.46 + drift(t, 0.4, 0.02), y: 0.39 + drift(t, 1.1, 0.01) },
      grain: { alpha: 0.07 + 0.05 * reveal },
      fog: { alpha: 0.24 + 0.16 * reveal },
    },
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

function centeredEntry(text, y, cls, alpha, cols, key, dx = 0) {
  const line = fitLine(text, Math.max(1, cols - 2));
  const x = clamp(Math.round((cols - line.length) / 2 + dx), 0, Math.max(0, cols - line.length));
  return { key, text: line, x, y: Math.round(y), cls, alpha };
}

function stackedCentered(texts, startY, gap, cls, alpha, cols, key, dx = 0) {
  return texts.flatMap((text, index) => wrappedLines(text, Math.max(18, cols - 4)).map((line, wrapIndex) => (
    centeredEntry(line, startY + index * gap + wrapIndex, cls, alpha, cols, key, dx)
  )));
}

export function openingCreditLayout({ cols = 80, rows = 30, frame = openingCreditFrame(0) } = {}) {
  const c = Math.max(20, Math.floor(cols));
  const r = Math.max(8, Math.floor(rows));
  const middle = Math.floor(r / 2);
  const small = r < 22;
  const creditGap = small ? 1 : 2;
  const titleY = clamp(Math.round(r * 0.44 + frame.beats.title.yOffset), 1, r - 2);
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
    Math.round(middle - quoteBlock.length / 2 + frame.beats.quote.yOffset),
    1,
    Math.max(1, r - quoteBlock.length - 1),
  );
  const entries = [
    centeredEntry('CHUNK SURFER', titleY, 'ui-amber', frame.title, c, 'title', frame.beats.title.xOffset),
    ...stackedCentered(['A GAME BY', 'SEBASTIAN SUAREZ SOLIS', '2026'], creditY, creditGap, 'ui-secondary', frame.creator, c, 'creator', frame.beats.creator.xOffset),
    ...stackedCentered(['SOUND DESIGN', 'SEBASTIAN SUAREZ-SOLIS', 'PAUL YORKE'], creditY, creditGap, 'ui-secondary', frame.sound, c, 'sound', frame.beats.sound.xOffset),
  ];
  quoteBlock.forEach((line, index) => {
    const cls = index >= quote.length + 1 ? 'ui-amber' : 'ui-secondary';
    const alpha = index >= quote.length + 1 ? frame.attribution : frame.quote;
    entries.push(centeredEntry(line, quoteStart + index, cls, alpha, c, cls === 'ui-amber' ? 'attribution' : 'quote', frame.beats.quote.xOffset));
  });
  return {
    cols: c,
    rows: r,
    titleBand: { y: titleY },
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
  isPresentable = openingCreditsArePresentable,
} = {}) {
  let time = 0;
  let done = false;
  let scene = null;

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

    enter() { document.body.classList.add('opening-credits-screen'); },
    exit() { document.body.classList.remove('opening-credits-screen'); },
    update(dt) {
      if (!isPresentable()) return;
      time += Math.max(0, Number(dt) || 0);
      if (time >= duration) finish();
    },
    key() { return true; },
    view() { return { ...openingCreditFrame(time, duration), skippable: false }; },

    render() {
      const { cols, rows } = uiSize();
      const frame = openingCreditFrame(time, duration);
      renderCinematicConservatory(frame.cinematic);
      const layout = openingCreditLayout({ cols, rows, frame });
      for (const entry of layout.entries) {
        if (entry.alpha <= 0.01 || !entry.text) continue;
        let cls = entry.cls;
        if (entry.key === 'creator' && entry.text.includes('SEBASTIAN')) cls = 'ui-primary';
        if (entry.key === 'sound' && !['SOUND DESIGN'].includes(entry.text)) cls = 'ui-primary';
        uiText(entry.x, entry.y, entry.text, cls, entry.alpha);
      }
    },
  };

  return scene;
}
