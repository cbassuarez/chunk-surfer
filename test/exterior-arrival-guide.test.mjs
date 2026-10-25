import test from 'node:test';
import assert from 'node:assert/strict';
import { inputPromptLabel, promptLine } from '../src/game/bindings.js';
import { STORY_TARGET } from '../src/game/story-guidance.js';
import {
  EXTERIOR_ARRIVAL_GUIDE,
  freshExteriorArrivalGuideState,
  reduceExteriorArrivalGuide,
  exteriorArrivalGuide,
} from '../src/game/exterior-arrival-guide.js';

const fresh = () => freshExteriorArrivalGuideState();
const outside = (patch = {}) => ({
  storyMode: true, inExterior: true, flags: {}, device: 'keyboard',
  pointerCaptured: true, ...patch,
});
const packed = {
  'van.preparation.v1': true, 'bag.taken': true, 'map.taken': true,
  'kit.fitted': true, 'van.closed': true,
};
const move = distanceMetres => ({ type: 'move', accepted: true, voluntary: true, distanceMetres });
const look = (yawDelta, pitchDelta = 0) => ({ type: 'look', applied: true, voluntary: true, yawDelta, pitchDelta });

test('fresh arrival follows the existing van, packing, guard and goods-door stages', () => {
  const cases = [
    [{}, STORY_TARGET.van, 'van'],
    [{ 'van.preparation.v1': true, 'bag.taken': true }, STORY_TARGET.van, 'van'],
    [{ ...packed, 'van.closed': false }, STORY_TARGET.vanShut, 'van'],
    [packed, STORY_TARGET.lodge, 'lodge'],
    [{ ...packed, prologueDone: true }, STORY_TARGET.getIn, 'goods-door'],
  ];
  for (const [flags, target, stage] of cases) {
    const view = exteriorArrivalGuide(fresh(), outside({ flags }));
    assert.equal(view.targetId, target.id);
    assert.equal(view.objective, target.label);
    assert.equal(view.stage, stage);
  }
});

test('stale closed van flags cannot advance missing kit and the visible swing can keep its target', () => {
  for (const missing of ['bag.taken', 'map.taken', 'kit.fitted']) {
    const flags = { ...packed, [missing]: false };
    assert.equal(exteriorArrivalGuide(fresh(), outside({ flags })).targetId, STORY_TARGET.van.id);
  }
  assert.equal(exteriorArrivalGuide(fresh(), outside({ flags: packed, vanClosed: false })).targetId,
    STORY_TARGET.vanShut.id);
  // Old runs already carried the starter map and kit before this workbench.
  assert.equal(exteriorArrivalGuide(fresh(), outside({ flags: { 'bag.taken': true, 'van.closed': true } })).stage,
    'lodge');
});

test('only real accepted movement retires the move hint, with no input gate', () => {
  let state = fresh();
  for (const event of [
    { ...move(2), accepted: false }, { ...move(2), voluntary: false },
    { type: 'keydown', key: 'w' }, move(NaN), move(Infinity), move(-5), move('2'),
  ]) assert.deepEqual(reduceExteriorArrivalGuide(state, event, outside()), state);
  state = reduceExteriorArrivalGuide(state, move(.4), outside());
  assert.equal(state.moved, false);
  const original = structuredClone(state);
  const next = reduceExteriorArrivalGuide(state, move(.7), outside());
  assert.deepEqual(state, original, 'the caller-owned snapshot is never mutated');
  assert.equal(next.moved, true);
  assert.equal(next.moveMetres, EXTERIOR_ARRIVAL_GUIDE.moveMetres);
  assert.deepEqual(exteriorArrivalGuide(next, outside()).actionParts, []);
  assert.equal(exteriorArrivalGuide(next, outside()).pointerHint, 'MOVE MOUSE TO LOOK');
});

test('only voluntary applied look retires its hint, including signed mouse and controller turns', () => {
  let state = fresh();
  for (const event of [
    { ...look(1), voluntary: false }, { ...look(1), applied: false },
    { type: 'pointermove', movementX: 200 }, look(NaN, Infinity),
  ]) assert.deepEqual(reduceExteriorArrivalGuide(state, event, outside()), state);
  state = reduceExteriorArrivalGuide(state, look(-.08), outside());
  assert.equal(state.looked, false);
  state = reduceExteriorArrivalGuide(state, look(0, -.09), outside({ device: 'controller' }));
  assert.equal(state.looked, true);
  assert.equal(state.lookRadians, EXTERIOR_ARRIVAL_GUIDE.lookRadians);
  assert.deepEqual(exteriorArrivalGuide(state, outside()).actionParts, [{ action: 'move', label: 'MOVE' }]);
  assert.equal(exteriorArrivalGuide(state, outside()).pointerHint, null);
});

