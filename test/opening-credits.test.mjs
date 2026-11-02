import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uiInit } from '../src/render/ui.js';
import {
  OPENING_CREDITS_DURATION,
  OPENING_CREDIT_GROUPS,
  makeOpeningCreditsScene,
  openingCreditFrame,
  openingCreditLayout,
  openingCreditSignalGroups,
} from '../src/game/opening-credits.js';

test('opening credits use three fixed fade slates with deliberate black beats', () => {
  const creator = openingCreditFrame(2);
  const blackOne = openingCreditFrame(6.8);
  const sound = openingCreditFrame(9);
  const blackTwo = openingCreditFrame(13.2);
  const quote = openingCreditFrame(17);

  assert.equal(OPENING_CREDITS_DURATION, 23.5);
  assert.equal(creator.title, undefined);
  for (const frame of [blackOne, blackTwo]) {
    assert.ok(['creator', 'sound', 'quote', 'attribution'].every((key) => frame[key] <= 0.05));
  }
  assert.ok(creator.creator > 0.9 && creator.sound === 0);
  assert.ok(sound.sound > 0.9 && sound.quote === 0);
  assert.ok(quote.quote > 0.9 && quote.attribution > 0.9);
  const extendedQuote = openingCreditFrame(22.25);
  assert.ok(extendedQuote.quote > 0.9 && extendedQuote.attribution > 0.9);
});

