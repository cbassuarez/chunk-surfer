import test from 'node:test';
import assert from 'node:assert/strict';
import {playerCondition} from '../src/game/player-condition.js';
import {createPlayerConditionFeedback,playerConditionImpact} from '../src/game/player-condition-feedback.js';

const condition = (composure, ceiling = 40, extra = {}) => playerCondition({composure, ceiling, ...extra});
const run = {runId:'night:one'};

test('a one point loss produces one receipt even within the same display segment', () => {
  const feedback = createPlayerConditionFeedback();
  assert.equal(feedback.update(condition(40), .1, run).event, null);
  const hit = feedback.update(condition(39), .1, run);
  assert.equal(hit.event.kind, 'damage');
  assert.equal(hit.event.damage, 1);
  assert.equal(hit.serial, 1);
  assert.equal(hit.event.serial, 1);
  for (let i = 0; i < 10; i += 1) feedback.update(condition(39), .01, run);
  assert.equal(feedback.frame().serial, 1);
  assert.equal(feedback.frame().condition.value, 39);
});

test('damage rises quickly, releases, settles and expires without a wall clock', () => {
  const feedback = createPlayerConditionFeedback();
  feedback.update(condition(40), 0, run);
  feedback.update(condition(30), 0, run);
  assert.equal(feedback.frame().impact, 0);
  let frame = feedback.update(condition(30), .04, run);
  assert.equal(frame.impact, 1);
  assert.ok(frame.settle > .9);
  frame = feedback.update(condition(30), .45, run);
  assert.equal(frame.impact, 0);
  assert.ok(frame.settle > 0);
  frame = feedback.update(condition(30), 1.01, run);
  assert.equal(frame.settle, 0);
  assert.equal(frame.event.damage, 10);
  frame = feedback.update(condition(30), 1.5, run);
  assert.equal(frame.event, null);
  assert.equal(frame.eventAge, null);
  assert.equal(frame.serial, 1);
});

test('an injury at the minimum capacity is still a new lasting mark', () => {
  const feedback = createPlayerConditionFeedback();
  feedback.update(condition(20, 20, {injuries:4}), 0, run);
  const frame = feedback.update(condition(20, 20, {injuries:5}), 0, run);
  assert.equal(frame.event.kind, 'injury');
  assert.equal(frame.event.injuriesAdded, 1);
  assert.equal(frame.event.damage, 0);
  assert.equal(frame.wounds, 5);
  assert.equal(frame.strain, 0);
  assert.equal(frame.settle, 1);
});

test('a HUSH injury notice survives its unseen scare without replaying the impact', () => {
  const feedback = createPlayerConditionFeedback();
  feedback.update(condition(40), 0, run);
  let frame = feedback.update(condition(35, 35, {injuries:1}), 0, {...run, presented:false});
  assert.equal(frame.event.kind, 'injury');
  assert.equal(frame.eventAge, 0);
  assert.equal(frame.serial, 1);
  frame = feedback.update(condition(35, 35, {injuries:1}), .72, {...run, presented:false});
  assert.equal(frame.impact, 0);
  assert.equal(frame.eventAge, 0);
  assert.ok(frame.settle > 0);
  frame = feedback.update(condition(35, 35, {injuries:1}), .02, run);
  assert.equal(frame.event.kind, 'injury');
  assert.equal(frame.event.injuriesAdded, 1);
  assert.equal(frame.eventAge, .02);
  assert.equal(frame.impact, 0);
  assert.equal(frame.serial, 1);
  frame = feedback.update(condition(35, 35, {injuries:1}), 2.97, run);
  assert.notEqual(frame.event, null);
  frame = feedback.update(condition(35, 35, {injuries:1}), .02, run);
  assert.equal(frame.event, null);
  assert.equal(frame.serial, 1);
});

test('inactive time freezes both the impact and the unseen notice', () => {
  const feedback = createPlayerConditionFeedback();
  feedback.update(condition(40), 0, run);
  feedback.update(condition(30), 0, {...run, presented:false});
  const before = feedback.update(condition(30), .04, {...run, presented:false});
  const paused = feedback.update(condition(30), 30, {...run, active:false, presented:false});
  assert.equal(paused.impact, before.impact);
  assert.equal(paused.settle, before.settle);
  assert.equal(paused.eventAge, 0);
  const resumed = feedback.update(condition(30), .45, {...run, presented:false});
  assert.equal(resumed.impact, 0);
  assert.equal(resumed.eventAge, 0);
  assert.equal(resumed.serial, 1);
});

test('recovery reports its exact actual gain without an impact envelope', () => {
  const feedback = createPlayerConditionFeedback();
  feedback.update(condition(31, 35, {injuries:1}), 0, run);
  const frame = feedback.update(condition(35, 35, {injuries:1}), 0, run);
  assert.equal(frame.event.kind, 'recovery');
  assert.equal(frame.event.recovery, 4);
  assert.equal(frame.impact, 0);
  assert.equal(frame.settle, 0);
  assert.equal(frame.wounds, 1);
  assert.equal(frame.condition.woundStatus, 'injured');
});

