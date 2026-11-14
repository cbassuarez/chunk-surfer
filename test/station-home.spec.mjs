import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStationHomeState, normalizeStationHomeState, serializeStationHomeState,
  stationHomePresentation, updateStationHome,
} from '../src/game/station-home.js';

const windowView = { atWindow: true, lookingAtWindow: true, approach: 0.5 };

test('broad arrival recognizes once without a cloth hotspot or interaction', () => {
  const first = updateStationHome(createStationHomeState(), { atWindow: true });
  assert.equal(first.effects.recognize, true);
  assert.equal(first.state.recognized, true);
  assert.equal(first.effects.depart, false);
  assert.equal(updateStationHome(first.state, { atWindow: true }).effects.recognize, false);
  const restored = serializeStationHomeState(JSON.parse(JSON.stringify(first.state)));
  assert.equal(updateStationHome(restored, windowView).effects.recognize, false);
});

test('attention follows voluntary gaze, approach and settling rather than elapsed time', () => {
  let frame = updateStationHome(createStationHomeState(), windowView);
  const attention = frame.state.attention;
  for (let i = 0; i < 1000; i += 1) frame = updateStationHome(frame.state, windowView);
  assert.equal(frame.state.attention, attention);
  const closer = updateStationHome(frame.state, { ...windowView, approach: 1 });
  assert.ok(closer.state.attention > attention);
  frame = updateStationHome(closer.state, { ...windowView, action: 'settle', interactionDown: true });
  assert.equal(frame.state.attention, 1);
  assert.ok(frame.presentation.windGain < closer.presentation.windGain);
  assert.ok(frame.presentation.footstepGain < closer.presentation.footstepGain);
  const aside = updateStationHome(frame.state, { atWindow: true });
  assert.equal(aside.effects.depart, false);
  assert.equal(aside.presentation.windGain, 1);
  const snow = updateStationHome(frame.state, { atWindow: true, lookingTowardSnow: true });
  assert.equal(snow.state.attention, 0);
  assert.equal(snow.state.settled, false);
  assert.equal(snow.presentation.footstepGain, 1);
  assert.equal(snow.effects.depart, false);
});

test('walking back into snow releases attention without choosing the quick exit', () => {
  const arrived = updateStationHome(createStationHomeState(), windowView).state;
  const turned = updateStationHome(arrived, { atWindow: true, lookingTowardSnow: true });
  const away = updateStationHome(serializeStationHomeState(turned.state), { lookingTowardSnow: true });
  assert.equal(away.effects.depart, false);
  assert.equal(away.state.recognized, true);
  assert.equal(away.state.departed, false);
  assert.equal(away.presentation.attention, 0);
});

test('the exterior writing follows a view of the bedroom and survives reload', () => {
  const nearby = updateStationHome(createStationHomeState(), { atWindow: true }).state;
  assert.equal(nearby.viewedRoom, false);
  const looked = updateStationHome(nearby, { ...windowView, viewingRoom: true }).state;
  const restored = serializeStationHomeState(JSON.parse(JSON.stringify(looked)));
  assert.equal(updateStationHome(restored, { lookingTowardSnow: true }).state.viewedRoom, true);
});

test('LOOK stays repeatable, STAY is separate, and leaving never requires either',()=>{
  let frame=updateStationHome(createStationHomeState(),windowView);
  for(let n=0;n<3;n++){
    frame=updateStationHome(frame.state,{...windowView,interactionDown:true,action:'look'});
    assert.equal(frame.effects.look,true);assert.equal(frame.effects.depart,false);assert.equal(frame.state.settled,false);
    frame=updateStationHome(frame.state,windowView);
  }
  const stayed=updateStationHome(frame.state,{...windowView,interactionDown:true,action:'stay'});
  assert.equal(stayed.effects.stay,true);assert.equal(stayed.state.settled,true);assert.equal(stayed.presentation.attention,1);
  const outside=updateStationHome(stayed.state,{atWindow:true,lookingTowardSnow:true});
  assert.equal(outside.presentation.windGain,1);assert.equal(outside.effects.depart,false);
  const leave=updateStationHome(frame.state,{...windowView,interactionDown:true,action:'turn-away'});
  assert.equal(leave.effects.depart,true);
});

test('LOOK and explicit departure require separate fresh presses, including an arrival hold', () => {
  const arrival = updateStationHome(createStationHomeState(), { ...windowView, interactionDown: true, action: 'turn-away' });
  assert.equal(arrival.effects.depart, false);
  const released = updateStationHome(arrival.state, windowView);
  const looked = updateStationHome(released.state, { ...windowView, interactionDown: true, action: 'look' });
  assert.equal(looked.effects.look, true);
  const held = updateStationHome(looked.state, { ...windowView, interactionDown: true, action: 'turn-away' });
  assert.equal(held.effects.depart, false);
  const releaseAgain = updateStationHome(held.state, windowView);
  const departed = updateStationHome(releaseAgain.state, { ...windowView, interactionDown: true, action: 'turn-away' });
  assert.equal(departed.effects.depart, true);
});

test('pause freezes attention, recognition and input decisions; saved state is finite and bounded', () => {
  const state = updateStationHome(createStationHomeState(), windowView).state;
  const paused = updateStationHome(state, { paused: true, lookingTowardSnow: true, interactionDown: true, action: 'turn-away' });
  assert.deepEqual(paused.state, state);
  assert.deepEqual(paused.effects, { recognize: false, look: false, stay: false, depart: false });
  assert.equal(updateStationHome(createStationHomeState(), { paused: true, atWindow: true }).state.recognized, false);
  for (const attention of [NaN, Infinity, -Infinity, -5, 6, undefined]) {
    const normalized = normalizeStationHomeState({ recognized: true, attention, unknown: Infinity });
    assert.ok(Number.isFinite(normalized.attention));
    assert.ok(normalized.attention >= 0 && normalized.attention <= 1);
    assert.equal('unknown' in normalized, false);
    assert.deepEqual(JSON.parse(JSON.stringify(normalized)), normalized);
  }
  const leaving = createStationHomeState({ departed: true, settled: true, attention: 1 });
  assert.equal(leaving.attention, 0);
  assert.equal(leaving.settled, false);
  assert.deepEqual(stationHomePresentation(0), stationHomePresentation(leaving.attention));
});
