import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LIGHT_GAIN, LIGHT_GAIN_STOPS, gainedRgb, gainedLightColors} from '../src/render/light-gain.js';

test('the lighting audit\'s chosen +1 stop doubles light', () => {
  assert.equal(LIGHT_GAIN_STOPS, 1);
  assert.equal(LIGHT_GAIN, 2);
});

test('gained copies scale strength only and leave the authored arrays alone', () => {
  const torch = [1, .94, .82];
  assert.deepEqual([...gainedRgb(torch)], [2, 1.88, 1.64].map(v => Math.fround(v)));
  assert.deepEqual(torch, [1, .94, .82]);
  const lamps = new Float32Array([1, .5, .25, 3, .2, .3, .4, 0]);
  const out = gainedLightColors(lamps);
  assert.deepEqual([...out], [1, .5, .25, 6, .2, .3, .4, 0].map(v => Math.fround(v)), 'colour kept, intensity doubled');
  assert.equal(lamps[3], 3, 'the caller\'s lamps are not modified');
  assert.equal(gainedLightColors(lamps, out), out, 'a matching scratch buffer is reused');
  assert.equal(gainedLightColors(null), null);
});

test('every upload of ambient, bounce, lamps and torch goes through the gain', () => {
  const r3d = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const props = readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
  for (const [name, source] of [['r3d.js', r3d], ['props3d.js', props]]) {
    for (const line of source.split('\n')) for (const call of line.split(';')) {
      if (/uniform1f\(\w+\('u(Ambient|Bounce)Intensity'\)/.test(call)) assert.match(call, /LIGHT_GAIN/, `${name}: ${call.trim().slice(0, 90)}`);
      if (/uniform3fv\(\w+\('uTorchColor'\)/.test(call)) assert.match(call, /gainedRgb\(/, `${name}: ${call.trim().slice(0, 90)}`);
      if (/uniform4fv\(\w+\('uLocalLightColor\[0\]'\)/.test(call)) assert.match(call, /gainedLightColors\(/, `${name}: ${call.trim().slice(0, 90)}`);
    }
  }
});