test('inactive updates freeze timers and rebase unseen resource changes', () => {
  const feedback = createPlayerConditionFeedback();
  feedback.update(condition(40), 0, run);
  feedback.update(condition(30), 0, run);
  const before = feedback.update(condition(30), .1, run);
  let frame = feedback.update(condition(20), 20, {...run, active:false});
  assert.equal(frame.eventAge, before.eventAge);
  assert.equal(frame.impact, before.impact);
  assert.equal(frame.serial, 1);
  frame = feedback.update(condition(20), .1, run);
  assert.equal(frame.serial, 1);
  assert.equal(frame.event.damage, 10);
  assert.equal(frame.condition.value, 20);
  assert.ok(Math.abs(frame.eventAge - .2) < 1e-9);
});

test('run changes, hydration, and new authority establish a quiet baseline', () => {
  const feedback = createPlayerConditionFeedback();
  feedback.update(condition(40), 0, run);
  feedback.update(condition(30), 0, run);
  let frame = feedback.update(condition(20), .1, {runId:'night:two'});
  assert.equal(frame.event, null);
  assert.equal(frame.serial, 1);
  frame = feedback.update(condition(10), .1, {runId:'night:two', hydrating:true});
  assert.equal(frame.event, null);
  frame = feedback.update(condition(5, 45, {combat:true,owner:'battle:one'}), .1, {runId:'night:two'});
  assert.equal(frame.event, null);
  frame = feedback.update(condition(4, 45, {combat:true,owner:'battle:one'}), .1, {runId:'night:two'});
  assert.equal(frame.event.damage, 1);
  assert.equal(frame.serial, 2);
  frame = feedback.update(condition(1, 45, {combat:true,owner:'battle:two',injuries:1}), .1, {runId:'night:two'});
  assert.equal(frame.event, null);
  assert.equal(frame.wounds, 1);
});

test('suppressed authored sequences erase transients and cannot create fake healing', () => {
  const feedback = createPlayerConditionFeedback();
  const combat = {combat:true,owner:'battle:source'};
  feedback.update(condition(30, 40, combat), 0, run);
  feedback.update(condition(5, 40, combat), 0, run);
  let frame = feedback.update(condition(20, 40, combat), .1, {...run, suppressed:true});
  assert.equal(frame.event, null);
  assert.equal(frame.impact, 0);
  assert.equal(frame.settle, 0);
  frame = feedback.update(condition(20, 40, combat), .1, run);
  assert.equal(frame.event, null);
  assert.equal(frame.serial, 1);
});

test('the first live save sample after startup cannot replay an existing injury', () => {
  const feedback = createPlayerConditionFeedback(), sameRun = {runId:'persisted:night'};
  feedback.update(condition(40), .1, {...sameRun, suppressed:true});
  let frame = feedback.update(condition(35, 35, {injuries:1}), .1, sameRun);
  assert.equal(frame.event, null);
  assert.equal(frame.serial, 0);
  assert.equal(frame.impact, 0);
  assert.equal(frame.settle, 0);
  assert.equal(frame.wounds, 1);
  assert.equal(frame.condition.value, 35);
  frame = feedback.update(condition(34, 35, {injuries:1}), .1, sameRun);
  assert.equal(frame.event.kind, 'damage');
  assert.equal(frame.event.damage, 1);
  assert.equal(frame.serial, 1);
});

test('unavailable values, invalid elapsed time and reset remain safe', () => {
  const feedback = createPlayerConditionFeedback();
  feedback.update(condition(40), 0, run);
  feedback.update(condition(39), 0, run);
  for (const dt of [NaN, Infinity, -5, '1']) assert.equal(feedback.update(condition(39), dt, run).eventAge, 0);
  assert.equal(feedback.update(playerCondition(), 1, run).event, null);
  assert.equal(feedback.update(condition(20), 1, run).event, null);
  feedback.reset();
  assert.deepEqual(feedback.frame(), {condition:null,event:null,eventAge:null,impactAge:null,impact:0,force:0,settle:0,strain:0,wounds:0,serial:0});
  assert.equal(feedback.update(condition(1), 1, run).event, null);
});

test('physical severity follows actual loss while a new lasting injury remains unmistakable', () => {
  const body=condition(20,35,{injuries:1});
  const small=playerConditionImpact({damage:1},body),large=playerConditionImpact({damage:15},body);
  assert.ok(small>0&&small<large);assert.ok(large<=1);
  assert.ok(playerConditionImpact({damage:0,injuriesAdded:1},body)>large);
  assert.equal(playerConditionImpact({recovery:15},body),0);
  assert.equal(playerConditionImpact({damage:15},playerCondition()),0);
});

test('the observer snapshots input without mutating it', () => {
  const feedback = createPlayerConditionFeedback();
  const input = {...condition(40)};
  feedback.update(input, 0, run);
  input.value = 20;
  assert.equal(feedback.frame().condition.value, 40);
  const next = condition(39), before = JSON.stringify(next);
  feedback.update(next, .1, run);
  assert.equal(JSON.stringify(next), before);
  assert.equal(feedback.frame().event.damage, 1);
});
