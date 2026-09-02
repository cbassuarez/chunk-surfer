import * as scenes from './scenes.js';
import { uiFill, uiSize, uiText, uiWrap } from '../render/ui.js';
import { createHitRegions } from '../render/hit-regions.js';
import { creditAtmosphereFrame } from './credit-visual.js';
import { attachBootWeatherAudio, bootWeather, bootWeatherAudio, bootWeatherOpeningEnvelope, drainBootThunder, renderBootWeather, stepBootWeather } from './boot-weather.js';

export const OPENING_CREDITS_DURATION = 23.5;
export const OPENING_CREDITS_SKIP_CONFIRM_SECONDS = 0.45;
export const OPENING_CREDITS_SKIP_GUARD_SECONDS = 0.12;

const SKIP_IDLE_LABEL = 'SKIP  ▶▶';
const SKIP_ARMED_LABEL = 'CLICK AGAIN  ▶▶';
const SKIP_COMMITTED_LABEL = '▶▶';
const SKIP_HINT_LABEL = 'DOUBLE CLICK';

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

// WHEN THE WEATHER IS IN THE ROOM.
//
// It comes up on the same ramp as the optical frame, stays sparse under the two
// credit slates so they read as slates, and thickens as the quote arrives — the
// quote is the thing it exists to be read through. At 20.40 the shared weather
// handoff begins tapering replenishment. Existing particles keep exactly the
// same motion and cross into CASE SELECT under their own momentum.
export const WEATHER_CLEAR_AT = 20.40;

// SPARSE IS NOT EMPTY. This band was 0.32 and the credits read as a still frame
// with something occasionally crossing it — the weather has to be established
// before the quote can thicken it, or the build has nothing to build ON.
const WEATHER_SPARSE = 0.60;

function weatherPresence(t) {
  if (t < 0.20) return 0;
  if (t < 1.90) return smooth((t - 0.20) / 1.70) * WEATHER_SPARSE;
  if (t < 13.60) return WEATHER_SPARSE;
  if (t < 15.60) return WEATHER_SPARSE + smooth((t - 13.60) / 2.00) * (1 - WEATHER_SPARSE);
  return 1;
}

