import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settings = readFileSync('src/game/settings.js', 'utf8');
const systemStart = settings.indexOf("id: 'system'");
const systemEnd = settings.indexOf('],\n      },', systemStart);
const aboutBlock = settings.slice(systemStart, systemEnd);

test('system tab remains addressable but is presented as about', () => {
  assert.match(settings, /id:\s*'system'/);
  assert.match(settings, /name:\s*'ABOUT'/);
});

test('about tab contains player-facing support rows', () => {
  for (const id of [
    'about:version',
    'about:build',
    'about:website',
    'about:report',
    'about:copyright',
    'about:fps',
    'about:runtime',
    'about:copyReport',
    'about:exportSave',
    'about:restartAudio',
    'about:credits',
  ]) {
    assert.match(aboutBlock, new RegExp(id.replace(':', ':')));
  }
  assert.doesNotMatch(aboutBlock, /about:renderer/);
  assert.doesNotMatch(aboutBlock, /about:lens/);
});

test('about tab does not own display or input controls', () => {
  assert.doesNotMatch(aboutBlock, /FULLSCREEN/i);
  assert.doesNotMatch(aboutBlock, /GAME MODE/i);
  assert.doesNotMatch(aboutBlock, /FOCUS/i);
  assert.doesNotMatch(aboutBlock, /RESET DISPLAY SETTINGS/i);
  assert.doesNotMatch(aboutBlock, /RESET INPUT BINDINGS/i);
  assert.doesNotMatch(aboutBlock, /CONTROLLER DETECTED/i);
});

test('display and input own their reset actions', () => {
  assert.match(settings, /resetDisplaySettings/);
  assert.match(settings, /RESET DISPLAY SETTINGS/);
  assert.match(settings, /resetInputBindings/);
  assert.match(settings, /RESET CONTROLLER/);
  assert.match(settings, /CONFIGURE CONTROLLER/);
  assert.match(settings, /LOOK SENSITIVITY/);
});

test('settings renderer supports non-selectable section rows', () => {
  assert.match(settings, /kind:\s*'section'/);
  assert.match(settings, /selectable:\s*false/);
  assert.match(settings, /isSelectable/);
});
