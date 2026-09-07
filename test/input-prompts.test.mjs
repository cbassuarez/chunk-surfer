import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  activeInputPromptDevice,
  formatBindingTip,
  inputPrompt,
  isRadioControlEvent,
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

test('the dedicated radio has an authored V keycap and accepts only its own fresh action',()=>{
  assert.equal(inputPrompt('radio',{device:'keyboard'}),'[V]');
  assert.equal(inputPrompt('radio',{device:'controller',family:'xbox'}),'[RB]');
  assert.equal(inputPrompt('radio',{device:'controller',family:'playstation'}),'[R1]');
  for(const event of [{key:'v'},{key:'V'},{code:'KeyV'},{controller:true,controllerAction:'radio'}])assert.equal(isRadioControlEvent(event),true);
  for(const event of [{key:'r'},{key:'v',repeat:true},{key:'v',metaKey:true},{code:'KeyV',ctrlKey:true},{key:'v',altKey:true},{key:'V',shiftKey:true},{key:'v',controllerAction:'tabNext'}])assert.equal(isRadioControlEvent(event),false);
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
