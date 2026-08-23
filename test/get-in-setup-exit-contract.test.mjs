import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/main.js', 'utf8');

function sliceFunction(name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} exists`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next > start ? next : source.length);
}

test('setup exit set includes exterior and actual get-in exits', () => {
  const start = source.indexOf('const SETUP_EXIT_DOOR_IDS');
  assert.ok(start >= 0, 'setup exit set exists');
  const body = source.slice(start, source.indexOf('let exitDoorLockUntilMs', start));
  for (const token of [
    'GREY_DOOR_ID',
    "'front-main'",
    'DOCK_PORTAL.FOYER',
    'DOCK_PORTAL.SERVICE',
  ]) {
    assert.ok(body.includes(token), `setup exit set includes ${token}`);
  }
  assert.equal(body.includes("'bay-goods-pair'"),false,'the retired duplicate goods-door id is not a second setup exit');
});

test('pre-setup arrival closes a stale saved grey-door endpoint', () => {
  assert.match(source,
    /if\(which==='conservatory'&&storyMode&&!setupComplete\(\)\) FP\.setDoorOpen\(GREY_DOOR_ID,false\)/,
    'an older open personnel-door save cannot expose the get-in through the new goods pair');
});

test('grey-door memory beat is post-setup only and uses focused door context', () => {
  const body = sliceFunction('tryTheGreyDoor');
  assert.match(body, /!setupComplete\(\)/, 'grey-door beat is gated until setup is complete');
  assert.match(body, /focus\?\.doorWins/, 'grey-door beat consumes the focused door instead of a broad scan first');
  assert.match(body, /portal\?\.id!==GREY_DOOR_ID/, 'grey-door beat requires the actual grey door');
});

test('interact refuses setup exits before trying the grey-door beat', () => {
  const idxSetup = source.indexOf('trySetupExitDoor(focus)');
  const idxGrey = source.indexOf('tryTheGreyDoor(focus)');
  assert.ok(idxSetup >= 0, 'interact calls setup exit refusal');
  assert.ok(idxGrey >= 0, 'interact calls grey-door beat with focus');
  assert.ok(idxSetup < idxGrey, 'setup exit refusal outranks the grey-door beat');
});

test('movement setup gate can speak from intended exit door before collision crosses the zone seam', () => {
  const stepStart = source.indexOf('function step(dx,dy)');
  const geometryStart = source.indexOf('// Geometry blocks the step.', stepStart);
  assert.ok(stepStart >= 0 && geometryStart > stepStart, 'step movement setup gate can be located');
  const body = source.slice(stepStart, geometryStart);
  assert.match(body, /setupExitDoorAhead\(dx,dy\)/, 'movement checks the door ahead of the movement vector');
  assert.match(body, /movingDoor\|\|leavingHome/, 'movement blocks either door intent or actual zone departure');
  assert.match(body, /5\.5/, 'door search is widened for collision-guard distance');
});

test('setup exit guard owns only the get-in side of an exit', () => {
  for (const name of ['setupExitDoorFromFocus', 'setupExitDoorAhead']) {
    const body = sliceFunction(name);
    assert.match(body, /FP\.zoneAt\(px,py\)!==ZONE\.getIn/,
      `${name} does not intercept an arrival from the exterior dock zone`);
    assert.doesNotMatch(body, /if\(!atHomeThreshold\(px,py\)\)/,
      `${name} does not use the two-sided home threshold`);
  }
  const passive = sliceFunction('speakAtExitDoor');
  assert.match(passive, /FP\.zoneAt\(px,py\)!==ZONE\.getIn/,
    'passive exit speech is silent from the loading-bay side');
});

test('HUD does not offer the door-you-came-in-through beat until setup is complete', () => {
  assert.match(source, /const greyFromInside=setupComplete\(\)&&doorHud\.portal\.id===GREY_DOOR_ID/,
    'HUD grey-door label is post-setup only');
  assert.match(source, /const setupExit=setupExitDoorFromFocus\(interactionFocus\)/,
    'HUD has a setup-exit label path before ordinary door verbs');
});
