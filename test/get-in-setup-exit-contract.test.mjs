import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOOR_ARCHETYPES, DOOR_ARCHETYPE } from '../src/data/conservatory-doors.js';

const source = readFileSync('src/main.js', 'utf8');

function sliceFunction(name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} exists`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next > start ? next : source.length);
}

test('setup exit set excludes the goods doors and retains actual get-in exits', () => {
  const start = source.indexOf('const SETUP_EXIT_DOOR_IDS');
  assert.ok(start >= 0, 'setup exit set exists');
  const body = source.slice(start, source.indexOf('let exitDoorLockUntilMs', start));
  for (const token of [
    "'front-main'",
    'DOCK_PORTAL.FOYER',
    'DOCK_PORTAL.SERVICE',
  ]) {
    assert.ok(body.includes(token), `setup exit set includes ${token}`);
  }
  assert.equal(body.includes('GREY_DOOR_ID'), false, 'goods doors never route to the setup refusal');
  assert.equal(body.includes("'bay-goods-pair'"),false,'the retired duplicate goods-door id is not a second setup exit');
});

test('pre-setup arrival closes a stale saved grey-door endpoint', () => {
  assert.match(source,
    /if\(which==='conservatory'&&storyMode&&!setupComplete\(\)\) FP\.setDoorOpen\(GREY_DOOR_ID,false\)/,
    'an older open personnel-door save cannot expose the get-in through the new goods pair');
});

test('grey-door memory beat is setup-independent and uses focused door context', () => {
  const body = sliceFunction('tryTheGreyDoor');
  assert.doesNotMatch(body, /setupComplete\(\)/, 'grey-door beat is available before the level check');
  assert.match(body, /focus\?\.doorWins/, 'grey-door beat consumes the focused door instead of a broad scan first');
  assert.match(body, /portal\?\.id!==GREY_DOOR_ID/, 'grey-door beat requires the actual grey door');
  assert.match(body, /FP\.zoneAt\(px,py\)!==ZONE\.getIn/, 'the loading-bay side cannot trigger the inside memory beat');
  assert.match(body, /opening\.postDoor\.started/, 'the interaction records that the player deliberately began the beat');
});

test('interact checks setup exits before the distinct grey-door beat', () => {
  const idxSetup = source.indexOf('trySetupExitDoor(focus)');
  const idxGrey = source.indexOf('tryTheGreyDoor(focus)');
  assert.ok(idxSetup >= 0, 'interact calls setup exit refusal');
  assert.ok(idxGrey >= 0, 'interact calls grey-door beat with focus');
  assert.ok(idxSetup < idxGrey, 'other setup exits retain their refusal path');
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

test('HUD always offers the door-you-came-in-through beat from Get In', () => {
  assert.match(source, /const greyFromInside=doorHud\.portal\.id===GREY_DOOR_ID/,
    'HUD grey-door label is independent of setup');
  assert.match(source, /const setupExit=setupExitDoorFromFocus\(interactionFocus\)/,
    'HUD has a setup-exit label path before ordinary door verbs');
});

test('goods doors use the crossing-aware standard closer', () => {
  assert.equal(DOOR_ARCHETYPES[DOOR_ARCHETYPE.BAY_GOODS_PAIR].closer, 'standard');
});

test('departure cannot fire the grey-door memory beat', () => {
  const body = sliceFunction('noteDockTransitStep');
  assert.doesNotMatch(body, /postDoorThought\(/, 'walking away never owns the door interaction');
});

test('retirement is one-shot and restored from its save flag', () => {
  const seal=sliceFunction('sealTheGreyDoor');
  assert.match(seal,/if\(greyDoorRetired\(\)\) return false/,'a second interaction cannot retire the doorway twice');
  assert.match(source,/if\(which==='conservatory'&&flagTest\('door\.grey\.retired'\)\) FP\.retireDoor\(GREY_DOOR_ID\)/,
    'loading a retired-door save rebuilds the masonry state');
});
