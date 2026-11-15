// HANDS AND THE LIGHT (src/game/torch-hands.js). Seb, 2026-11-14: a torch needs
// a hand, the recorder up takes both, a headlamp kitted out at the van needs
// none, and there is no light on the recorder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  HANDHELD_TORCH_REST, HEADLAMP_LAMP, TORCH_HANDLING_NOISE, handheldTorchLamp, recorderRaiseCost, torchKind, torchReach,
} from '../src/game/torch-hands.js';
import { FIELD_KIT_OPTIONS, normalizeFieldKit } from '../src/game/field-kit.js';
import { WORKBENCH_VARIANTS, WORKBENCH_TRAYS, workbenchCatalog } from '../src/data/workbench-catalog.js';
import { vanKitModel } from '../src/data/van-kit-models.js';
import { recordistHandLighting } from '../src/render/battle-hands.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a handheld torch needs a free hand; a headlamp needs none', () => {
  assert.equal(torchKind({ flashlight: 'headlamp' }), 'headlamp');
  assert.equal(torchKind({ flashlight: 'throw' }), 'handheld');
  assert.deepEqual(torchReach({ kind: 'handheld', recorder: 'away' }), { action: 'on', noise: 'torch-click' });
  assert.equal(torchReach({ kind: 'handheld', recorder: 'raised', recording: true }).action, 'stow-recorder');
  assert.equal(torchReach({ kind: 'handheld', recorder: 'raised', recording: true }).noise, 'recorder-stow');
  assert.equal(torchReach({ kind: 'headlamp', recorder: 'raised', recording: true }).action, 'on', 'a headlamp needed a hand');
  assert.equal(torchReach({ kind: 'handheld', carrying: true }).action, 'refuse');
  assert.equal(torchReach({ kind: 'headlamp', carrying: true }).action, 'on');
  assert.equal(torchReach({ kind: 'handheld', lightOn: true, recorder: 'raised' }).action, 'off');
});

test('the machine coming up puts a burning handheld torch away, and only that', () => {
  assert.equal(recorderRaiseCost({ kind: 'handheld', lightOn: true }), 'torch-away');
  assert.equal(recorderRaiseCost({ kind: 'handheld', lightOn: false }), null);
  assert.equal(recorderRaiseCost({ kind: 'headlamp', lightOn: true }), null);
});

test('the mid-take handling is on the tape but does not ruin it by itself', () => {
  assert.ok(TORCH_HANDLING_NOISE['recorder-stow'] > TORCH_HANDLING_NOISE['torch-click']);
  assert.ok(TORCH_HANDLING_NOISE['recorder-stow'] < .18, 'the stow alone crosses ROOM_TONE.spoilNoise');
  const recordist = read('../src/game/recordist.js');
  assert.doesNotMatch(recordist, /spoil\('you reached for the light'/, 'reaching for the light still spoils outright');
});

test('the beam comes from the hand that holds it, or from the head', () => {
  const rest = handheldTorchLamp();
  assert.deepEqual(rest.origin, [...HANDHELD_TORCH_REST.origin]);
  assert.ok(rest.forward[2] < -.99 && rest.origin[0] > 0 && rest.origin[1] < 0, 'the handheld light is not low at the right, aimed ahead');
  const swung = handheldTorchLamp({ sway: [.02, .04, .03] });
  assert.ok(Math.abs(swung.forward[0] - rest.forward[0]) > .01, 'the walk does not swing the beam');
  assert.ok(HEADLAMP_LAMP.origin[1] > 0 && HEADLAMP_LAMP.forward[2] === -1);
});

test('the headlamp is kitted out at the van, in the lighting tray, with its own model', () => {
  assert.ok(FIELD_KIT_OPTIONS.flashlight.some((option) => option.id === 'headlamp'));
  assert.equal(normalizeFieldKit({ flashlight: 'headlamp' }).flashlight, 'headlamp');
  assert.ok(WORKBENCH_VARIANTS.flashlight.includes('headlamp'));
  const tray = WORKBENCH_TRAYS.find((entry) => entry.group === 'flashlight');
  const lights = workbenchCatalog({ fieldKit: {} }).filter((item) => item.group === 'flashlight');
  assert.equal(lights.length, 4);
  for (const item of lights) assert.ok(Math.abs(item.position[2] - tray.z) <= tray.d / 2, `${item.optionId} is off its tray`);
  assert.ok(vanKitModel('flashlight-headlamp'));
  for (const file of ['flashlight-headlamp.glb', 'flashlight-headlamp-192.webp', 'flashlight-headlamp-512.webp']) {
    assert.ok(existsSync(new URL(`../public/assets/items/${file}`, import.meta.url)), `${file} was never built`);
  }
});

test('there is no light on the recorder', () => {
  const rig = read('../src/render/recorder-rig.js'), main = read('../src/main.js');
  assert.doesNotMatch(rig, /buildBracket/, 'the bracket is still built onto the case');
  assert.match(rig, /torch\.removeFromParent\(\);/);
  assert.match(main, /function recorderTorchAttached\(\)\{return false;\}/);
  assert.match(main, /recorderLamp:!worldView\?playerLampFrame\(\):null,/);
  assert.match(main, /function toggleLiveTakeRecorder\(\)\{\n  \/\/ Back up into both hands mid-take: a handheld torch goes away first\.\n  if\(liveTakeRecorderIsLowered\)stowHandheldTorchForRecorder\(\);/);
});

test('the hand in the corner takes the world\'s exposure and its nearby lamps, and is never a black block', () => {
  const field = { torchPower: 0, ambientIntensity: .16, ambientColor: [1, .75, .49] };
  const bare = recordistHandLighting({ fieldCarry: true, fieldLight: field });
  const pub = recordistHandLighting({ fieldCarry: true, fieldLight: { ...field, exposure: 1.85, nearLight: 1.1, nearColor: [1, .75, .49] } });
  assert.ok(pub.key > .9 && pub.hemisphere > bare.hemisphere * 2, 'a lamp-lit room still leaves the hand in the dark');
  const lit = recordistHandLighting({ fieldCarry: true, fieldLight: { ...field, torchPower: 1 } });
  assert.ok(lit.fill > .3 && lit.rim > .2, 'the torch\'s own light thrown back does not reach the hand');
  const performance = read('../src/render/battle-hand-performance.js');
  assert.match(performance, /frame\.fieldCarry && frame\.lightOn \? 1 : 0/, 'a burning torch is still held upright like a baton');
});