// The bed thins with the field but does NOT reach zero before the cut. It is
// still going, quietly, when the menu's own hiss comes up over it — and the
// title then takes it the rest of the way out as the last particles settle.
// Ending it early would put a silence between the two beds, which is a seam
// you hear; ending it late is a dovetail, which is one you do not.
function weatherAudioPresence(t) {
  return weatherPresence(t) * (1 - smooth((t - WEATHER_CLEAR_AT) / 3.40) * 0.72);
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
    weather: {
      presence: weatherPresence(t),
      audio: weatherAudioPresence(t),
      clearing: t >= WEATHER_CLEAR_AT,
    },
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

export function openingCreditSkipLayout({ cols = 80, rows = 30, label = SKIP_IDLE_LABEL } = {}) {
  const c = Math.max(20, Math.floor(Number(cols) || 0));
  const r = Math.max(8, Math.floor(Number(rows) || 0));
  const text = fitLine(label, Math.max(1, c - 2));
  // Leave two cells of visual breathing room from the window edge, but make the
  // entire lower-right transport region clickable. The target never changes
  // size when the label changes from SKIP to CLICK AGAIN.
  const right = Math.max(0, c - 3);
  const y = Math.max(1, r - 2);
  const x = clamp(right - text.length + 1, 0, Math.max(0, c - text.length));
  const hitW = Math.min(c, 18);
  const hitH = Math.min(r, 3);
  return {
    cols: c,
    rows: r,
    text,
    x,
    y,
    right,
    hintY: Math.max(0, y - 1),
    hit: {
      x: c - hitW,
      y: r - hitH,
      w: hitW,
      h: hitH,
    },
  };
}

// This is part of app boot, not an optional credits page. It deliberately owns
// every key and ends only on its authored clock before the title menu is made.
export function makeOpeningCreditsScene({
  onDone,
  duration = OPENING_CREDITS_DURATION,
  now = wallClockSeconds,
  // Returns a started bed, or null if the audio context is not running yet.
  // On a first launch the EULA keypress has already unlocked it; on later
  // launches the EULA is skipped, so in a browser there may be no gesture
  // before this screen and the context comes up suspended. Retried for a few
  // seconds and then let go — silence is the honest fallback, not a bed that
  // slams in late.
  openAudio = null,
  skipUnlocked = false,
} = {}) {
  let time = 0;
  let done = false;
  let scene = null;
  let lastWallAt = Number(now()) || 0;
  let bedTries = 0;
  const hits = createHitRegions();
  let skipArmedAt = null;
  let skipCommittedAt = null;

  function wallNow() {
    const at = Number(now());
    return Number.isFinite(at) ? at : lastWallAt;
  }

  function skipIsArmed(at = wallNow()) {
    if (!skipUnlocked || skipArmedAt == null || skipCommittedAt != null) return false;
    const elapsed = Math.max(0, Number(at) - skipArmedAt);
    return elapsed <= OPENING_CREDITS_SKIP_CONFIRM_SECONDS;
  }

  function clearSkipArm() {
    skipArmedAt = null;
  }

  function pressSkip() {
    if (!skipUnlocked || done || skipCommittedAt != null) return;
    const at = wallNow();
    if (!skipIsArmed(at)) {
      skipArmedAt = at;
      return;
    }
    skipArmedAt = null;
    // Reset the wall-clock integration point at the gesture itself. Otherwise
    // the next update could count pre-click throttling time toward the guard and
    // remove the scene before a trailing third click has been swallowed.
    lastWallAt = at;
    skipCommittedAt = time;
  }

  function tryOpenAudio() {
    if (bootWeatherAudio() || typeof openAudio !== 'function' || bedTries > 8) return;
    bedTries += 1;
    try { attachBootWeatherAudio(openAudio() || null); } catch (_) { attachBootWeatherAudio(null); }
  }

  function finish(reason = 'completed') {
    if (done) return;
    done = true;
    scenes.remove(scene);
    onDone?.({ reason, elapsed: time });
  }

  scene = {
    id: 'opening-credits',
    blocksInput: true,
    blocksWorld: true,
    lookProfile: 'calm',

    enter() {
      lastWallAt = Number(now()) || lastWallAt;
      document.body.classList.add('opening-credits-screen');
      tryOpenAudio();
    },
    // The bed is deliberately NOT stopped here. It belongs to the launch and
    // goes out under the menu hiss on the other side of the cut (title.js).
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
      const advance = Math.max(Math.max(0, Number(dt) || 0), wallDelta);
      time += advance;
      const weather = bootWeather();
      if (weather) {
        const frame = openingCreditFrame(time, duration);
        const envelope = bootWeatherOpeningEnvelope(weather, frame.authoredTime, {
          presence: frame.weather.presence,
        });
        weather.presentationAlpha = envelope.alpha;
        weather.phase = envelope.phase;
        stepBootWeather(weather, advance, {
          targetCount: envelope.targetCount,
          stormActive: true,
        });
        // Resuming a suspended context is asynchronous, so the first attempt in
        // enter() can legitimately come back empty. Keep asking for a couple of
        // seconds, then stop asking.
        if (!bootWeatherAudio() && time < 2.5) tryOpenAudio();
        // The gust the bed rides is the gust the field is riding. Two
        // oscillators would put the sound a beat off the leaves.
        bootWeatherAudio()?.update?.({ presence: frame.weather.audio, wind: weather.wind });
        // AND THE STRIKES THAT FELL THIS STEP. Drained whether or not there is a
        // bed to play them on, because the queue is state and an undrained one
        // carries a stale clap into the next screen — which is the exact thing
        // drainBootThunder's own comment says it exists to prevent.
        const strikes = drainBootThunder(weather);
        const bed = bootWeatherAudio();
        if (bed) for (const event of strikes) bed.strike(event);
      }
      if (skipCommittedAt != null) {
        if (time - skipCommittedAt >= OPENING_CREDITS_SKIP_GUARD_SECONDS) finish('skipped');
        return;
      }
      if (time >= duration) finish('completed');
    },
    key() { return true; },
    pointer(e) {
      if (!skipUnlocked || done) return true;
      if (e?.type === 'pointermove') {
        hits.handle(e, { click: false });
        return true;
      }
      if (e?.type === 'pointerdown') {
        const result = hits.handle(e);
        if (!result.hit && skipCommittedAt == null) clearSkipArm();
        return true;
      }
      return true;
    },
    view() {
      return {
        ...openingCreditFrame(time, duration),
        skippable: !!skipUnlocked,
        skip: {
          unlocked: !!skipUnlocked,
          armed: skipIsArmed(),
          committed: skipCommittedAt != null,
        },
      };
    },

    render() {
      const { cols, rows } = uiSize();
      const frame = openingCreditFrame(time, duration);
      const layout = openingCreditLayout({ cols, rows, frame });
      const weather = bootWeather();
      if (weather) renderBootWeather(weather, { alpha: weather.presentationAlpha });
      for (const entry of layout.entries) {
        if (entry.alpha <= 0.01 || !entry.text) continue;
        let cls = entry.cls;
        if (entry.key === 'creator' && entry.text.includes('SEBASTIAN')) cls = 'ui-primary';
        if (entry.key === 'sound' && entry.text !== 'SOUND DESIGN') cls = 'ui-primary';
        uiText(entry.x, entry.y, entry.text, cls, entry.alpha);
      }

      hits.reset();
      if (skipUnlocked) {
        const armed = skipIsArmed();
        const committed = skipCommittedAt != null;
        const hovered = hits.isHovered('opening-credits:skip');
        const label = committed
          ? SKIP_COMMITTED_LABEL
          : armed
            ? SKIP_ARMED_LABEL
            : SKIP_IDLE_LABEL;
        const skip = openingCreditSkipLayout({ cols, rows, label });

        hits.add({
          id: 'opening-credits:skip',
          kind: 'opening-credit-skip',
          ...skip.hit,
          label: 'skip opening credits',
          onClick: pressSkip,
        });

        if (!committed && hovered && !armed) {
          const hintX = clamp(
            skip.right - SKIP_HINT_LABEL.length + 1,
            0,
            Math.max(0, skip.cols - SKIP_HINT_LABEL.length),
          );
          uiFill(Math.max(0,hintX-1),Math.max(0,skip.hintY-.25),SKIP_HINT_LABEL.length+2,1.5,'rgba(3,4,6,.90)');
          uiText(hintX, skip.hintY, SKIP_HINT_LABEL, 'ui-primary', 1);
        }

        uiFill(Math.max(0,skip.x-1),Math.max(0,skip.y-.25),skip.text.length+2,1.5,'rgba(3,4,6,.92)');
        const cls=armed||committed?'ui-amber':'ui-primary';
        uiText(skip.x,skip.y,skip.text,cls,1);
      }
    },
  };

  return scene;
}
