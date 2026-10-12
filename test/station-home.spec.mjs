import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStationHomeState, normalizeStationHomeState, serializeStationHomeState,
  stationHomePresentation, updateStationHome, STATION_HOME_LEAVE_METRES,
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
  assert.equal(aside.state.awayArmed, false);
  assert.equal(aside.presentation.windGain, 1);
  const snow = updateStationHome(frame.state, { atWindow: true, lookingTowardSnow: true });
  assert.equal(snow.state.attention, 0);
  assert.equal(snow.state.settled, false);
  assert.equal(snow.presentation.footstepGain, 1);
  assert.equal(snow.effects.depart, false);
});

test('leaving requires a deliberate outward distance toward snow, saved across small movement updates', () => {
  const arrived = updateStationHome(createStationHomeState(), windowView).state;
  const aside = updateStationHome(arrived, { atWindow: true, outwardDistance: 1 });
  assert.equal(aside.effects.depart, false);
  const turned = updateStationHome(arrived, { atWindow: true, lookingTowardSnow: true });
  assert.equal(turned.effects.depart, false);
  let walking = turned;
  for(let n=0;n<4;n++){
    walking=updateStationHome(serializeStationHomeState(walking.state),{lookingTowardSnow:true,outwardDistance:.085});
    assert.equal(walking.effects.depart,false,'a tiny movement tick must not choose departure');
  }
  assert.ok(walking.state.outwardDistance<STATION_HOME_LEAVE_METRES);
  walking=updateStationHome(walking.state,{lookingTowardSnow:true,outwardDistance:.085});
  assert.equal(walking.effects.depart, true);
  assert.equal(walking.state.departed, true);
  assert.equal(walking.presentation.attention, 0);
  assert.equal(updateStationHome(walking.state, windowView).effects.depart, false);
  const partial=updateStationHome(turned.state,{lookingTowardSnow:true,outwardDistance:.3});
  const lookedBack=updateStationHome(partial.state,windowView);
  assert.equal(lookedBack.state.outwardDistance,0);
  assert.equal(updateStationHome(lookedBack.state,{lookingTowardSnow:true,outwardDistance:.085}).effects.depart,false);
  const returned=updateStationHome(partial.state,{lookingTowardSnow:true,outwardDistance:-.01});
  assert.equal(returned.state.outwardDistance,0);
  assert.equal(updateStationHome(turned.state,{lookingTowardSnow:true,walkedAway:true}).effects.depart,false,'a boolean intent is not measured travel');
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
  const paused = updateStationHome(state, { paused: true, lookingTowardSnow: true, outwardDistance: 1, interactionDown: true, action: 'turn-away' });
  assert.deepEqual(paused.state, state);
  assert.deepEqual(paused.effects, { recognize: false, look: false, stay: false, depart: false });
  assert.equal(updateStationHome(createStationHomeState(), { paused: true, atWindow: true }).state.recognized, false);
  for (const attention of [NaN, Infinity, -Infinity, -5, 6, undefined]) {
    const normalized = normalizeStationHomeState({ recognized: true, attention, outwardDistance:attention, unknown: Infinity });
    assert.ok(Number.isFinite(normalized.attention));
    assert.ok(normalized.attention >= 0 && normalized.attention <= 1);
    assert.ok(Number.isFinite(normalized.outwardDistance));
    assert.ok(normalized.outwardDistance>=0&&normalized.outwardDistance<=STATION_HOME_LEAVE_METRES);
    assert.equal('unknown' in normalized, false);
    assert.deepEqual(JSON.parse(JSON.stringify(normalized)), normalized);
  }
  const leaving = createStationHomeState({ departed: true, settled: true, attention: 1 });
  assert.equal(leaving.attention, 0);
  assert.equal(leaving.settled, false);
  assert.deepEqual(stationHomePresentation(0), stationHomePresentation(leaving.attention));
});