test('opening credit atmosphere is soft and text coordinates never drift', () => {
  const frame = openingCreditFrame(12);
  assert.equal(frame.duration, OPENING_CREDITS_DURATION);
  assert.equal(frame.activeBeat, 'sound');
  assert.ok(frame.atmosphere.exposure > 0);
  assert.ok(frame.atmosphere.bloom > 0);
  assert.ok(frame.atmosphere.grain > 0);
  assert.ok(Number.isFinite(frame.atmosphere.vignette));
  assert.equal(frame.beats, undefined);

  const first = openingCreditLayout({ cols: 80, rows: 30, frame: openingCreditFrame(11.5) });
  const second = openingCreditLayout({ cols: 80, rows: 30, frame: openingCreditFrame(12.5) });
  assert.deepEqual(
    first.entries.map(({ key, text, x, y }) => ({ key, text, x, y })),
    second.entries.map(({ key, text, x, y }) => ({ key, text, x, y })),
  );
  const source = readFileSync('src/game/opening-credits.js', 'utf8');
  assert.doesNotMatch(source, /xOffset|yOffset|\bdrift\s*\(/);
  assert.doesNotMatch(source, /cinematicConservatory/);
  assert.doesNotMatch(source, /CHUNK SURFER|drawVfdText/);
});

test('opening credits remain authored, blocking and key-locked on a first boot', () => {
  let completed = 0;
  const scene = makeOpeningCreditsScene({
    duration: OPENING_CREDITS_DURATION,
    onDone: () => { completed += 1; },
  });
  assert.equal(scene.id, 'opening-credits');
  assert.equal(scene.blocksInput, true);
  assert.equal(scene.blocksWorld, true);
  assert.equal(scene.key({ key: 'Enter' }), true);
  assert.equal(scene.view().skippable, false);
  scene.update(OPENING_CREDITS_DURATION - 0.01);
  assert.equal(completed, 0);
  scene.update(0.01);
  assert.equal(completed, 1);
  scene.update(1);
  assert.equal(completed, 1);
});

test('Unheard Track keeps all exact copy in three fixed semantic VFD groups with independent attribution timing', () => {
  assert.deepEqual(OPENING_CREDIT_GROUPS.creator, { label: 'A GAME BY', names: ['SEBASTIAN SUAREZ-SOLIS'], year: '2026' });
  assert.deepEqual(OPENING_CREDIT_GROUPS.sound, { label: 'SOUND DESIGN', names: ['SEBASTIAN SUAREZ-SOLIS', 'PAUL YORKE'] });
  const frame = openingCreditFrame(14.8), groups = openingCreditSignalGroups(frame);
  assert.deepEqual(groups.map(group => group.id), ['creator', 'sound', 'quote']);
  assert.deepEqual(groups[2].lines, [
    '...might not the glory of the machines consist',
    'in their being without this same boasted gift',
    'of language?', '',
    "'Silence,' it has been said by one writer,",
    "'is a virtue which renders us agreeable",
    "to our fellow-creatures.'",
  ]);
  assert.deepEqual(groups[2].attribution, ['SAMUEL BUTLER · EREWHON', 'THE BOOK OF THE MACHINES']);
  assert.equal(groups[2].kind, 'quote');
  assert.equal(groups[2].alpha, 1); assert.equal(groups[2].attributionAlpha, 0);
  assert.equal(openingCreditSignalGroups(openingCreditFrame(17))[2].attributionAlpha, 1);
});

test('actual opening render paints the controlled ground before the shared final VFD slates on every state', () => {
  let now = 0; const drawn = [];
  const scene = makeOpeningCreditsScene({ now: () => now, skipUnlocked: true,
    renderGround: value => drawn.push({ type: 'ground', value }),
    renderSignal: value => drawn.push({ type: 'signal', value }),
    renderText: (text, x, y, options) => drawn.push({ type: 'footer', text, x, y, options }),
  });
  let prior = 0;
  for (const [time, expected] of [[2, 'creator'], [6.8, null], [9, 'sound'], [13.2, null], [17, 'quote']]) {
    now = time; scene.update(time - prior); prior = time; drawn.length = 0; scene.render();
    assert.deepEqual(drawn[0], { type: 'ground', value: { resolve: 0 } }, 'remembered bright world cannot supply the credit backdrop');
    const signals = drawn.filter(item => item.type === 'signal');
    assert.deepEqual(signals.map(item => item.value.id), expected ? [expected] : []);
    for (const item of signals) {
      assert.equal(item.value.background, false); assert.equal(item.value.readingPlane, true);
      assert.equal(item.value.time, time);
    }
    assert.ok(drawn.filter(item => item.type === 'footer').every(item => item.options.fontPx === 12));
  }
});

test('opening credits spend real elapsed time when background frames are throttled', () => {
  let now = 100;
  let completed = 0;
  const scene = makeOpeningCreditsScene({
    duration: 2,
    now: () => now,
    onDone: () => { completed += 1; },
  });

  scene.update(0.25);
  assert.equal(scene.view().time, 0.25);
  assert.equal(completed, 0);

  now += 1.5;
  scene.update(0.05);
  assert.equal(scene.view().time, 1.75);
  assert.equal(completed, 0);

  now += 0.25;
  scene.update(0.01);
  assert.equal(completed, 1);
});

test('opening credits have no document focus or visibility gate', () => {
  const source = readFileSync('src/game/opening-credits.js', 'utf8');
  assert.doesNotMatch(source, /hasFocus|visibilityState|isPresentable/);
});

test('normal app boot always places credits before the title menu', () => {
  const source = readFileSync('src/main.js', 'utf8');
  const calibration = source.indexOf('scenes.push(makeLensCalibrationScene');
  // The push takes an options object now (the weather bed comes in through it),
  // so anchor on the call and its callback rather than on one exact line.
  const credits = source.indexOf('scenes.push(makeOpeningCreditsScene({');
  // Anchored on the HANDOFF, not on one spelling of it. `onDone:afterCredits`
  // became a wrapper the moment the credits started recording their own first
  // completion, and asserting the literal made a legitimate change look like a
  // regression. What must stay true is that the credits scene is what calls
  // afterCredits — not how the callback is spelled.
  const creditsBlock = source.slice(credits, source.indexOf('\n  }', credits));
  assert.match(creditsBlock, /onDone\s*:/, 'the credits scene still takes a completion callback');
  assert.match(creditsBlock, /afterCredits\(/, 'and that callback still hands off to the title');
  const title = source.indexOf('makeTitle({wantFullscreen})');
  assert.ok(calibration >= 0 && credits >= 0 && title >= 0);
  assert.ok(calibration > credits, 'calibration push is authored after the deferred credit callback declaration');
  assert.match(source, /onReady:afterCalibration/);
  assert.doesNotMatch(source, /skipcredits/);
});

test('opening credit layout keeps narrow and wide frames inside the viewport', () => {
  for (const size of [{ cols: 34, rows: 18 }, { cols: 132, rows: 54 }]) {
    const frame = openingCreditFrame(18.5);
    const layout = openingCreditLayout({ ...size, frame });
    assert.ok(layout.quoteBand.width <= size.cols - 2);
    assert.equal(layout.title, undefined);
    assert.ok(layout.entries.length > 0);
    for (const entry of layout.entries) {
      assert.ok(entry.x >= 0, `${size.cols} col entry starts before viewport`);
      assert.ok(entry.y >= 0 && entry.y < size.rows, `${size.rows} row entry outside viewport`);
      assert.ok(entry.x + entry.text.length <= size.cols, `${entry.text} overflows ${size.cols} cols`);
    }
  }
});

test('the actual shared opening ground overwrites the full bright remembered backing canvas opaquely', () => {
  const previous = { document: globalThis.document, window: globalThis.window, getComputedStyle: globalThis.getComputedStyle };
  const fills = [], stack = [];
  const canvas = { width: 0, height: 0, style: {} };
  const context = { canvas, globalAlpha: .2, globalCompositeOperation: 'lighter', fillStyle: '#ffffff',
    save() { stack.push({ globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation, fillStyle: this.fillStyle }); },
    restore() { Object.assign(this, stack.pop()); },
    fillRect(x, y, w, h) { fills.push({ x, y, w, h, alpha: this.globalAlpha, operation: this.globalCompositeOperation, color: this.fillStyle }); },
  };
  canvas.getContext = () => context;
  globalThis.document = { createElement: () => canvas };
  globalThis.window = { devicePixelRatio: 2, addEventListener() {} };
  globalThis.getComputedStyle = () => ({ position: 'relative' });
  try {
    uiInit({ clientWidth: 1280, clientHeight: 800, style: {}, appendChild() {} });
    let now = 0, prior = 0;
    const scene = makeOpeningCreditsScene({ now: () => now, renderSignal() {}, renderText() {} });
    for (const time of [0, 2, 6.8, 9, 13.2, 17, 23.3]) {
      now = time; scene.update(time - prior); prior = time; fills.length = 0;
      // Preserve a hostile inherited alpha/composite state before every paint.
      context.globalAlpha = .2; context.globalCompositeOperation = 'lighter'; context.fillStyle = '#ffffff';
      scene.render();
      assert.deepEqual(fills[0], { x: 0, y: 0, w: 2560, h: 1600, alpha: 1, operation: 'source-over', color: 'rgb(3,6,8)' });
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
