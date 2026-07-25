import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { inputGlyph, promptPartsWidth } from '../src/render/prompt-glyphs.js';
import {
  inputPrompt,
  resetControllerSettings,
  setActiveInputDevice,
  setControllerBinding,
} from '../src/game/bindings.js';
import { STORY_AUDIO, STORY_GAIN_BASELINES } from '../src/audio/story-audio.js';

test('a keyboard prompt is text and nothing is drawn', () => {
  setActiveInputDevice('keyboard');
  const glyph = inputGlyph('confirm');
  assert.equal(glyph.device, 'keyboard');
  assert.equal(glyph.buttonId, null, 'no button to draw without a pad');
  assert.equal(glyph.text, inputPrompt('confirm'), 'the text prompt is unchanged');
  assert.equal(glyph.cells, glyph.text.length);
});

test('a pad prompt resolves to the button under the thumb', () => {
  resetControllerSettings();
  setActiveInputDevice('controller', { controllerFamily: 'nintendo', viable: true });
  // Position, not letter: the bottom button confirms, and Nintendo prints B on
  // it. A glyph that followed the letter would point at the wrong plastic.
  assert.equal(inputGlyph('confirm').buttonId, 'south');
  assert.equal(inputGlyph('back').buttonId, 'east');
  assert.equal(inputGlyph('confirm').text, '[B]');
  setActiveInputDevice('keyboard');
});

test('prompt aliases resolve to the same button their label names', () => {
  resetControllerSettings();
  setActiveInputDevice('controller', { controllerFamily: 'xbox', viable: true });
  // 'continue', 'start' and 'read' are not bindable actions — they are names
  // scenes ask for. The label and the glyph must agree about which button.
  for (const alias of ['continue', 'allow', 'start', 'read']) {
    assert.equal(inputGlyph(alias).buttonId, inputGlyph('confirm').buttonId, alias);
    assert.equal(inputPrompt(alias), inputPrompt('confirm'), alias);
  }
  assert.equal(inputGlyph('deny').buttonId, inputGlyph('back').buttonId);
  setActiveInputDevice('keyboard');
});

test('an alias follows a remap instead of the old default', () => {
  resetControllerSettings();
  setActiveInputDevice('controller', { controllerFamily: 'xbox', viable: true });
  setControllerBinding('confirm', 'north');
  assert.equal(inputGlyph('start').buttonId, 'north', 'the alias tracks the rebound button');
  resetControllerSettings();
  setActiveInputDevice('keyboard');
});

test('composite prompts stay as words', () => {
  resetControllerSettings();
  setActiveInputDevice('controller', { controllerFamily: 'xbox', viable: true });
  // Half a two-part answer drawn as one button would be worse than the words.
  for (const action of ['move', 'look', 'select', 'set']) {
    assert.equal(inputGlyph(action).buttonId, null, action);
    assert.ok(inputGlyph(action).text.length > 3, action);
  }
  setActiveInputDevice('keyboard');
});

test('a prompt line can be measured before it is drawn', () => {
  setActiveInputDevice('keyboard');
  const parts = [{ action: 'confirm', label: 'REMAP' }, { action: 'back', label: 'BACK' }];
  const keyboard = promptPartsWidth(parts);
  assert.ok(keyboard > 0);
  setActiveInputDevice('controller', { controllerFamily: 'xbox', viable: true });
  const pad = promptPartsWidth(parts);
  // A drawn glyph is a fixed width, so the two devices measure differently and
  // any right-aligned or centred line must ask rather than assume.
  assert.ok(Number.isFinite(pad) && pad > 0);
  setActiveInputDevice('keyboard');
});

test('the credits roll has its own bed, shipped and louder than the title', () => {
  assert.ok(STORY_AUDIO.credits, 'the credits track is registered');
  assert.ok(
    existsSync('public/audio/game/credits_song.mp3'),
    'the credits audio is actually in the build',
  );
  // Nothing competes with it during the roll — no dialogue, no foley, no room
  // tone — so it sits above the title bed rather than at bed level.
  assert.ok(STORY_GAIN_BASELINES.credits > STORY_GAIN_BASELINES.title);
});
