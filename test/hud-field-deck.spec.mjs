import test from 'node:test';
import assert from 'node:assert/strict';
import { takeSlotState } from '../src/render/field-deck.js';
import {
  controlHudPresentation,
  fieldDeckLayout,
  hudReminderVisible,
} from '../src/render/hud-layout.js';

test('field deck gives navigation a stable, non-overlapping territory', () => {
  const deck=fieldDeckLayout({cols:128,rows:50});
  assert.equal(deck.compact,false);
  assert.ok(deck.navigator.w>=30&&deck.navigator.h>=16);
  assert.equal(deck.navigator.x+deck.navigator.w,126);
  assert.ok(deck.takes.x+deck.takes.w<deck.navigator.x);
  assert.ok(deck.objective.x+deck.objective.w<deck.navigator.x);
  assert.ok(deck.monitor.y<deck.prompt.y);
});

test('field deck composes within a compact viewport instead of clipping', () => {
  const deck=fieldDeckLayout({cols:64,rows:30});
  assert.equal(deck.compact,true);
  assert.ok(deck.navigator.x>=2&&deck.navigator.y>=2);
  assert.ok(deck.navigator.x+deck.navigator.w<=62);
  assert.ok(deck.navigator.y+deck.navigator.h<deck.monitor.y);
  assert.equal(deck.prompt.y,28);
});

test('ordinary control legend returns only after input has gone idle', () => {
  assert.equal(hudReminderVisible({now:1000}),true);
  assert.equal(hudReminderVisible({now:10999,lastKeyAt:2000}),false);
  assert.equal(hudReminderVisible({now:11000,lastKeyAt:2000}),true);
  assert.equal(hudReminderVisible({now:12000,lastKeyAt:1000,lastPointerAt:5000}),false);
});

test('smart controls guarantee a discovery window even while the player is moving', () => {
  assert.deepEqual(controlHudPresentation({
    mode:'smart',now:17_999,introducedAt:1,lastKeyAt:17_990,lastPointerAt:17_995,
  }),{visible:true,compact:false,reason:'discovery'});
  assert.deepEqual(controlHudPresentation({
    mode:'smart',now:18_100,introducedAt:1,lastKeyAt:18_090,lastPointerAt:18_095,
  }),{visible:false,compact:false,reason:'active'});
  assert.deepEqual(controlHudPresentation({
    mode:'smart',now:30_000,introducedAt:1,lastKeyAt:20_000,lastPointerAt:20_500,
  }),{visible:true,compact:false,reason:'idle'});
});

test('smart controls yield to focused verbs while persistent controls collapse to the torch', () => {
  assert.deepEqual(controlHudPresentation({
    mode:'smart',now:2_000,introducedAt:1,contextual:true,
  }),{visible:true,compact:true,reason:'discovery-compact'});
  assert.deepEqual(controlHudPresentation({
    mode:'smart',now:20_000,introducedAt:1,contextual:true,
  }),{visible:false,compact:false,reason:'context'});
  assert.deepEqual(controlHudPresentation({
    mode:'persistent',now:2_000,introducedAt:1,contextual:true,
  }),{visible:true,compact:true,reason:'persistent-compact'});
  assert.deepEqual(controlHudPresentation({
    mode:'persistent',now:2_000,introducedAt:1,
  }),{visible:true,compact:false,reason:'persistent'});
  assert.deepEqual(controlHudPresentation({mode:'smart',now:2_000}),{
    visible:false,compact:false,reason:'not-introduced',
  });
});

test('take rail exposes five bounded completion slots', () => {
  assert.deepEqual(takeSlotState(2,5),[true,true,false,false,false]);
  assert.deepEqual(takeSlotState(99,5),[true,true,true,true,true]);
  assert.deepEqual(takeSlotState(-2,5),[false,false,false,false,false]);
});