test('binding parts use canonical move and controller look, while mouse avoids an invented key', () => {
  const keyboard = exteriorArrivalGuide(fresh(), outside());
  assert.equal(inputPromptLabel(keyboard.actionParts[0].action, { device: 'keyboard' }), 'WASD / ARROWS');
  assert.equal(promptLine(keyboard.actionParts, { device: 'keyboard' }), '[WASD / ARROWS] MOVE');
  assert.equal(keyboard.pointerHint, 'MOVE MOUSE TO LOOK');
  assert.ok(keyboard.actionParts.every(part => part.action !== 'look'));
  assert.equal(exteriorArrivalGuide(fresh(), outside({ pointerCaptured: false })).pointerHint,
    'CLICK THE VIEW TO LOOK');
  const controller = exteriorArrivalGuide(fresh(), outside({ device: 'controller' }));
  assert.deepEqual(controller.actionParts.map(part => part.action), ['move', 'look']);
  assert.equal(promptLine(controller.actionParts, { device: 'controller' }),
    '[LEFT STICK / D-PAD] MOVE · [RIGHT STICK] LOOK');
  assert.equal(controller.pointerHint, null);
});

test('CONTINUE after the guard derives the goods-door objective without indoor levels copy', () => {
  const saved = reduceExteriorArrivalGuide(fresh(), move(1.2), outside());
  const resumed = freshExteriorArrivalGuideState(JSON.parse(JSON.stringify(saved)));
  const view = exteriorArrivalGuide(resumed, outside({ flags: { ...packed, prologueDone: true } }));
  assert.equal(view.stage, 'goods-door');
  assert.equal(view.objective, STORY_TARGET.getIn.label);
  assert.deepEqual(view.actionParts, []);
  assert.doesNotMatch(JSON.stringify(view), /levels|dark in here|mark studio|hold the check/i);
});

test('closed goods doors before the guard never manufacture entry progress', () => {
  const view = exteriorArrivalGuide(fresh(), outside({ flags: packed }));
  assert.equal(view.stage, 'lodge');
  assert.equal(view.objective, 'CHECK IN WITH THE GUARD');
  assert.equal(view.targetId, 'story:lodge');
  assert.equal(packed.prologueDone, undefined);
});

test('cinematic, modal, paused, interior and post-title contexts hide and cannot teach controls', () => {
  const inactive = [
    {}, outside({ storyMode: false }), outside({ inExterior: false }),
    outside({ blocked: true }), outside({ entryActive: true }), outside({ setupComplete: true }),
    outside({ flags: { 'title.shown': true } }),
    outside({ flags: { 'opening.driveTeaser.pending': true } }),
    outside({ flags: { 'opening.driveTeaser.consumed': true } }),
  ];
  for (const context of inactive) {
    assert.equal(exteriorArrivalGuide(fresh(), context), null);
    assert.deepEqual(reduceExteriorArrivalGuide(fresh(), move(5), context), fresh());
    assert.deepEqual(reduceExteriorArrivalGuide(fresh(), look(1), context), fresh());
  }
});

test('a pub or vigil detour preserves demonstrated controls and the existing next destination', () => {
  const context = outside({ flags: { ...packed, prologueDone: true } });
  let state = reduceExteriorArrivalGuide(fresh(), move(1), context);
  state = reduceExteriorArrivalGuide(state, look(.2), context);
  const before = structuredClone(state);
  assert.equal(exteriorArrivalGuide(state, { ...context, inExterior: false }), null, 'inside the pub owns its own display');
  state = reduceExteriorArrivalGuide(state, move(5), { ...context, inExterior: false });
  assert.equal(exteriorArrivalGuide(state, { ...context, blocked: true }), null, 'optional conversation owns its display');
  assert.deepEqual(state, before);
  const returned = exteriorArrivalGuide(state, context);
  assert.equal(returned.stage, 'goods-door');
  assert.deepEqual(returned.actionParts, []);
  assert.equal(returned.pointerHint, null);
  assert.equal(returned.objective, STORY_TARGET.getIn.label);
});

test('malformed or incompatible learning snapshots are bounded and cannot insert routes', () => {
  assert.deepEqual(freshExteriorArrivalGuideState({ schema: 99, moved: true, looked: true }), fresh());
  const restored = freshExteriorArrivalGuideState({ schema: 1, moveMetres: Infinity, lookRadians: -2,
    moved: 'yes', looked: false, stage: 'invented-quest' });
  assert.deepEqual(restored, fresh());
  const bounded = freshExteriorArrivalGuideState({ schema: 1, moveMetres: 200, lookRadians: 20 });
  assert.equal(bounded.moved, true);
  assert.equal(bounded.looked, true);
  assert.equal(bounded.moveMetres, EXTERIOR_ARRIVAL_GUIDE.moveMetres);
  assert.equal(bounded.lookRadians, EXTERIOR_ARRIVAL_GUIDE.lookRadians);
  assert.equal(exteriorArrivalGuide(bounded, outside()).stage, 'van');
});
