import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OPENING_CREDITS_DURATION,
  makeOpeningCreditsScene,
  openingCreditsArePresentable,
  openingCreditFrame,
  openingCreditLayout,
} from '../src/game/opening-credits.js';

test('opening credits use three fixed fade slates with deliberate black beats', () => {
  const creator = openingCreditFrame(2);
  const blackOne = openingCreditFrame(6.8);
  const sound = openingCreditFrame(9);
  const blackTwo = openingCreditFrame(13.2);
  const quote = openingCreditFrame(17);

  assert.equal(OPENING_CREDITS_DURATION, 22);
  assert.equal(creator.title, undefined);
  for (const frame of [blackOne, blackTwo]) {
    assert.ok(['creator', 'sound', 'quote', 'attribution'].every((key) => frame[key] <= 0.05));
  }
  assert.ok(creator.creator > 0.9 && creator.sound === 0);
  assert.ok(sound.sound > 0.9 && sound.quote === 0);
  assert.ok(quote.quote > 0.9 && quote.attribution > 0.9);
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

test('opening credits are authored, blocking, and not key-skippable', () => {
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

test('opening credits only spend their authored clock while visible and focused', () => {
  let presentable = false;
  let completed = 0;
  const scene = makeOpeningCreditsScene({
    duration: 1,
    isPresentable: () => presentable,
    onDone: () => { completed += 1; },
  });

  scene.update(30);
  assert.equal(scene.view().time, 0);
  assert.equal(completed, 0);

  presentable = true;
  scene.update(0.75);
  assert.equal(completed, 0);
  presentable = false;
  scene.update(30);
  assert.equal(scene.view().time, 0.75);
  assert.equal(completed, 0);

  presentable = true;
  scene.update(0.25);
  assert.equal(completed, 1);
});

test('opening credit presentation rejects hidden and unfocused documents', () => {
  assert.equal(openingCreditsArePresentable({ visibilityState: 'hidden', hasFocus: () => true }), false);
  assert.equal(openingCreditsArePresentable({ visibilityState: 'visible', hasFocus: () => false }), false);
  assert.equal(openingCreditsArePresentable({ visibilityState: 'visible', hasFocus: () => true }), true);
});

test('normal app boot always places credits before the title menu', () => {
  const source = readFileSync('src/main.js', 'utf8');
  const calibration = source.indexOf('scenes.push(makeLensCalibrationScene');
  const credits = source.indexOf('scenes.push(makeOpeningCreditsScene({onDone:afterCredits}))');
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
