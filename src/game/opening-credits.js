import * as scenes from './scenes.js';
import { uiFill, uiSize, uiText } from '../render/ui.js';
import { UI_COLOR } from '../render/palette.js';

export const OPENING_CREDITS_DURATION = 18;

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

export function openingCreditFrame(time, duration = OPENING_CREDITS_DURATION) {
  const scale = Math.max(0.01, Number(duration) || OPENING_CREDITS_DURATION) / OPENING_CREDITS_DURATION;
  const t = Math.max(0, Number(time) || 0) / scale;
  return {
    time: Math.max(0, Number(time) || 0),
    duration,
    title: fadeWindow(t, 0.45, 1.55, 3.25, 4.25),
    creator: fadeWindow(t, 4.55, 5.45, 7.35, 8.25),
    sound: fadeWindow(t, 8.55, 9.45, 11.35, 12.25),
    quote: fadeWindow(t, 12.55, 13.45, 16.75, 17.75),
    attribution: fadeWindow(t, 13.85, 14.55, 16.75, 17.75),
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

  const quote = [
    '...might not the glory of the machines consist',
    'in their being without this same boasted gift',
    'of language?',
    '',
    "'Silence,' it has been said by one writer,",
    "'is a virtue which renders us agreeable",
    "to our fellow-creatures.'",
  ];

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
      const center = (text) => Math.max(1, Math.floor((cols - String(text).length) / 2));
      const middle = Math.floor(rows / 2);

      uiFill(0, 0, cols, rows, UI_COLOR.glass);

      uiText(center('CHUNK SURFER'), middle, 'CHUNK SURFER', 'ui-amber', frame.title);

      uiText(center('A GAME BY'), middle - 2, 'A GAME BY', 'ui-secondary', frame.creator);
      uiText(center('SEBASTIAN SUAREZ SOLIS'), middle, 'SEBASTIAN SUAREZ SOLIS', 'ui-primary', frame.creator);
      uiText(center('2026'), middle + 2, '2026', 'ui-secondary', frame.creator);

      uiText(center('SOUND DESIGN'), middle - 2, 'SOUND DESIGN', 'ui-secondary', frame.sound);
      uiText(center('SEBASTIAN SUAREZ-SOLIS'), middle, 'SEBASTIAN SUAREZ-SOLIS', 'ui-primary', frame.sound);
      uiText(center('PAUL YORKE'), middle + 2, 'PAUL YORKE', 'ui-primary', frame.sound);

      const quoteY = Math.max(2, middle - 6);
      quote.forEach((line, index) => {
        uiText(center(line), quoteY + index, line, 'ui-secondary', frame.quote);
      });
      uiText(center('SAMUEL BUTLER · EREWHON'), quoteY + 9, 'SAMUEL BUTLER · EREWHON', 'ui-amber', frame.attribution);
      uiText(center('THE BOOK OF THE MACHINES'), quoteY + 10, 'THE BOOK OF THE MACHINES', 'ui-amber', frame.attribution);
    },
  };

  return scene;
}
