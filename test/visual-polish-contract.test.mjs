import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { machinePanelBody } from '../src/render/presentation.js';

const canvasSource = readFileSync('src/render/canvas.js', 'utf8');
const fearSource = readFileSync('src/game/fear-overlay.js', 'utf8');
const shaderSource = readFileSync('src/render/r3d.js', 'utf8');

test('machine panel hardware leaves the authored body rectangle unchanged', () => {
  assert.deepEqual(machinePanelBody(10, 4, 40, 18), { x: 13, y: 8, w: 34, h: 13 });
  assert.deepEqual(machinePanelBody(10, 4, 40, 18, { footer: 'SELECT' }), { x: 13, y: 8, w: 34, h: 12 });
});

test('screen-body polish is resize-baked and ordered below contact flash', () => {
  assert.match(canvasSource, /createGlassPass\(\{ width: canvas\.width, height: canvas\.height/);
  assert.ok(canvasSource.indexOf('drawGlassPass(ctx') < canvasSource.indexOf("if (now < fxState.flashUntil)"));
  assert.doesNotMatch(readFileSync('src/render/glass-pass.js', 'utf8'), /createImageData|putImageData/);
});

test('fear polish stays peripheral and preserves the existing frame contract', () => {
  assert.match(fearSource, /drawPeripheralPrickle/);
  assert.match(fearSource, /drawColdFlecks/);
  assert.match(fearSource, /drawPulseCorners/);
  assert.match(fearSource, /if \(!visualEffectsEnabled\(\)\) return frame/);
});

test('torch optical polish remains cone-local and adds no fog or HUSH figure', () => {
  assert.match(shaderSource, /mote.*smoothstep\(\.22,\.82,beam\)/s);
  assert.match(shaderSource, /rimMask.*uOpticalEffects/);
  assert.match(shaderSource, /pulledChurn/);
  assert.match(shaderSource, /No exploration fog and no distance haze/);
  assert.doesNotMatch(shaderSource, /drawHushFigure|hushSprite|hushSilhouette/);
});
