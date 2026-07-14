import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OPENING_CREDITS_DURATION,
  makeOpeningCreditsScene,
  openingCreditsArePresentable,
  openingCreditFrame,
} from '../src/game/opening-credits.js';

test('opening credits use four separate fade slates with black beats', () => {
  const title = openingCreditFrame(2);
  const black = openingCreditFrame(4.4);
  const creator = openingCreditFrame(6);
  const sound = openingCreditFrame(10);
  const quote = openingCreditFrame(15);

  assert.ok(title.title > 0.9 && title.creator === 0);
  assert.ok(Object.values(black).filter((value) => typeof value === 'number' && value > 0.05).length <= 2);
  assert.ok(creator.creator > 0.9 && creator.sound === 0);
  assert.ok(sound.sound > 0.9 && sound.quote === 0);
  assert.ok(quote.quote > 0.9 && quote.attribution > 0.9);
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
