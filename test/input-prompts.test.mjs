import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  activeInputPromptDevice,
  formatBindingTip,
  inputPrompt,
  promptLine,
  setActiveInputDevice,
} from '../src/game/bindings.js';

test('input prompts swap between keyboard and active controller labels', () => {
  setActiveInputDevice('keyboard', { viable: false });
  assert.equal(activeInputPromptDevice(), 'keyboard');
  assert.equal(inputPrompt('allow'), '[Y]');
  assert.equal(promptLine([{ action: 'allow', label: 'ALLOW' }, { action: 'deny', label: 'DENY' }]), '[Y] ALLOW · [N] DENY');
  assert.equal(formatBindingTip('Hold {quiet}.'), 'Hold SHIFT.');

  setActiveInputDevice('controller', { viable: true, controllerFamily: 'xbox' });
  assert.equal(activeInputPromptDevice(), 'controller');
  assert.equal(inputPrompt('allow'), '[A]');
  assert.equal(inputPrompt('deny'), '[B]');
  assert.equal(promptLine([{ action: 'allow', label: 'ALLOW' }, { action: 'deny', label: 'DENY' }]), '[A] ALLOW · [B] DENY');
  assert.equal(formatBindingTip('Hold {quiet}.'), 'Hold LB.');

  setActiveInputDevice('keyboard');
  assert.equal(inputPrompt('allow'), '[Y]');
});

test('omnibus profile discloses microphone handling before the on/off choice', () => {
  const source = readFileSync('src/game/warning.js', 'utf8');
  const disclosureAt = source.indexOf('Room-microphone loudness during declared authored moments');
  const privacyAt = source.indexOf('Raw audio is never stored.');
  const choiceAt = source.indexOf('Choose PROFILE ON or PROFILE OFF.');
  assert.ok(disclosureAt >= 0, 'missing microphone disclosure');
  assert.ok(privacyAt >= 0, 'missing raw-audio assurance');
  assert.ok(choiceAt > privacyAt && privacyAt > disclosureAt, 'disclosure and assurance must precede the choice');
  assert.doesNotMatch(source, /\[Y\s*\/\s*A\]/);
});

test('input settings expose microphone source and test rows', () => {
  const source = readFileSync('src/game/settings.js', 'utf8');
  for (const label of ['MIC INPUT', 'MIC CHANNEL', 'TEST MIC', 'RESCAN INPUTS']) {
    assert.ok(source.includes(label), `missing ${label}`);
  }
});
